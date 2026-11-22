"""Shared writer for the game's packed splat format (.gsplat, read by src/splat-lite.js loadSplat). 26 B a splat vs 56 B for a float PLY.
Layout: 'GSP1', u32 n, u8 flags (bit0 = most-important-first), 7 B pad | pos f32x3 | scale f16x3 (linear) | rgba u8 | quat i8x4 (w,x,y,z).
pack(out, X, dc, opacity, logscale, quat): X (n,3) metres, dc (n,3) SH0 coefficients, opacity = raw logit, logscale = log metres, quat (n,4) w,x,y,z.
Splats are written most-important-first (opacity x size^2) - never prune the small ones: they carry the surface detail."""
import numpy as np
C0=0.28209479177387814
def pack(out,X,dc,opacity,logscale,quat):
 n=len(X);sc=np.exp(logscale);alpha=1/(1+np.exp(-opacity))
 order=np.argsort(-(alpha*sc.mean(1)**2),kind='stable');X,dc,sc,alpha,quat=X[order],dc[order],sc[order],alpha[order],quat[order]
 q=quat/np.linalg.norm(quat,axis=1,keepdims=True)
 rgba=np.concatenate([np.clip(.5+C0*dc,0,1),alpha[:,None]],1)
 with open(out,'wb') as f:
  f.write(b'GSP1'+np.uint32(n).tobytes()+bytes([1])+bytes(7))
  f.write(X.astype('<f4').tobytes());f.write(sc.astype('<f2').tobytes())
  f.write(np.round(rgba*255).astype(np.uint8).tobytes());f.write(np.round(q*127).astype(np.int8).tobytes())
 return n*26
