#!/usr/bin/env python3
"""Crop the lion statue + plinth out of the KIRI 3DGS capture and bake it into game space.
Usage: build-a1-lion.py <capture.ply> <out.ply> <out-hull.json>
Output: Y-up, +Z = lion front, plinth base centre at the origin, metres (LION_HEIGHT tall), SH0 colour only.
Capture frame is COLMAP-like (y down, lion faces +z), so baking is a 180 deg turn about Z: (x,y,z)->(-x,-y,z)."""
import sys,json,numpy as np
MAX_SPLATS=100000  # file size / sort cost cap (full crop is ~183k)
LION_HEIGHT=1.8   # assumption: capture is unitless; plinth+lion stand 1.8 m tall (plinth ~0.9 x 1.0 m)
CROP=dict(x=(-6.95,-1.95),z=(-8.3,-2.2),y=(-3.5,8.72))  # capture units: plinth footprint, plinth base up to lion top; excludes the red column at z~-12
src,out,hull=sys.argv[1:4]
f=open(src,'rb');h=b''
while not h.endswith(b'end_header\n'):h+=f.readline()
props=[l.split()[2] for l in h.decode().splitlines() if l.startswith('property')]
n=int([l.split()[2] for l in h.decode().splitlines() if l.startswith('element vertex')][0])
a=np.fromfile(f,dtype='<f4',count=n*len(props)).reshape(n,len(props));ix={p:i for i,p in enumerate(props)}
P=a[:,:3];op=1/(1+np.exp(-a[:,ix['opacity']]))
k=(op>.25)
for ax,(lo,hi) in zip('xyz',(CROP['x'],CROP['y'],CROP['z'])):k&=(P[:,'xyz'.index(ax)]>lo)&(P[:,'xyz'.index(ax)]<hi)
a=a[k];P=a[:,:3]
v=np.floor(P/.3).astype(int);_,inv,cnt=np.unique(v,axis=0,return_inverse=True,return_counts=True)
a=a[cnt[inv.ravel()]>=6]   # drop floaters: need >=6 splats in the 0.3-unit cell
imp=(1/(1+np.exp(-a[:,ix['opacity']])))*np.exp(a[:,[ix['scale_0'],ix['scale_1'],ix['scale_2']]]).mean(1)
a=a[np.sort(np.argsort(-imp)[:MAX_SPLATS])];P=a[:,:3]   # keep the most visible MAX_SPLATS (opacity x size)
body=P[P[:,1]<8.0];cx,cz=(body[:,0].min()+body[:,0].max())/2,(body[:,2].min()+body[:,2].max())/2;y0=CROP['y'][1]
top=P[:,1].min();s=LION_HEIGHT/(y0-top)
X=np.stack([-(P[:,0]-cx)*s,-(P[:,1]-y0)*s,(P[:,2]-cz)*s],1)
q=a[:,[ix['rot_0'],ix['rot_1'],ix['rot_2'],ix['rot_3']]];q=q/np.linalg.norm(q,axis=1,keepdims=True)
q2=np.stack([-q[:,3],-q[:,2],q[:,1],q[:,0]],1)   # qZ(pi) * q
sc=a[:,[ix['scale_0'],ix['scale_1'],ix['scale_2']]]+np.log(s)
cols=['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3']
# grade: the capture's shaded front reads blue-purple in game light - pull saturation to 70 %, lift 15 %, warm slightly
C0=0.28209479;rgb=np.clip(.5+C0*a[:,[ix['f_dc_0'],ix['f_dc_1'],ix['f_dc_2']]],0,1);lum=rgb@[.2126,.7152,.0722]
rgb=np.clip((lum[:,None]+.7*(rgb-lum[:,None]))*np.array([1.19,1.15,1.07]),0,1);dc=(rgb-.5)/C0
D=np.concatenate([X,dc,a[:,[ix['opacity']]],sc,q2],1).astype('<f4')
hd='ply\nformat binary_little_endian 1.0\nelement vertex %d\n'%len(D)+''.join('property float %s\n'%c for c in cols)+'end_header\n'
open(out,'wb').write(hd.encode()+D.tobytes())
print('splats',len(D),'scale',round(float(s),4),'bounds',X.min(0).round(2),X.max(0).round(2),'MB',round(len(D)*56/1e6,1))
# shadow/collision proxy: extreme points in 96 directions for the plinth and for the lion (three builds ConvexGeometry from them)
PLINTH_TOP=0.66
d=np.array([[np.cos(2.39996*k)*np.sqrt(1-z*z),z,np.sin(2.39996*k)*np.sqrt(1-z*z)] for k,z in enumerate(np.linspace(-1,1,96))])
def extremes(Y):return np.unique(np.round(Y[np.argmax(Y@d.T,axis=0)],3),axis=0).tolist()
json.dump({'height':LION_HEIGHT,'plinth':extremes(X[X[:,1]<PLINTH_TOP]),'lion':extremes(X[X[:,1]>=PLINTH_TOP-.02])},open(hull,'w'))
