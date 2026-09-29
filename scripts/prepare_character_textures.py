"""Bake modelling-reference portraits and cloth swatches into small game atlases.

Run with Python + Pillow/numpy. Landmarks are saved Apple Vision observations in
assets/character-source/face-landmarks.json; the original sheets remain untouched.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/character-references/2026-09-29'
OUT = ROOT / 'assets/character-source/textures'
PATCHES = [(660,370,605,690),(650,360,650,540),(650,370,602,660),
           (680,370,628,700),(640,350,585,660),(670,350,610,670),
           (650,350,600,565),(670,350,670,580),(530,390,520,620),
           (525,390,530,610),(670,370,615,700),(680,380,680,640),(555,320,520,520)]

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = json.loads((ROOT/'assets/character-source/face-landmarks.json').read_text())
    metadata = []
    for index, record in enumerate(records):
        image = Image.open(SOURCE/record['file']).convert('RGB')
        eyes = sorted([np.mean(record[k],axis=0) for k in ('leftEye','rightEye')],key=lambda p:p[0])
        distance = eyes[1][0]-eyes[0][0]
        centre = (eyes[0]+eyes[1])/2
        chin = max(p[1] for p in record['contour'])
        side = distance*3.15
        box = [centre[0]-side/2, centre[1]-distance*1.18, centre[0]+side/2, centre[1]-distance*1.18+side]
        face = image.crop(tuple(map(round,box))).resize((512,512),Image.Resampling.LANCZOS)
        # Fill outside the facial silhouette with cheek albedo: no grey backdrop on ears.
        skin_patch = image.crop((int(centre[0]-.68*distance),int(centre[1]+.3*distance),int(centre[0]-.43*distance),int(centre[1]+.56*distance)))
        skin = np.median(np.array(skin_patch).reshape(-1,3),axis=0)
        polygon = record['contour'] + [[eyes[1][0]+distance*.48,centre[1]-distance*.9],[eyes[0][0]-distance*.48,centre[1]-distance*.9]]
        mask = Image.new('L',(512,512));draw=ImageDraw.Draw(mask)
        draw.polygon([((x-box[0])/side*512,(y-box[1])/side*512) for x,y in polygon],fill=255)
        mask=mask.filter(ImageFilter.GaussianBlur(12))
        face=Image.composite(face,Image.new('RGB',(512,512),tuple(skin.astype(int))),mask)
        # The sheets already have diffuse studio light; reduce broad illumination variation.
        a=np.array(face).astype(float)/255
        low=np.array(face.filter(ImageFilter.GaussianBlur(32))).astype(float)/255
        lum=low.mean(axis=2,keepdims=True)
        correction=np.clip((skin.mean()/255)/np.maximum(lum,.08),.82,1.18)**.45
        face=Image.fromarray(np.uint8(np.clip(a*correction,0,1)*255))
        atlas=Image.new('RGB',(1024,1024),'white');atlas.paste(face,(0,0))
        x,y,bx,by=PATCHES[index]
        for px,py,target in [(x,y,(512,0)),(bx,by,(512,256))]:
            crop=image.crop((px-28,py-38,px+28,py+38)).resize((512,256),Image.Resampling.LANCZOS)
            mean=tuple(np.median(np.array(crop).reshape(-1,3),axis=0).astype(int))
            crop=Image.blend(Image.new('RGB',crop.size,mean),crop,.22)
            atlas.paste(crop,target)
        atlas.save(OUT/f'person-{index:02}.jpg',quality=92,subsampling=0)
        metadata.append({'file':record['file'],'crop':box,'eyes':centre.tolist(),'eyeDistance':float(distance),
                         'mouth':np.mean(record['lips'],axis=0).tolist(),'nose':max(p[1] for p in record['nose'])-distance*.08,'chin':chin,'skin':(skin/255).tolist()})
    (OUT/'mapping.json').write_text(json.dumps(metadata,indent=2)+'\n')

if __name__=='__main__':main()
