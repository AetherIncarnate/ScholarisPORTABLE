import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import crypto from 'node:crypto';
import sharp from 'sharp';

const execFileAsync=promisify(execFile);
const CONFIG=JSON.parse(await fs.readFile(new URL('./seraph-import.json',import.meta.url),'utf8'));
const TREE_API='https://api.github.com/repos/a456pur/seraph/git/trees/';
const DAY='2026-11-25';
const safeRelative=p=>{
  const normalized=path.posix.normalize(p.replaceAll('\\','/'));
  if(!p||normalized==='..'||normalized.startsWith('../')||normalized.startsWith('/'))throw new Error(`Unsafe upstream path: ${p}`);
  return normalized;
};
const norm=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const decodeEntities=s=>String(s||'').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(_,e)=>{
  if(e[0]==='#')return String.fromCodePoint(e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10));
  return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'})[e.toLowerCase()]||_;
});
const stripTags=s=>decodeEntities(String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim());

export function parseGameCards(markup){
  const games=[];
  const card=/<a\b[^>]*\bhref=(["'])(.*?)\1[^>]*>\s*<div\b([^>]*)>([\s\S]*?)<\/div>\s*<\/a>/gi;
  for(const match of markup.matchAll(card)){
    const [,quote,href,attrs,body]=match;
    if(!href||href.startsWith('../')||/^(?:[a-z]+:|\/\/|#)/i.test(href))continue;
    const nameMatch=body.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if(!nameMatch)continue;
    const genre=attrs.match(/\bdata-genre=["']([^"']*)["']/i)?.[1]||'';
    const style=attrs.match(/\bstyle=(["'])(.*?)\1/i)?.[2]||'';
    const image=style.match(/background-image\s*:\s*url\(\s*["']?([^)'"\s]+)["']?\s*\)/i)?.[1]||'';
    const decodedHref=decodeURIComponent(href.split(/[?#]/)[0]);
    const safeHref=safeRelative(decodedHref);
    const pieces=safeHref.split('/');
    if(pieces.length<2||pieces[0]==='.'||pieces[0]==='..')continue;
    const folder=pieces[0];
    if(!/^[\p{L}\p{N}._ ' -]+$/u.test(folder))continue;
    games.push({name:stripTags(nameMatch[1]),genre:decodeEntities(genre).trim().toLowerCase(),href:safeHref,folder,image:decodeURIComponent(image)});
  }
  return games;
}

export function classifyGame({html='',files=[]}){
  const text=String(html);
  const lowerFiles=files.map(x=>typeof x==='string'?x:x.path).filter(Boolean);
  const emulator=/\b(?:emulatorjs|emulator\.js|EJS_[A-Z_]+|retroarch|emulatorjs\.min)\b/i.test(text)||lowerFiles.some(p=>/\.(?:nes|sfc|smc|gb|gbc|gba|nds|n64|z64|v64|3ds|cia|iso|chd)$/i.test(p));
  if(emulator)return 'console-emulator';
  const unity=/\b(?:UnityLoader|createUnityInstance|unityInstance)\b|\.data\.unityweb|\.wasm\.unityweb|\.framework\.js/i.test(text)||lowerFiles.some(p=>/\.(?:unityweb|data\.unityweb)$/i.test(p));
  if(unity)return 'unity';
  if(lowerFiles.some(p=>/\.swf$/i.test(p))||/\.swf(?:[?#"'\s]|$)|ruffle/i.test(text))return 'flash';
  return 'browser';
}

export function inferDevice(html,title,mobilePattern=''){
  const source=String(html);
  const strongTouch=/addEventListener\s*\(\s*["']touch(?:start|move|end)|ontouch(?:start|move|end)\s*=|\btouchstart\b|\bmobile-controls?\b|\bnipplejs\b|\bmaxTouchPoints\b|\bcreateTouch\b/i.test(source);
  const metadata=!!mobilePattern&&new RegExp(mobilePattern,'i').test(String(title));
  const viewport=/name=["']viewport["'][^>]*width\s*=\s*device-width|content=["'][^"']*width\s*=\s*device-width/i.test(source);
  return strongTouch||metadata&&viewport?'mobile+pc':'pc';
}

function extractLocalRefs(html){
  const refs=new Map();
  const tags=/<(script|link|img|audio|video|source|iframe|object|embed|track)\b[^>]*>/gi;
  for(const match of html.matchAll(tags)){
    const tag=match[1].toLowerCase(),attrs=match[0];
    const stylesheet=tag==='link'&&/rel=["'][^"']*stylesheet/i.test(attrs);
    if(tag==='link'&&!stylesheet&&!/rel=["'][^"']*(?:icon|preload|manifest)/i.test(attrs))continue;
    for(const attr of ['src','href','poster','data']){
      const value=attrs.match(new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`,'i'))?.[1];
      if(value){
        const required=['script','audio','video','source','iframe','object','embed'].includes(tag)||stylesheet;
        refs.set(value,{url:value,required:required||(refs.get(value)?.required||false)});
      }
    }
  }
  for(const m of html.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi))refs.set(m[1],{url:m[1],required:false});
  return [...refs.values()];
}
const isTracker=url=>/google-analytics|googletagmanager|static\.cloudflareinsights\.com\/beacon/i.test(url);
function stripAnalytics(html){
  return html
    .replace(/<script\b[^>]*src=["']https?:\/\/(?:www\.)?googletagmanager\.com\/gtag\/js\?[^"']*["'][^>]*>\s*<\/script>/gi,'')
    .replace(/<script\b[^>]*src=["']https?:\/\/static\.cloudflareinsights\.com\/beacon(?:\.min)?\.js[^"']*["'][^>]*>\s*<\/script>/gi,'')
    .replace(/<link\b[^>]*href=["']https?:\/\/fonts\.googleapis\.com\/css[^"']*["'][^>]*>/gi,'')
    .replace(/<link\b[^>]*href=["']https?:\/\/fonts\.gstatic\.com[^"']*["'][^>]*>/gi,'')
    .replace(/@import\s+(?:url\(\s*)?["']?https?:\/\/fonts\.googleapis\.com\/[^;]+;?/gi,'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,block=>{
      if(!/window\.dataLayer\s*=|function\s+gtag\s*\(/i.test(block)||!/gtag\s*\(\s*["']config["']/i.test(block))return block;
      const body=block.replace(/^<script\b[^>]*>|<\/script>$/gi,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').trim();
      const statements=body.split(/\n|;/).map(x=>x.trim()).filter(Boolean);
      if(statements.every(x=>/^(?:window\.dataLayer\s*=|function\s+gtag\s*\(|gtag\s*\(|const\s+gtag\s*=|var\s+gtag\s*=|let\s+gtag\s*=|\})/.test(x)))return '';
      return block;
    });
}
function rewriteBase(html,folder){
  const base=`/games/${encodeURIComponent(folder)}/`;
  if(/<base\b/i.test(html))return html.replace(/<base\b[^>]*>/i,`<base href="${base}">`);
  return html.replace(/<head\b[^>]*>/i,match=>`${match}\n<base href="${base}">`);
}
function genreFor(name,sourceGenre,rules,overrides,seraphGenreOverrides){
  const explicit=Object.entries(seraphGenreOverrides||{}).find(([n])=>norm(n)===norm(name))?.[1];
  if(explicit)return explicit;
  const exact=overrides[name]||Object.entries(overrides).find(([n])=>norm(n)===norm(name))?.[1];
  if(exact?.genre)return exact.genre;
  const hit=(rules.rules||[]).find(([genre,pattern])=>{if(genre==='Unclassified')return false;try{return new RegExp(pattern,'i').test(name)}catch{return false}});
  if(hit)return hit[0];
  const known={adventure:'Adventure',arcade:'Arcade',aracde:'Arcade',platformer:'Platformer',puzzle:'Puzzle',simulation:'Simulation',mobile:'Arcade'};
  return known[sourceGenre]||'Unclassified';
}
function thumbnailFromCardImage(image){
  if(!image)return '';
  try{
    const u=new URL(image,'https://seraph.invalid/games/');
    const p=decodeURIComponent(u.pathname).replace(/^\//,'');
    if(!p.startsWith('images/thumbnails/')&&!p.startsWith('images/other/'))return '';
    return safeRelative(p);
  }catch{return ''}
}
function collectTreeFiles(tree){
  if(tree.truncated)throw new Error('Seraph Git tree API returned a truncated tree; refusing an incomplete import.');
  return new Map(tree.tree.filter(x=>x.type==='blob').map(x=>[x.path,{size:Number(x.size)||0,sha:x.sha}]));
}
async function fetchJson(url){
  let last;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const r=await fetch(url,{headers:{'Accept':'application/vnd.github+json','User-Agent':'Scholaris-static-import'},signal:AbortSignal.timeout(90000)});
      if(!r.ok)throw new Error(`GitHub API HTTP ${r.status}`);
      return await r.json();
    }catch(e){last=e;if(attempt<3)await new Promise(r=>setTimeout(r,1500*attempt));}
  }
  throw last;
}
async function git(cwd,args){
  try{return await execFileAsync('git',args,{cwd,timeout:30*60*1000,maxBuffer:10*1024*1024});}
  catch(e){throw new Error(`git ${args.slice(0,3).join(' ')} failed: ${(e.stderr||e.message||'').toString().slice(-2000)}`)}
}
async function copyTree(source,destination,{excludeMaps=false}={}){
  await fs.cp(source,destination,{recursive:true,force:true,filter:async p=>{
    const rel=path.relative(source,p).replaceAll('\\','/');
    if(!rel)return true;
    if(excludeMaps&&(/\.map$/i.test(rel)||/^(?:README(?:\.md)?|package\.json)$/i.test(path.basename(rel))))return false;
    return true;
  }});
}
/**
 * Fetch a pinned Seraph snapshot, classify and deduplicate its launchers, then copy only
 * eligible folders and shared assets into the static dist tree. Returns a report + manifest games.
 */
export async function importSeraph({distDir='dist',seen=new Set(),rules={rules:[]},overrides={},genreOverrides={},mobilePattern='',keyForTitle=norm}={}){
  if(!/^([0-9a-f]{40})$/.test(CONFIG.commit))throw new Error('Invalid pinned Seraph commit.');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'scholaris-seraph-'));
  const report={source:'https://github.com/a456pur/seraph',revision:CONFIG.commit,selection:{maxGameBytes:CONFIG.maxGameBytes,scope:CONFIG.scope},candidateCount:0,imported:0,importedGames:[],duplicatesSkipped:[],excluded:{consoleEmulator:[],unity:[],tooLarge:[],invalidLaunch:[],missingRequiredFiles:[]},missingThumbnails:[],externalDependencies:[],warnings:[],rawBytes:0,validation:'Static source/asset checks only; no full gameplay or real-device verification.'};
  const imported=[];
  try{
    await git(process.cwd(),['clone','--filter=blob:none','--no-checkout','--depth=1',CONFIG.repository,temp]);
    await git(temp,['fetch','--filter=blob:none','--depth=1','origin',CONFIG.commit]);
    await fs.mkdir(path.join(temp,'.git','info'),{recursive:true});
    await fs.writeFile(path.join(temp,'.git','info','sparse-checkout'),'/games/index.html\n');
    await git(temp,['config','core.sparseCheckout','true']);
    await git(temp,['config','core.sparseCheckoutCone','false']);
    await git(temp,['checkout','--detach','FETCH_HEAD']);
    const actual=(await git(temp,['rev-parse','HEAD'])).stdout.trim();
    if(actual!==CONFIG.commit)throw new Error(`Pinned Seraph checkout mismatch (${actual}).`);
    const tree=collectTreeFiles(await fetchJson(`${TREE_API}${CONFIG.commit}?recursive=1`));
    const index=await fs.readFile(path.join(temp,'games/index.html'),'utf8');
    const cards=parseGameCards(index);
    if(cards.length<100)throw new Error(`Seraph index parse produced only ${cards.length} entries; refusing an incomplete import.`);
    const launcherPatterns=new Set(['/games/index.html','LICENSE',...cards.map(card=>`/games/${card.href}`)]);
    await fs.writeFile(path.join(temp,'.git','info','sparse-checkout'),[...launcherPatterns].join('\n')+'\n');
    await git(temp,['read-tree','-mu','HEAD']);
    const filesByFolder=new Map();
    for(const [sourcePath,metadata] of tree){
      const match=sourcePath.match(/^games\/([^/]+)\//);
      if(!match)continue;
      if(!filesByFolder.has(match[1]))filesByFolder.set(match[1],[]);
      filesByFolder.get(match[1]).push({path:sourcePath,size:metadata.size});
    }
    const selected=[];
    for(const card of cards){
      const files=filesByFolder.get(card.folder)||[];
      if(!files.length){report.excluded.invalidLaunch.push({name:card.name,reason:'No tracked files in the game folder.'});continue;}
      const launchPath=`games/${card.href}`;
      if(!tree.has(launchPath)){report.excluded.invalidLaunch.push({name:card.name,reason:`Launcher is not tracked: ${card.href}`});continue;}
      const pagePath=path.join(temp,launchPath);
      let html;
      try{html=await fs.readFile(pagePath,'utf8')}catch{report.excluded.invalidLaunch.push({name:card.name,reason:'Launcher did not resolve from the pinned tree.'});continue;}
      const type=classifyGame({html,files});
      if(type==='console-emulator'){report.excluded.consoleEmulator.push(card.name);continue;}
      if(type==='unity'){report.excluded.unity.push(card.name);continue;}
      const totalBytes=files.reduce((sum,x)=>sum+x.size,0);
      if(totalBytes>CONFIG.maxGameBytes){report.excluded.tooLarge.push({name:card.name,bytes:totalBytes});continue;}
      const normalized=keyForTitle(card.name);
      if(seen.has(normalized)){report.duplicatesSkipped.push({name:card.name,matchedKey:normalized});continue;}
      const missing=[];
      const optionalMissing=[];
      const gameExternalDependencies=[];
      const gameSharedFiles=new Set();
      const cleaned=stripAnalytics(html);
      for(const {url:ref,required} of extractLocalRefs(cleaned)){
        if(/^(?:data:|javascript:|mailto:|tel:|#|\/\/)/i.test(ref))continue;
        let u;try{u=new URL(ref,'https://seraph.invalid/'+launchPath)}catch{continue;}
        if(u.origin!=='https://seraph.invalid'){
          if(/^https?:$/.test(u.protocol)&&!isTracker(ref))gameExternalDependencies.push({game:card.name,url:`${u.origin}${u.pathname}`});
          continue;
        }
        const sourcePath=decodeURIComponent(u.pathname).replace(/^\//,'');
        if(!tree.has(sourcePath)){if(required)missing.push(ref);else optionalMissing.push(ref);}
        else if(!sourcePath.startsWith(`games/${card.folder}/`))gameSharedFiles.add(sourcePath);
      }
      const optionalAssetWarnings=[...new Set(optionalMissing)].filter(ref=>/\.(?:avif|gif|ico|jpe?g|json|mp3|mp4|ogg|png|svg|ttf|wav|webm|webp|woff2?|xml)(?:[?#]|$)/i.test(ref));
      if(optionalAssetWarnings.length)report.warnings.push(`${card.name}: optional assets missing: ${optionalAssetWarnings.slice(0,8).join(', ')}`);
      const externalRequired=[];
      for(const match of cleaned.matchAll(/<(script|iframe|object|embed|audio|video|source)\b[^>]*>/gi)){
        const value=match[0].match(/\b(?:src|data)\s*=\s*["'](https?:\/\/[^"']+)["']/i)?.[1];
        if(value&&!isTracker(value))externalRequired.push(value);
      }
      for(const match of cleaned.matchAll(/<link\b[^>]*>/gi)){
        const tag=match[0];
        if(!/rel=["'][^"']*stylesheet/i.test(tag))continue;
        const value=tag.match(/\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/i)?.[1];
        if(value&&!/fonts\.googleapis\.com/i.test(value))externalRequired.push(value);
      }
      if(missing.length||externalRequired.length){
        report.excluded.missingRequiredFiles.push({name:card.name,missing:[...new Set(missing)].slice(0,15),externalAssets:[...new Set(externalRequired)].slice(0,10)});
        continue;
      }
      seen.add(normalized);
      report.externalDependencies.push(...gameExternalDependencies);
      selected.push({...card,type,totalBytes,html,thumbnailPath:thumbnailFromCardImage(card.image),sharedAssets:[...gameSharedFiles],externalDependencies:gameExternalDependencies});
    }
    report.candidateCount=selected.length;
    const testLimit=Number(process.env.SERAPH_IMPORT_LIMIT||0);
    if(testLimit>0&&process.env.VERCEL)throw new Error('SERAPH_IMPORT_LIMIT is test-only and cannot be used on Vercel.');
    const toImport=testLimit>0?selected.slice(0,testLimit):selected;
    if(testLimit>0)report.warnings.push(`Test-only import limit active: ${testLimit} of ${selected.length} eligible games.`);
    const patterns=new Set(['/games/index.html','LICENSE']);
    for(const game of toImport){
      patterns.add(`/games/${game.folder}/`);
      if(game.thumbnailPath)patterns.add(`/${game.thumbnailPath}`);
    }
    if(toImport.some(g=>g.type==='flash'))patterns.add('/storage/ruffle/');
    for(const game of toImport)for(const sourcePath of game.sharedAssets)patterns.add(`/${sourcePath}`);
    for(const shared of ['storage/js','storage/css','storage/fonts','seraphim/assets','images/other'])patterns.add(`/${shared}/`);
    await fs.writeFile(path.join(temp,'.git','info','sparse-checkout'),[...patterns].join('\n')+'\n');
    await git(temp,['read-tree','-mu','HEAD']);
    await fs.mkdir(distDir,{recursive:true});
    for(const game of toImport){
      const source=path.join(temp,'games',game.folder);
      const dest=path.join(distDir,'games',game.folder);
      await copyTree(source,dest);
      const launcherOnDisk=path.join(dest,game.href.slice(game.folder.length+1));
      let launchHtml=stripAnalytics(await fs.readFile(launcherOnDisk,'utf8'));
      launchHtml=rewriteBase(launchHtml,game.folder);
      if(game.type==='flash'&&!/ruffle\.js/i.test(launchHtml)){
        const inject='<script src="/storage/ruffle/ruffle.js"></script>\n';
        launchHtml=/<\/head>/i.test(launchHtml)?launchHtml.replace(/<\/head>/i,`${inject}</head>`):inject+launchHtml;
      }
      await fs.writeFile(launcherOnDisk,launchHtml);
      let thumbnail='';
      if(game.thumbnailPath){
        const input=path.join(temp,game.thumbnailPath);
        try{
          const buffer=await fs.readFile(input);
          const id=`seraph-${crypto.createHash('sha256').update(game.folder).digest('hex').slice(0,14)}`;
          thumbnail=`library/assets/${id}.webp`;
          await fs.mkdir(path.dirname(path.join(distDir,thumbnail)),{recursive:true});
          await fs.writeFile(path.join(distDir,thumbnail),await sharp(buffer).resize(256,256,{fit:'inside',withoutEnlargement:true}).webp({quality:68}).toBuffer());
        }catch{report.missingThumbnails.push(game.name);}
      }else report.missingThumbnails.push(game.name);
      const id=`seraph:${game.folder}`;
      const key=overrides[game.name]||Object.entries(overrides).find(([n])=>norm(n)===norm(game.name))?.[1];
      const genre=genreFor(game.name,game.genre,rules,overrides,genreOverrides);
      const device=key?.device||inferDevice(game.html,game.name,mobilePattern);
      const relativeLauncher=game.href.slice(game.folder.length+1).split('/').map(encodeURIComponent).join('/');
      const launchUrl=`games/${encodeURIComponent(game.folder)}/${relativeLauncher}`;
      imported.push({id,name:game.name,genre,device,url:id,img:thumbnail,launchUrl,added:DAY,source:'seraph',sourceCommit:CONFIG.commit,sourcePath:`games/${game.href}`,license:'Upstream notices retained where supplied; root GPL-3.0 copied separately; per-title terms may differ',compatibility:'estimated'});
      report.importedGames.push({name:game.name,folder:game.folder,format:game.type,sourceGenre:game.genre,rawBytes:game.totalBytes,genre,device,launchUrl,thumbnail,externalDependencies:game.externalDependencies});
      report.rawBytes+=game.totalBytes;
    }
    if(toImport.some(g=>g.type==='flash')){
      const ruffleSource=path.join(temp,'storage/ruffle');
      if(!(await fs.stat(ruffleSource).catch(()=>null)))throw new Error('Flash games selected but the pinned Ruffle runtime is missing.');
      await copyTree(ruffleSource,path.join(distDir,'storage/ruffle'),{excludeMaps:true});
      const runtimeFiles=[...tree.keys()].filter(p=>p.startsWith('storage/ruffle/')&&!/\.map$/i.test(p)&&!/(?:^|\/)(?:README(?:\.md)?|package\.json)$/i.test(p));
      report.runtimeBytes=runtimeFiles.reduce((sum,p)=>sum+(tree.get(p)?.size||0),0);
      report.runtimeLicenses=['storage/ruffle/LICENSE_APACHE','storage/ruffle/LICENSE_MIT','storage/ruffle/ruffle.js.LICENSE.txt'].filter(p=>tree.has(p));
    }else{report.runtimeBytes=0;report.runtimeLicenses=[];}
    report.gameFoldersAndRuntimeBytes=report.rawBytes+report.runtimeBytes;
    for(const sourcePath of new Set(toImport.flatMap(g=>g.sharedAssets))){
      const src=path.join(temp,sourcePath);
      if(await fs.stat(src).catch(()=>null)){
        const dest=path.join(distDir,sourcePath);
        await fs.mkdir(path.dirname(dest),{recursive:true});
        await fs.copyFile(src,dest);
      }
    }
    for(const shared of ['storage/js','storage/css','storage/fonts','seraphim/assets','images/other']){
      const src=path.join(temp,shared);
      if(await fs.stat(src).catch(()=>null))await copyTree(src,path.join(distDir,shared),{excludeMaps:true});
    }
    const upstreamLicense=await git(temp,['show',`${CONFIG.commit}:LICENSE`]);
    await fs.mkdir(path.join(distDir,'library/seraph'),{recursive:true});
    await fs.writeFile(path.join(distDir,'library/seraph/UPSTREAM-LICENSE.txt'),upstreamLicense.stdout);
    report.imported=imported.length;
    report.externalDependencies=[...new Map(report.externalDependencies.map(x=>[`${x.game}\0${x.url}`,x])).values()];
    report.externalDependencies.sort((a,b)=>a.game.localeCompare(b.game)||a.url.localeCompare(b.url));
    report.warnings.push('PC/mobile support is inferred from markup; not verified on physical devices.');
    report.warnings.push('Games have static dependency/start-file checks only; gameplay is not certified.');
    await fs.mkdir(path.join(distDir,'library'),{recursive:true});
    await fs.writeFile(path.join(distDir,'library/seraph-build-report.json'),JSON.stringify(report,null,2));
    return {games:imported,report};
  }finally{
    await fs.rm(temp,{recursive:true,force:true});
  }
}
