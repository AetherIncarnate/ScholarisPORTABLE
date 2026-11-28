import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {unzipSync} from 'fflate';
import sharp from 'sharp';
import {importSeraph} from './seraph-import.mjs';
import {importCommunityGames} from './community-games-import.mjs';

const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const rules=await read('catalogue-rules.json');
const overrides=await read('catalogue-overrides.json');
const seraphAliases=await read('seraph-title-aliases.json');
const seraphGenreOverrides=await read('seraph-genre-overrides.json');
const existing=await read('existing-games.json');
const builtIn=await read('manifest.json');
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const key=s=>rules.aliases[norm(s)]||seraphAliases[norm(s)]||norm(s);
const seen=new Set([...existing,...(builtIn.games||[]).map(g=>g.name)].map(key));
const api='https://gitlab.com/api/v4/projects/89410220';
async function download(url){
 for(let attempt=1;attempt<=3;attempt++){
  try{const r=await fetch(url,{signal:AbortSignal.timeout(180000)});if(!r.ok)throw Error(`HTTP ${r.status}: ${url}`);return Buffer.from(await r.arrayBuffer());}
  catch(e){if(attempt===3)throw e;console.warn(`Download retry ${attempt}: ${e.message}`);await new Promise(r=>setTimeout(r,attempt*1500));}
 }
}
const seraphOnly=process.env.SERAPH_ONLY==='1';
if(seraphOnly&&process.env.VERCEL)throw new Error('SERAPH_ONLY is a local test mode and cannot be used in a Vercel build.');
await fs.rm('dist',{recursive:true,force:true});
await fs.mkdir('dist/library/assets',{recursive:true});
await fs.copyFile('index.html','dist/index.html');
await fs.copyFile('examrevision-home.html','dist/examrevision-home.html');
for(const f of ['FONT-LICENSE.txt','LUCIDE-LICENSE.txt'])await fs.copyFile(f,`dist/${f}`);
const games=[],skipped=[],warnings=[];
let upstreamRevision='not-built (SERAPH_ONLY test mode)';
if(!seraphOnly){
  // Resolve main once, then fetch BOTH archives from the SAME immutable commit.
  // Local ZIP inputs are for testing only; hosted builds always download upstream.
  const local=process.env.LOCAL_GAMES_ZIP&&process.env.LOCAL_IMAGES_ZIP;
  if(local&&process.env.VERCEL)throw new Error('LOCAL_GAMES_ZIP is test-only and cannot be used in a Vercel build.');
  upstreamRevision=local?'local-test':JSON.parse((await download(`${api}/repository/commits/main`)).toString()).id;
  if(!local&&!/^[0-9a-f]{40}$/.test(upstreamRevision))throw Error('Invalid upstream commit');
  console.log('GitLab upstream revision:',upstreamRevision);
  const [gameBytes,imageBytes]=local?await Promise.all([fs.readFile(process.env.LOCAL_GAMES_ZIP),fs.readFile(process.env.LOCAL_IMAGES_ZIP)]):await Promise.all(['games.zip','images-webp.zip'].map(f=>download(`${api}/repository/files/${f}/raw?ref=${upstreamRevision}`)));
  const gz=unzipSync(gameBytes), iz=unzipSync(imageBytes);
  const stem=s=>path.posix.basename(s).replace(/\.[^.]+$/,'');
  // Some upstream ZIP filenames contain UTF-8 decoded as Latin-1.
  function repair(s){if(!/[ÃÂâã]/.test(s))return s;const r=Buffer.from(s,'latin1').toString('utf8');return r.includes('\ufffd')?s:r;}
  const images=new Map(Object.entries(iz).filter(([n])=>/\.webp$/i.test(n)).map(([n,b])=>[norm(stem(repair(n))),b]));
  for(const [filename,bytes] of Object.entries(gz).filter(([n])=>/\.html?$/i.test(n)).sort(([a],[b])=>a.localeCompare(b))){
    const name=stem(repair(filename));const k=key(name);
    if(seen.has(k)){skipped.push(name);continue;}seen.add(k);
    const preset=overrides[name]||{};
    const id=preset.id||('repo:'+crypto.createHash('sha256').update(filename).digest('hex').slice(0,16));
    const slug=id.replace('repo:','');const html=Buffer.from(bytes).toString('utf8');
    const genre=preset.genre||rules.rules.find(([,p])=>new RegExp(p,'i').test(name))?.[0]||'Arcade';
    const touch=new RegExp(rules.mobile_titles,'i').test(name)||/addEventListener\s*\(\s*["']touch|ontouchstart\s*=|nipplejs|mobile-controls|touch-controls|touchControls/i.test(html);
    const device=preset.device||(touch?'mobile+pc':'pc');
    const image=images.get(norm(name));let thumbnail='';
    if(image){thumbnail=`library/assets/${slug}.webp`;await fs.writeFile(`dist/${thumbnail}`,await sharp(image).resize(192,192,{fit:'inside',withoutEnlargement:true}).webp({quality:62}).toBuffer());}
    else warnings.push(`No thumbnail: ${name}`);
    const htmlGzipUrl=`library/assets/${slug}.html.gz`;
    await fs.writeFile(`dist/${htmlGzipUrl}`,gzipSync(Buffer.from(html),{level:9}));
    games.push({id,name,genre,device,url:id,img:thumbnail,htmlGzipUrl,added:'2026-11-25',source:'repository'});
  }
}

const community=seraphOnly?{games:[],report:{sources:[],imported:[],duplicatesSkipped:[],excluded:{},warnings:[],rawBytes:0}}:await importCommunityGames({distDir:'dist',seen,keyForTitle:key});
games.push(...community.games);
const seraphSeen=new Set([...seen,...Object.keys(overrides).map(key),...(builtIn.games||[]).map(g=>key(g.name))]);
const seraph=await importSeraph({distDir:'dist',seen:seraphSeen,rules,overrides,genreOverrides:seraphGenreOverrides,mobilePattern:rules.mobile_titles,keyForTitle:key});
games.push(...seraph.games);
if(games.length<1)throw Error('No games imported; refusing an empty deployment.');
const manifest={revision:upstreamRevision,communitySources:community.report.sources,seraphRevision:seraph.report.revision,generatedAt:new Date().toISOString(),games};
await fs.writeFile('dist/library/manifest.json',JSON.stringify(manifest));
const buildReport={revision:upstreamRevision,seraphRevision:seraph.report.revision,existingCount:existing.length,imported:games.length,duplicatesSkipped:skipped.length+community.report.duplicatesSkipped.length+seraph.report.duplicatesSkipped.length,skipped,community:community.report,seraph:seraph.report,warnings,compatibility:'Support values are estimates. No complete gameplay verification is claimed.'};
await fs.writeFile('dist/library/build-report.json',JSON.stringify(buildReport,null,2));
console.log(`Built ${games.length-seraph.games.length-community.games.length} GitLab games, ${community.games.length} pinned GitHub community games and ${seraph.games.length} Seraph games; skipped ${buildReport.duplicatesSkipped} overlaps; ${seraph.report.warnings.length+community.report.warnings.length+warnings.length} warnings.`);
console.log('Static output: dist (games/assets are separate same-origin files; no runtime GitLab/GitHub requests).');
