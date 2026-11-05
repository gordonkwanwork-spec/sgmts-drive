// Port of the sandbox's measured 200 × 100 mm bonds, fitted to the game's
// five-metre UV grid. A shared texture keeps curved roads and corridor paving at scale.
import * as T from 'three';
import {PATTERNS,blocks} from './sandbox/paving-patterns.js';
const cache={};
export function streetPaving(kind='red'){
 if(cache[kind])return cache[kind];const p=PATTERNS[kind==='grey'?'stretcher':kind==='buff'?'basket':'herringbone45'];
 const c=document.createElement('canvas');c.width=c.height=1024;const x=c.getContext('2d'),metres=5;
 x.fillStyle='#64615b';x.fillRect(0,0,1024,1024);x.scale(1024/metres,1024/metres);
 for(const b of blocks(p,metres,metres)){const v=Math.sin(b.x*127.1+b.z*311.7)*43758.5453,f=.88+(v-Math.floor(v))*.22,base=kind==='buff'?[170,151,118]:p.base;
  x.save();x.translate(b.x,b.z);x.rotate(b.rot);x.fillStyle=`rgb(${base.map(v=>Math.round(v*f)).join(',')})`;x.fillRect(-b.hw+p.joint/2,-b.hh+p.joint/2,2*b.hw-p.joint,2*b.hh-p.joint);x.restore();}
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=8;return cache[kind]=t;
}
