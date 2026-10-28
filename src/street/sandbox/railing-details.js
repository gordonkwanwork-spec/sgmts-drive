import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// H2131D: Ø40 / 15 mm dome stiffeners, R21 crown, Ø18 counterbore,
// Ø11 through-hole, and recessed M10 Torx bolt with opposite shear nut.
// Sandbox adapter replaces the kit's square clips without altering the GLB.
// omit: [[side,y]] fixings with no panel stile beside them, e.g. the 0.2 m level next to a raised-bottom panel.
export function type2PostParts(galvanised,omit=[]){
 const steel=new T.MeshStandardMaterial({color:0x9da5a5,metalness:.7,roughness:.38});
 const recess=new T.MeshStandardMaterial({color:0x333c3c,metalness:.3,roughness:.6});
 const parts=[];
 const add=(geometry,material,role)=>parts.push({geometry,material,role});
 // Continuous post enters the paving; there is no exposed base plate.
 // Top stops 40 mm below the 1.0 m panel top (site photos: post sits under the top rails).
 add(new T.BoxGeometry(.04,1.16,.04).translate(0,.38,0),galvanised,'40 mm square post');
 const crown=r=>Math.sqrt(.021**2-r**2)-Math.sqrt(.021**2-.02**2);
 const profile=[new T.Vector2(.0055,0),new T.Vector2(.02,0),new T.Vector2(.02,.001)];
 for(let i=0;i<=4;i++){const r=.0195-(.0195-.009)*i/4;profile.push(new T.Vector2(r,crown(r)));}
 profile.push(new T.Vector2(.009,.006),new T.Vector2(.0055,.006),new T.Vector2(.0055,0));
 const dome=new T.LatheGeometry(profile,8);
 const torx=new T.Shape();
 for(let i=0;i<=72;i++){const a=i*Math.PI/36,r=.0032+.0007*Math.cos(6*a),x=r*Math.cos(a),y=r*Math.sin(a);if(i===0)torx.moveTo(x,y);else torx.lineTo(x,y);}
 // Local Z follows the fence. Fixings belong on the two side faces,
 // leaving the pedestrian-facing local X faces clear.
 for(const y of [.2,.535,.87])for(const side of [-1,1]){
  if(omit.some(([s,level])=>s===side&&level===y))continue;
  add(dome.clone().rotateX(side*Math.PI/2).translate(0,y,side*.035),steel,'rounded dome stiffener');
  const head=side===1?new T.CylinderGeometry(.0085,.0085,.005,12):new T.CylinderGeometry(.007,.0085,.005,12);
  add(head.rotateX(side*Math.PI/2).translate(0,y,side*.0435),steel,side===1?'recessed Torx bolt':'anti-theft shear nut');
  if(side===1)add(new T.ShapeGeometry(torx).translate(0,y,.0461),recess,'six-lobe Torx recess');
 }
 return parts;
}

// H2130H panel modules, replacing the kit's 15 × 40 (across × in-plane) flats.
// Flats are 40 mm across the fence (horizontal) × 15 mm in the panel plane (vertical on the rails);
// infill rounds Ø16. Frame outer edge meets the post face (20 mm from the post centre).
// Local Z follows the fence, Y is up; end modules extend along -Z from the post, as in the kit.
const FLAT_ACROSS=.04,FLAT_IN_PLANE=.015,ROUND_R=.008;
const STILE=.02+FLAT_IN_PLANE/2,Q=(1.5-.055)/12; // stile centre to post centre; H2130H infill pitch
const TOP=1-FLAT_IN_PLANE/2,RAISED_BOTTOM={half:.5,twothirds:1/3}; // raised-bottom panels: bottom rail 0.5 m (half height) or 1/3 m (2/3 height) above paving
export const PANEL_CORNER={full:.05,endOuter:.14}; // centre-line radii; end modules are visibly rounder

function roundedPath(path,x0,x1,y0,y1,[bl,br,tr,tl]){
 path.moveTo(x0+bl,y0).lineTo(x1-br,y0).absarc(x1-br,y0+br,br,-Math.PI/2,0).lineTo(x1,y1-tr).absarc(x1-tr,y1-tr,tr,0,Math.PI/2)
  .lineTo(x0+tl,y1).absarc(x0+tl,y1-tl,tl,Math.PI/2,Math.PI).lineTo(x0,y0+bl).absarc(x0+bl,y0+bl,bl,Math.PI,Math.PI*1.5);return path;
}
// Shape x = fence Z, shape y = height; extrusion = across the fence (X).
const flat=g=>g.index?g.toNonIndexed():g;
const toFence=g=>g.translate(0,0,-FLAT_ACROSS/2).rotateY(-Math.PI/2);

export function panelParts(name,galvanised){
 const raised=Object.keys(RAISED_BOTTOM).find(k=>name.endsWith('_'+k)),end=name.endsWith('_end'),open=name.startsWith('railing_crossing'),BOTTOM=(raised?RAISED_BOTTOM[raised]:.1)+FLAT_IN_PLANE/2;
 const halfLen=(1.5-.055)/2;
 const [a,b]=end?[-STILE-3*Q,-STILE]:[-halfLen,halfLen];
 const rf=PANEL_CORNER.full,ro=PANEL_CORNER.endOuter,t=FLAT_IN_PLANE/2;
 // Corner radii bl,br,tr,tl; for end modules the post is at +Z, so the outer (-Z) corners are bl and tl.
 const r=end?[ro,rf,rf,ro]:[rf,rf,rf,rf],grow=d=>r.map(v=>Math.max(.002,v+d));
 const shape=roundedPath(new T.Shape(),a-t,b+t,BOTTOM-t,TOP+t,grow(t));
 shape.holes.push(roundedPath(new T.Path(),a+t,b-t,BOTTOM+t,TOP-t,grow(-t)));
 const geometries=[toFence(new T.ExtrudeGeometry(shape,{depth:FLAT_ACROSS,bevelEnabled:false,curveSegments:4}))];
 if(open){for(const y of raised?[(TOP+BOTTOM)/2]:[.4,.7])geometries.push(new T.BoxGeometry(FLAT_ACROSS,FLAT_IN_PLANE,b-a-FLAT_IN_PLANE).translate(0,y,(a+b)/2));}
 else{const n=end?3:12,span=b-a;for(let i=1;i<n;i++)geometries.push(new T.CylinderGeometry(ROUND_R,ROUND_R,TOP-BOTTOM-FLAT_IN_PLANE,8).translate(0,(TOP+BOTTOM)/2,a+span*i/n));}
 const plain=geometries.map(g=>{const n=flat(g);n.deleteAttribute('uv');n.clearGroups();return n;});
 return [{geometry:mergeGeometries(plain),material:galvanised,role:`${open?'crossing':'Type 2'} panel, 40 × 15 flats`+(open?'':', Ø16 rounds')}];
}
