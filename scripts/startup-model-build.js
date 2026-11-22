import {createHash} from 'node:crypto';
import {mkdir,readdir,readFile,stat,writeFile} from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';
import {NodeIO,VertexLayout} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression,EXTTextureWebP} from '@gltf-transform/extensions';
import {MeshoptEncoder} from 'meshoptimizer';

const BUILD_VERSION='v4';
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

async function compressTexturesToWebp(doc,rel,phone){
 if(!/^(vehicles|characters)\/tripo\//.test(rel))return;
 const textures=doc.getRoot().listTextures();
 let converted=false;
 for(const tex of textures){
  const img=tex.getImage();
  if(!img)continue;
  const size=tex.getSize(),limit=phone?384:rel.startsWith('vehicles/tripo/')?512:Infinity;
  const resize=size&&Math.max(...size)>limit;
  if(!resize&&(img.byteLength<100*1024||tex.getMimeType()==='image/webp'))continue;
  let pipeline=sharp(img);
  if(resize)pipeline=pipeline.resize({width:limit,height:limit,fit:'inside',withoutEnlargement:true});
  const webp=await pipeline.webp({quality:82}).toBuffer();
  if(resize||webp.byteLength<img.byteLength*.85){
   tex.setImage(webp).setMimeType('image/webp');
   converted=true;
  }
 }
 if(converted)doc.createExtension(EXTTextureWebP).setRequired(false);
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
   if(!building)return 'export const mobileModels={};export default {}';
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

   const entries=[],mobileEntries=[];
   for(const file of [...new Set(files)].sort()){
    const filename=file==='hk-modern/kit.glb'?path.join(publicDir,file):path.join(assetDir,file);
    this.addWatchFile(filename);
    const st=await stat(filename);
    const variants=/^(vehicles|characters)\/tripo\//.test(file)?[false,true]:[false];
    for(const phone of variants){
     const cacheKey=createHash('sha1').update(`${BUILD_VERSION}:${phone}:${file}:${st.size}:${st.mtimeMs}`).digest('hex');
     const cacheFile=path.join(cacheDir,cacheKey+'.glb');
     let outBytes;
     try{
      outBytes=await readFile(cacheFile);
     }catch{
      const doc=await io.read(filename);
      if(file==='street-kit.glb')pruneStreetKit(doc);
      else if(file.startsWith('characters/tripo/colleagues/'))stripTurnClips(doc);
      await compressTexturesToWebp(doc,file,phone);
      const methods=EXTMeshoptCompression.EncoderMethod;
      const method=doc.getRoot().listAnimations().length?methods.FILTER:methods.QUANTIZE;
      doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method});
      outBytes=await io.writeBinary(doc);
      await writeFile(cacheFile,outBytes);
     }
     const ref=this.emitFile({type:'asset',name:(phone?'mobile-':'')+path.basename(file),source:outBytes});
     (phone?mobileEntries:entries).push(JSON.stringify(file)+':import.meta.ROLLUP_FILE_URL_'+ref);
    }
   }
   return 'export const mobileModels={'+mobileEntries.join(',')+'};export default {'+entries.join(',')+'}';
  }
 };
}
