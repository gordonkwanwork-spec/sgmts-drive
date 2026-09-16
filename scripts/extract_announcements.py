"""Cut the supplied recordings at inter-phrase silences, retaining the original voices."""
from pathlib import Path
import subprocess,json,re
ROOT=Path(__file__).resolve().parents[1]
keys=[f'next-A{i}' for i in range(1,8)]+['doors','handrail','lean','alight','gap','next-A7-terminus','next-A1-terminus','arrived-A7','arrived-A1']
# Boundaries reviewed against time-aligned transcripts; silence snapping preserves final syllables.
sources=[('yue','*Cantonese*.wav',[0,1.54,3.64,5.86,7.88,9.74,11.88,13.96,17.24,19.72,21.22,24.22,28.04,31.66,35.34,40.2,45.04]),('zh','*News*.wav',[0,1.87,4.34,7.03,9.38,11.26,13.39,15.85,19.5,22.37,24.34,27.8,32.35,36.08,39.31,44.94,50.23]),('en','*Calm*.wav',[0,1.91,4.41,7.66,10.56,13.24,16.48,18.98,22.76,25.97,28.7,31.54,35.38,39.47,43.5,48.83,53.87])]
out=ROOT/'public/audio/announcements';out.mkdir(parents=True,exist_ok=True);manifest={}
for lang,pattern,bounds in sources:
 source=next((ROOT/'Announcements').glob(pattern))
 result=subprocess.run(['ffmpeg','-hide_banner','-i',str(source),'-af','silencedetect=noise=-35dB:d=0.12','-f','null','-'],capture_output=True,text=True,check=True)
 starts=[float(x) for x in re.findall(r'silence_start: ([\d.]+)',result.stderr)];ends=[float(x) for x in re.findall(r'silence_end: ([\d.]+)',result.stderr)];mids=[(a+b)/2 for a,b in zip(starts,ends)]
 snapped=[0]+[min(mids,key=lambda x:abs(x-t)) if min(abs(x-t) for x in mids)<.4 else t for t in bounds[1:-1]]+[bounds[-1]]
 for key,start,end in zip(keys,snapped,snapped[1:]):
  name=f'{key}-{lang}.mp3';subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-ss',str(start),'-t',str(end-start),'-af','afade=t=in:d=0.008,afade=t=out:st='+str(max(0,end-start-.015))+':d=0.015','-ar','44100','-codec:a','libmp3lame','-b:a','96k',str(out/name)],check=True)
  manifest.setdefault(key,[]).append({'language':lang,'file':name,'duration':round(end-start,3),'source':source.name,'start':round(start,3),'end':round(end,3)})
(out/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
assert len(manifest)==16 and all([c['language'] for c in v]==['yue','zh','en'] for v in manifest.values())
print('Extracted 48 clips; Cantonese, Mandarin, English order verified.')
