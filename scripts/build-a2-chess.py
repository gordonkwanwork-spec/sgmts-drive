#!/usr/bin/env python3
"""Crop the chess table, two chairs and their paved square out of Gordon's KIRI 3DGS capture and bake them into game space.
Usage: build-a2-chess.py <capture.ply> <capture-mesh.obj|-> <out.gsplat> <out-hull.json>   ('-' keeps the existing hull)
Output: metres, Y up, the square's floor centre at the origin, square sides on X / Z, chairs on +-Z; SH0 colour only.
The capture is COLMAP-like (y down); KIRI's mesh of the same capture is the splat frame turned 180 deg about X, same scale.
Source: Gordon's re-oriented SuperSplat export '3DGS/Chess table.ply' (443k splats, square already on the axes). Square (light-yellow
border) 4.30 units a side; centre (-0.545, 1.197) in the turned frame, registered to the first build so the hull and slab still fit.
Scale: table top 1.60 units above the floor = 0.75 m (seats then 0.42 m), so 0.47 m per unit."""
import sys,json,numpy as np
sys.path.insert(0,__import__('os').path.dirname(__file__));from gsplat_pack import pack
S=0.47                    # metres per capture unit
CENTRE=np.array([-0.545,1.197]);HALF=2.15;ANG=0.;FLOOR=-0.131;MESH_FLOOR=None   # re-measure with the KIRI mesh if the hull is ever rebuilt
src,obj,out,hull=sys.argv[1:5]

def quat_mul(a,b):
 w1,x1,y1,z1=a.T;w2,x2,y2,z2=b.T
 return np.stack([w1*w2-x1*x2-y1*y2-z1*z2,w1*x2+x1*w2+y1*z2-z1*y2,w1*y2-x1*z2+y1*w2+z1*x2,w1*z2+x1*y2-y1*x2+z1*w2],1)
# Level the floor: its normal in the turned frame, rotated onto +Y (about 1 deg).
n=np.array([.0094,1,.0007]);n/=np.linalg.norm(n);ax=np.cross(n,[0,1,0]);sa=np.linalg.norm(ax);t=np.arcsin(sa);ax=ax/sa
qL=np.array([np.cos(t/2),*(ax*np.sin(t/2))])
qY=np.array([np.cos(ANG/2),0,np.sin(ANG/2),0])   # three's Y rotation by ANG takes (u,v) of the square onto (x,z)
qX=np.array([0,1,0,0])                            # 180 deg about X: capture (y down) -> y up
def rotm(q):
 w,x,y,z=q;return np.array([[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],[2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],[2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]])
RL=rotm(qL);RY=np.array([[np.cos(ANG),0,np.sin(ANG)],[0,1,0],[-np.sin(ANG),0,np.cos(ANG)]])
def to_game(P,floor):   # P in the turned frame
 c=np.array([CENTRE[0],floor,CENTRE[1]]);return ((P-c)@RL.T)@RY.T*S

f=open(src,'rb');h=b''
while not h.endswith(b'end_header\n'):h+=f.readline()
props=[l.split()[2] for l in h.decode().splitlines() if l.startswith('property')]
N=int([l.split()[2] for l in h.decode().splitlines() if l.startswith('element vertex')][0])
a=np.fromfile(f,dtype='<f4',count=N*len(props)).reshape(N,len(props));ix={p:i for i,p in enumerate(props)}
P=a[:,:3]*np.array([1,-1,-1]);X=to_game(P,FLOOR);op=1/(1+np.exp(-a[:,ix['opacity']]))
half=HALF*S+.01
k=(op>.08)&(np.abs(X[:,0])<half)&(np.abs(X[:,2])<half)&(X[:,1]>-.08)&(X[:,1]<.95)
a=a[k];X=X[k]
v=np.floor(X/.05).astype(int);_,inv,cnt=np.unique(v,axis=0,return_inverse=True,return_counts=True)
keep=(X[:,1]<.04)|(cnt[inv.ravel()]>=4);a=a[keep];X=X[keep]   # floaters above the floor: need >=4 splats in the 5 cm cell
print('cropped',len(a))
fl=X[:,1]<.03;a[fl,ix['opacity']]=np.maximum(a[fl,ix['opacity']],3.)   # the floor reads solid (opacity >= 0.95): no plaza brick through it
C0=0.28209479;floor_rgb=np.clip(.5+C0*a[fl][:,[ix['f_dc_0'],ix['f_dc_1'],ix['f_dc_2']]],0,1).mean(0)   # backing slab colour under the splat
# No splat cap: the small splats carry the gravel, tactile dots and timber grain (a 120k cap made the game look soft). The packed file is
# written most-important-first and the renderer draws a leading fraction at distance (LOD), so the full set only costs close up.
q=a[:,[ix['rot_0'],ix['rot_1'],ix['rot_2'],ix['rot_3']]];q=q/np.linalg.norm(q,axis=1,keepdims=True)
qT=quat_mul(np.tile(qY,(len(q),1)),quat_mul(np.tile(qL,(len(q),1)),np.tile(qX,(len(q),1))))
q2=quat_mul(qT,q)
sc=a[:,[ix['scale_0'],ix['scale_1'],ix['scale_2']]]+np.log(S)
cols=['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3']
nbytes=pack(out,X,a[:,[ix['f_dc_0'],ix['f_dc_1'],ix['f_dc_2']]],a[:,ix['opacity']],sc,q2)
print('splats',len(X),'bounds',X.min(0).round(3),X.max(0).round(3),'MB',round(nbytes/1e6,1))

if obj=='-':sys.exit()
# Collision from the capture mesh: convex hulls of the table and each chair (extreme points in 96 directions).
V=[]
with open(obj) as fo:
 for l in fo:
  if l.startswith('v '):V.append(l[2:].split()[:3])
  elif l.startswith('vt') or l.startswith('f '):break
V=np.array(V,float);G=to_game(V,MESH_FLOOR);m=(np.abs(G[:,0])<half-.12)&(np.abs(G[:,2])<half-.05)&(G[:,1]>.06)&(G[:,1]<.95);G=G[m]   # inside the border rim, above the paving
d=np.array([[np.cos(2.39996*k)*np.sqrt(1-z*z),z,np.sin(2.39996*k)*np.sqrt(1-z*z)] for k,z in enumerate(np.linspace(-1,1,96))])
def extremes(Y):return np.unique(np.round(Y[np.argmax(Y@d.T,axis=0)],3),axis=0).tolist()
A=int(np.argmax(G.max(0)-G.min(0)));A=A if A!=1 else 2   # the chairs sit either side of the table along this axis
groups={'chairA':G[G[:,A]<-.40],'table':G[np.abs(G[:,A])<=.40],'chairB':G[G[:,A]>.40]};print('chair axis','xyz'[A])
for k2,g in groups.items():print(k2,len(g),'min',g.min(0).round(2),'max',g.max(0).round(2))
json.dump({'size':round(2*HALF*S,3),'floor':'#%02x%02x%02x'%tuple((floor_rgb*255).round().astype(int)),'table':extremes(groups['table']),'chairs':[extremes(groups['chairA']),extremes(groups['chairB'])]},open(hull,'w'))
