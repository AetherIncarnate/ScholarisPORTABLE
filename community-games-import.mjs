import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';

const execFileAsync=promisify(execFile);
const CONFIG=JSON.parse(await fs.readFile(new URL('./community-games.json',import.meta.url),'utf8'));
const DAY='2026-11-25';
const normalize=s=>String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const safePath=p=>{
  const normalized=path.posix.normalize(String(p||'').replaceAll('\\','/'));
  if(!p||normalized==='..'||normalized.startsWith('../')||normalized.startsWith('/'))throw new Error(`Unsafe community-game path: ${p}`);
  return normalized;
};

export function validateCommunityConfig(config=CONFIG){
  if(!Number.isSafeInteger(config.maxGameBytes)||config.maxGameBytes<1)throw new Error('Invalid community game size cutoff.');
  if(!Array.isArray(config.sources)||!config.sources.length)throw new Error('No community game sources configured.');
  const slugs=new Set();
  for(const source of config.sources){
    const match=String(source.repository||'').match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\.git$/);
    if(!match)throw new Error(`Community source must be a GitHub HTTPS repository: ${source.repository}`);
    if(!/^[0-9a-f]{40}$/.test(source.commit||''))throw new Error(`Invalid pinned commit for ${source.repository}`);
    if(!/^MIT$|^GPL-3\.0$|^Apache-2\.0$/.test(source.licenseId||''))throw new Error(`Unsupported or missing license identifier for ${source.repository}`);
    safePath(source.licenseFile);
    if(!Array.isArray(source.games)||!source.games.length)throw new Error(`No games configured for ${source.repository}`);
    for(const game of source.games){
      if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.slug||''))throw new Error(`Unsafe community game slug: ${game.slug}`);
      if(slugs.has(game.slug))throw new Error(`Duplicate community game slug: ${game.slug}`);
      slugs.add(game.slug);
      safePath(game.sourcePath);
      safePath(game.launchPath);
      if(game.thumbnailPath)safePath(game.thumbnailPath);
      if(!game.name||!game.genre||!['pc','mobile+pc'].includes(game.device))throw new Error(`Incomplete game metadata for ${game.slug}`);
    }
  }
  return true;
}

