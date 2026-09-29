import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Dev-only endpoints for the editors: save the data file, list and upload .glb models.
// editor.html → /__lots (public/lots/lots.json, public/lots/models); street.html → /__street (public/street/furniture.json, public/street/models).
function endpoints(route,dir,file,valid){const root=path.resolve(dir);return server=>server.middlewares.use(route,(req,res)=>{
 const send=(code,body)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
 const body=()=>new Promise(r=>{const c=[];req.on('data',d=>c.push(d));req.on('end',()=>r(Buffer.concat(c)));});
 const models=path.join(root,'models');
 if(req.method==='GET'&&req.url==='/models')return send(200,fs.existsSync(models)?fs.readdirSync(models).filter(f=>/\.(glb|gltf)$/i.test(f)).sort():[]);
 if(req.method==='POST'&&req.url==='/save')return body().then(b=>{const data=JSON.parse(b);if(!valid(data))return send(400,{error:'invalid data'});
  fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,0).replace(/\{"id"/g,'\n{"id"'));send(200,{ok:true});}).catch(e=>send(400,{error:e.message}));
 const upload=req.method==='POST'&&req.url.match(/^\/models\/([\w .()%-]+\.glb)$/i);
 if(upload)return body().then(b=>{const name=path.basename(decodeURIComponent(upload[1]));if(!/^[\w .()-]+\.glb$/i.test(name))return send(400,{error:'bad name'});fs.mkdirSync(models,{recursive:true});fs.writeFileSync(path.join(models,name),b);send(200,{name});});
 send(404,{error:'unknown'});});}
const editors={name:'editors',configureServer(server){
 endpoints('/__lots','public/lots','lots.json',d=>Array.isArray(d.lots))(server);
 endpoints('/__street','public/street','furniture.json',d=>Array.isArray(d.items)&&Array.isArray(d.runs))(server);}};

// ponytail: relative base so the build works from any path (GitHub Pages project URL, file server, local folder).
export default defineConfig({
  base: './',
  plugins: [editors],
  build: { rollupOptions: { input: { main: 'index.html', editor: 'editor.html', street: 'street.html' } } },
});
