import {createHash} from 'node:crypto';
import {mkdir,readdir,readFile,stat,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {NodeIO,VertexLayout} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression,EXTTextureWebP} from '@gltf-transform/extensions';
import {MeshoptEncoder} from 'meshoptimizer';

const execFileAsync=promisify(execFile);
const BUILD_VERSION='v2';
const DEAD_KIT_NODES=/^(pedestrian_\d+|car|taxi|van|truck|bus|seated_rider)$/;

function disposeSubtree(node,disposed){
 for(const child of [...node.listChildren()])disposeSubtree(child,disposed);
 disposed.add(node);
 node.dispose();
}

function pruneUnreferenced(doc){
 const root=doc.getRoot();
 for(const pass of [0,1,2]){
  for(const anim of root.listAnimations()){
   let liveChannels=0;
   for(const ch of [...anim.listChannels()]){
    const target=ch.getTargetNode();
    if(!target||target.isDisposed())ch.dispose();else liveChannels++;
   }
   for(const sp of [...anim.listSamplers()])if(sp.listParents().filter(p=>p!==root&&p!==anim).length===0)sp.dispose();
   if(liveChannels===0)anim.dispose();
  }
  for(const list of [root.listSkins(),root.listMeshes(),root.listMaterials(),root.listTextures(),root.listAccessors()]){
   for(const item of list)if(item.listParents().filter(p=>p!==root).length===0)item.dispose();
  }
 }
}

function pruneStreetKit(doc){
 const root=doc.getRoot(),disposed=new Set();
 for(const node of [...root.listNodes()])if(!node.isDisposed()&&DEAD_KIT_NODES.test(node.getName()))disposeSubtree(node,disposed);
 pruneUnreferenced(doc);
}

function stripTurnClips(doc){
 for(const anim of [...doc.getRoot().listAnimations()])if(anim.getName().split('.')[0]==='turn')anim.dispose();
 pruneUnreferenced(doc);
}

async function compressTexturesToWebp(doc,rel){
 if(!/^(vehicles|characters)\/tripo\//.test(rel))return;
 const textures=doc.getRoot().listTextures();
 let converted=0;
 const workDir=path.join(tmpdir(),`sgmts-webp-${process.pid}-${Math.random().toString(36).slice(2,8)}`);
 let dirMade=false;
 try{
  for(let i=0;i<textures.length;i++){
   const tex=textures[i],img=tex.getImage();
   if(!img||img.byteLength<100*1024||tex.getMimeType()==='image/webp')continue;
   if(!dirMade){await mkdir(workDir,{recursive:true});dirMade=true;}
   const ext=tex.getMimeType()==='image/png'?'.png':'.jpg';
   const inFile=path.join(workDir,`tex-${i}${ext}`),outFile=path.join(workDir,`tex-${i}.webp`);
   await writeFile(inFile,img);
   const size=tex.getSize();
   const args=['-q','82'];
   if(rel.startsWith('vehicles/tripo/')&&size&&Math.max(size[0],size[1])>512)args.push('-resize','512','512');
   args.push(inFile,'-o',outFile);
   await execFileAsync('cwebp',args);
   const webp=await readFile(outFile);
   if(webp.byteLength<img.byteLength*.85){tex.setImage(new Uint8Array(webp)).setMimeType('image/webp');converted++;}
  }
  if(converted)doc.createExtension(EXTTextureWebP).setRequired(false);
 }catch{
  // cwebp optional: keep original textures if unavailable or unsupported
 }finally{
  if(dirMade)await import('node:fs/promises').then(fs=>fs.rm(workDir,{recursive:true,force:true})).catch(()=>{});
 }
}

// Ship smaller, Meshopt-compressed, content-hashed copies for the game. Editors and tests keep reading public/.
export function startupModelBuild(){
 const id='virtual:startup-model-urls';
 let building=false,publicDir,cacheDir;
 return {
  name:'startup-model-urls',
  configResolved(config){
   building=config.command==='build';
   publicDir=config.publicDir;
   cacheDir=path.resolve(config.root,'node_modules/.cache/startup-models');
  },
  resolveId(source){if(source===id)return '\0'+id;},
  async load(source){
   if(source!=='\0'+id)return;
   if(!building)return 'export default {}';
   const assetDir=path.join(publicDir,'assets');
   const files=[];
   for(const f of await readdir(assetDir))if(/^(street-kit|art|tuen-ma-train|green-bin|station-A[1-7])\.glb$/.test(f))files.push(f);
   for(const sub of ['characters/tripo/colleagues','characters/tripo/pedestrians','characters/tripo/pets','vehicles/tripo']){
    for(const f of await readdir(path.join(assetDir,sub)))if(f.endsWith('.glb'))files.push(sub+'/'+f);
   }
   for(const f of ['characters/tripo/schoolboy-white-uniform-blue-backpack-walk.glb','characters/tripo/schoolgirl-blue-uniform-walk.glb']){
    files.push(f);
   }
   files.push('hk-modern/kit.glb');

   await mkdir(cacheDir,{recursive:true});
   const io=new NodeIO().setVertexLayout(VertexLayout.SEPARATE).registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({'meshopt.encoder':MeshoptEncoder});
   await MeshoptEncoder.ready;

   const entries=[];
   for(const file of [...new Set(files)].sort()){
    const filename=file==='hk-modern/kit.glb'?path.join(publicDir,file):path.join(assetDir,file);
    this.addWatchFile(filename);
    const st=await stat(filename);
    const cacheKey=createHash('sha1').update(`${BUILD_VERSION}:${file}:${st.size}:${st.mtimeMs}`).digest('hex');
    const cacheFile=path.join(cacheDir,cacheKey+'.glb');
    let outBytes;
    try{
     outBytes=await readFile(cacheFile);
    }catch{
     const doc=await io.read(filename);
     if(file==='street-kit.glb')pruneStreetKit(doc);
     else if(file.startsWith('characters/tripo/colleagues/'))stripTurnClips(doc);
     await compressTexturesToWebp(doc,file);
     const methods=EXTMeshoptCompression.EncoderMethod;
     const method=doc.getRoot().listAnimations().length?methods.FILTER:methods.QUANTIZE;
     doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method});
     outBytes=await io.writeBinary(doc);
     await writeFile(cacheFile,outBytes);
    }
    const ref=this.emitFile({type:'asset',name:path.basename(file),source:outBytes});
    entries.push(JSON.stringify(file)+':import.meta.ROLLUP_FILE_URL_'+ref);
   }
   return 'export default {'+entries.join(',')+'}';
  }
 };
}