async function git(cwd,args){
  try{return await execFileAsync('git',args,{cwd,timeout:30*60*1000,maxBuffer:10*1024*1024});}
  catch(e){throw new Error(`git ${args.slice(0,3).join(' ')} failed: ${(e.stderr||e.message||'').toString().slice(-2000)}`)}
}
async function fetchJson(url){
  let last;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response=await fetch(url,{headers:{'Accept':'application/vnd.github+json','User-Agent':'Scholaris-community-game-import'},signal:AbortSignal.timeout(90000)});
      if(!response.ok)throw new Error(`GitHub API HTTP ${response.status}`);
      return await response.json();
    }catch(error){last=error;if(attempt<3)await new Promise(resolve=>setTimeout(resolve,1200*attempt));}
  }
  throw last;
}
function repoDetails(url){const [,owner,repo]=url.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\.git$/);return {owner,repo};}
function sourceFiles(tree,sourcePath){
  const prefix=sourcePath==='.'?'':`${sourcePath.replace(/\/$/,'')}/`;
  return tree.filter(file=>file.type==='blob'&&(sourcePath==='.'||file.path.startsWith(prefix)));
}
function resolveLocal(sourceLaunchPath,reference){
  try{
    const decoded=decodeURIComponent(reference.split(/[?#]/)[0]);
    return path.posix.normalize(path.posix.join(path.posix.dirname(sourceLaunchPath),decoded));
  }catch{return '';}
}
function launchReferences(html){
  const refs=[];
  for(const match of html.matchAll(/<(script|link|img|audio|video|source|iframe|object|embed|track)\b[^>]*>/gi)){
    const tag=match[1].toLowerCase(),attrs=match[0];
    const isStylesheet=tag==='link'&&/rel=["'][^"']*stylesheet/i.test(attrs);
    const enabled=['script','iframe','audio','video','source','object','embed'].includes(tag)||isStylesheet;
    const attr=['object','embed'].includes(tag)?'data':'href';
    const value=attrs.match(new RegExp(`\\b${attr}\\s*=\\s*(["'])(.*?)\\1`,'i'))?.[2] || (attr==='href'?attrs.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2]:undefined);
    if(value)refs.push({value,required:enabled});
  }
  return refs;
}
async function copyGameFolder(source,destination){
  await fs.mkdir(path.dirname(destination),{recursive:true});
  await fs.cp(source,destination,{recursive:true,force:true,filter:async src=>{
    const base=path.basename(src);
    if(base==='.git'||/^(?:README(?:\.[^.]+)?|CONTRIBUTING(?:\.[^.]+)?|Rakefile)$/i.test(base))return false;
    return true;
  }});
}

export async function importCommunityGames({distDir='dist',seen=new Set(),keyForTitle=normalize}={}){
  validateCommunityConfig();
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'scholaris-community-'));
  const games=[];
  const report={sources:[],imported:[],duplicatesSkipped:[],excluded:{tooLarge:[],invalidLaunch:[],missingRequiredFiles:[],externalRequired:[]},warnings:[],rawBytes:0,validation:'Pinned-source and static launcher checks only; no complete gameplay or real-device verification.'};
  try{
    for(const source of CONFIG.sources){
      const {owner,repo}=repoDetails(source.repository);
      const repoKey=`${owner}-${repo}`.toLowerCase();
      const repoTemp=path.join(temp,repoKey);
      await git(process.cwd(),['clone','--filter=blob:none','--no-checkout','--depth=1',source.repository,repoTemp]);
      await git(repoTemp,['fetch','--filter=blob:none','--depth=1','origin',source.commit]);
      const patterns=new Set([`/${source.licenseFile}`]);
      for(const game of source.games){
        patterns.add(game.sourcePath==='.'?'/*':`/${game.sourcePath.replace(/\/$/,'')}/`);
        if(game.thumbnailPath)patterns.add(`/${game.thumbnailPath}`);
      }
      await fs.mkdir(path.join(repoTemp,'.git','info'),{recursive:true});
      await fs.writeFile(path.join(repoTemp,'.git','info','sparse-checkout'),[...patterns].join('\n')+'\n');
      await git(repoTemp,['config','core.sparseCheckout','true']);
      await git(repoTemp,['config','core.sparseCheckoutCone','false']);
      await git(repoTemp,['checkout','--detach','FETCH_HEAD']);
      const actual=(await git(repoTemp,['rev-parse','HEAD'])).stdout.trim();
      if(actual!==source.commit)throw new Error(`Pinned community source mismatch for ${source.repository}: ${actual}`);
      const treeResponse=await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${source.commit}?recursive=1`);
      if(treeResponse.truncated)throw new Error(`Git tree for ${source.repository} is truncated; refusing an incomplete import.`);
      const tree=treeResponse.tree||[];
      const tracked=new Set(tree.filter(entry=>entry.type==='blob').map(entry=>entry.path));
      const licensePath=safePath(source.licenseFile);
      if(!tracked.has(licensePath))throw new Error(`Pinned community source has no configured license file: ${source.repository}/${licensePath}`);
      const licenseDest=`library/licenses/community-${repoKey}-LICENSE.txt`;
      await fs.mkdir(path.join(distDir,'library/licenses'),{recursive:true});
      await fs.copyFile(path.join(repoTemp,licensePath),path.join(distDir,licenseDest));
      const sourceReport={repository:source.repository.replace(/\.git$/,''),revision:source.commit,license:source.licenseId,games:[]};
      for(const game of source.games){
        const titleKey=keyForTitle(game.name);
        if(seen.has(titleKey)){report.duplicatesSkipped.push({name:game.name,source:source.repository});continue;}
        const sourcePath=safePath(game.sourcePath);
        const sourceLaunchPath=path.posix.join(sourcePath==='.'?'':sourcePath,safePath(game.launchPath));
        const launchPath=safePath(sourceLaunchPath);
        const launchFile=tree.find(file=>file.path===launchPath&&file.type==='blob');
        if(!launchFile){report.excluded.invalidLaunch.push({name:game.name,reason:`Pinned launcher missing: ${launchPath}`});continue;}
        const sourceFolderFiles=sourceFiles(tree,sourcePath);
        const bytes=sourceFolderFiles.reduce((sum,file)=>sum+(Number(file.size)||0),0);
        if(bytes>CONFIG.maxGameBytes){report.excluded.tooLarge.push({name:game.name,bytes,source:source.repository});continue;}
        const launcher=await fs.readFile(path.join(repoTemp,launchPath),'utf8');
        const missing=[];
        const external=[];
        for(const ref of launchReferences(launcher)){
          if(/^(?:data:|javascript:|mailto:|tel:|#)/i.test(ref.value))continue;
          let parsed;
          try{parsed=new URL(ref.value,'https://community.invalid/'+launchPath)}catch{continue;}
          if(parsed.origin!=='https://community.invalid'){
            if(ref.required&&/^https?:$/.test(parsed.protocol))external.push(ref.value);
            continue;
          }
          const localPath=resolveLocal(launchPath,ref.value);
          if(localPath==='..'||localPath.startsWith('../')||!tracked.has(localPath))if(ref.required)missing.push(ref.value);
        }
        if(missing.length){report.excluded.missingRequiredFiles.push({name:game.name,missing:[...new Set(missing)]});continue;}
        if(external.length){report.excluded.externalRequired.push({name:game.name,dependencies:[...new Set(external)]});continue;}
        const destination=path.join(distDir,'games/community',game.slug);
        const sourceFolder=path.join(repoTemp,sourcePath==='.'?'':sourcePath);
        await copyGameFolder(sourceFolder,destination);
        let thumbnail='';
        if(game.thumbnailPath){
          const thumbPath=safePath(game.thumbnailPath);
          if(tracked.has(thumbPath)){
            const thumbName=`library/assets/community-${game.slug}.webp`;
            await fs.mkdir(path.join(distDir,'library/assets'),{recursive:true});
            await fs.writeFile(path.join(distDir,thumbName),await sharp(path.join(repoTemp,thumbPath)).resize(192,192,{fit:'inside',withoutEnlargement:true}).webp({quality:62}).toBuffer());
            thumbnail=thumbName;
          }else report.warnings.push(`${game.name}: configured thumbnail not found (${thumbPath}).`);
        }
        const launchUrl=`/games/community/${game.slug}/${game.launchPath.replace(/^\.\//,'')}`;
        const manifestGame={id:`community:${game.slug}`,name:game.name,url:`community:${game.slug}`,launchUrl,img:thumbnail,genre:game.genre,device:game.device,compatibility:'estimated',sameOriginAssets:true,added:DAY,source:'repository',sourceName:`GitHub · ${owner}/${repo}`,sourceUrl:source.repository.replace(/\.git$/,''),sourceRevision:source.commit,license:source.licenseId,licenseUrl:`/${licenseDest}`};
        games.push(manifestGame);
        seen.add(titleKey);
        report.rawBytes+=bytes;
        const details={name:game.name,slug:game.slug,bytes,source:source.repository.replace(/\.git$/,''),revision:source.commit,license:source.licenseId,launchUrl,deviceEstimate:game.device};
        report.imported.push(details);
        sourceReport.games.push(details);
      }
      report.sources.push(sourceReport);
    }
  }finally{
    await fs.rm(temp,{recursive:true,force:true});
  }
  return {games,report};
}

validateCommunityConfig();
