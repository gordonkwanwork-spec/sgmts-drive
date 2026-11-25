// Chess tables at the A2 square, from Gordon's 3DGS capture (scripts/build-a2-chess.py): under each pergola a table, two chairs
// and their paved square with its yellow border and tactile strips. The splat is the visual (baked daylight, dimmed with the
// scene's lights); convex hulls of the same capture's mesh are invisible shadow casters and walk-around colliders.
import * as T from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {loadSplat,createSplatMesh} from './splat-lite.js';
import hull from './a2-chess-hull.json' with {type:'json'};

const DAY_LIGHT=3.1*.5+.42,LOAD_VIEW=150,VIEW=115;// light level the capture's baked colours stand for; splats beyond VIEW m are not drawn or sorted
let data=null;// one download shared by every set
export const CHESS_SIZE=hull.size;// the paved square, metres a side

// A set in its own frame: square floor centre at the origin, chairs on -Z / +Z.
export function chessSet(url=(import.meta.env?.BASE_URL??'/')+'assets/a2-chess.gsplat'){
 const root=new T.Group();root.name='A2 chess table set';
 const proxy=new T.MeshBasicMaterial({colorWrite:false,depthWrite:false});
 const parts=[['Chess table',hull.table],...hull.chairs.map((pts,i)=>['Chess chair '+(i+1),pts])].map(([name,pts])=>{const m=new T.Mesh(new ConvexGeometry(pts.map(p=>new T.Vector3(...p))),proxy);m.name=name;m.castShadow=true;root.add(m);return m;});
 // Backing slab in the capture's mean floor colour: wherever the splat floor is thin, it shows instead of the plaza paving.
 const slab=new T.Mesh(new T.PlaneGeometry(hull.size-.06,hull.size-.06).rotateX(-Math.PI/2),new T.MeshStandardMaterial({color:new T.Color(hull.floor),roughness:.9}));slab.name='Chess square backing';slab.position.y=.003;// below every floor splat (the splat sits 3 cm up), so it only fills gaps and never covers the capture
 slab.receiveShadow=true;root.add(slab);
 let splat=null,sun=null,ambient=null,requested=false;const here=new T.Vector3();
 // Relight and distance-cull once per frame from the always-drawn table proxy.
 parts[0].onBeforeRender=(renderer,scene,camera)=>{
  if(!camera.isPerspectiveCamera||camera.userData?.isFeed)return;
  const dist=camera.position.distanceTo(root.getWorldPosition(here));
  if(!requested&&dist<LOAD_VIEW){
   requested=true;
   (data??=loadSplat(url)).then(d=>{splat=createSplatMesh(d,{radius:1.6,center:new T.Vector3(0,.4,0),lod:[[14,1],[32,.45],[75,.2],[1e9,.1]]});splat.name='A2 chess splat';splat.position.y=.03;root.add(splat);splat.updateMatrix();splat.matrixAutoUpdate=false;splat.updateMatrixWorld(true);},e=>console.warn('A2 chess splat failed to load',e));
  }
  if(!splat)return;
  if(!sun)scene.traverse(o=>{if(o.isDirectionalLight&&!sun)sun=o;if(o.isHemisphereLight&&!ambient)ambient=o;});
  if(sun&&ambient)splat.userData.dim=T.MathUtils.clamp((sun.intensity*.5+ambient.intensity)/DAY_LIGHT,.06,1.15);
  splat.visible=dist<VIEW;};
 return root;
}
