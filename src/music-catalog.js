export const MUSIC_TRACKS = [
  {
    "id": "l01a",
    "title": "First Light at Hung Shui Kiu — A",
    "category": "loading",
    "file": "soundtrack/l01a.mp3",
    "gain": 0.66911
  },
  {
    "id": "l01b",
    "title": "First Light at Hung Shui Kiu — B",
    "category": "loading",
    "file": "soundtrack/l01b.mp3",
    "gain": 0.5902
  },
  {
    "id": "l02a",
    "title": "Platform Cafe — A",
    "category": "loading",
    "file": "soundtrack/l02a.mp3",
    "gain": 0.65464
  },
  {
    "id": "l02b",
    "title": "Platform Cafe — B",
    "category": "loading",
    "file": "soundtrack/l02b.mp3",
    "gain": 0.61944
  },
  {
    "id": "l03a",
    "title": "Garden City Arrival — A",
    "category": "loading",
    "file": "soundtrack/l03a.mp3",
    "gain": 0.63606
  },
  {
    "id": "l03b",
    "title": "Garden City Arrival — B",
    "category": "loading",
    "file": "soundtrack/l03b.mp3",
    "gain": 0.64195
  },
  {
    "id": "l04a",
    "title": "Neon Route Map — A",
    "category": "loading",
    "file": "soundtrack/l04a.mp3",
    "gain": 0.59841
  },
  {
    "id": "l04b",
    "title": "Neon Route Map — B",
    "category": "loading",
    "file": "soundtrack/l04b.mp3",
    "gain": 0.58546
  },
  {
    "id": "l05a",
    "title": "Bamboo and Glass — A",
    "category": "loading",
    "file": "soundtrack/l05a.mp3",
    "gain": 0.57743
  },
  {
    "id": "l05b",
    "title": "Bamboo and Glass — B",
    "category": "loading",
    "file": "soundtrack/l05b.mp3",
    "gain": 0.62373
  },
  {
    "id": "g01a",
    "title": "Morning Service — A",
    "category": "gameplay",
    "file": "soundtrack/g01a.mp3",
    "gain": 0.63533
  },
  {
    "id": "g01b",
    "title": "Morning Service — B",
    "category": "gameplay",
    "file": "soundtrack/g01b.mp3",
    "gain": 0.63168
  },
  {
    "id": "g02a",
    "title": "Golden Hour Glide — A",
    "category": "gameplay",
    "file": "soundtrack/g02a.mp3",
    "gain": 0.58412
  },
  {
    "id": "g02b",
    "title": "Golden Hour Glide — B",
    "category": "gameplay",
    "file": "soundtrack/g02b.mp3",
    "gain": 0.5682
  },
  {
    "id": "g03a",
    "title": "Rain on the Guideway — A",
    "category": "gameplay",
    "file": "soundtrack/g03a.mp3",
    "gain": 0.61094
  },
  {
    "id": "g03b",
    "title": "Rain on the Guideway — B",
    "category": "gameplay",
    "file": "soundtrack/g03b.mp3",
    "gain": 0.5761
  },
  {
    "id": "g04a",
    "title": "Midnight Corridor — A",
    "category": "gameplay",
    "file": "soundtrack/g04a.mp3",
    "gain": 0.54639
  },
  {
    "id": "g04b",
    "title": "Midnight Corridor — B",
    "category": "gameplay",
    "file": "soundtrack/g04b.mp3",
    "gain": 0.68865
  },
  {
    "id": "g05a",
    "title": "Greenway Free Roam — A",
    "category": "gameplay",
    "file": "soundtrack/g05a.mp3",
    "gain": 0.54576
  },
  {
    "id": "g05b",
    "title": "Greenway Free Roam — B",
    "category": "gameplay",
    "file": "soundtrack/g05b.mp3",
    "gain": 0.60395
  },
  {
    "id": "legacy-menu",
    "title": "A New Perspective",
    "category": "original",
    "file": "menu.mp3",
    "gain": 0.6
  },
  {
    "id": "legacy-day",
    "title": "Morning Service (original)",
    "category": "original",
    "file": "day.mp3",
    "gain": 0.6
  },
  {
    "id": "legacy-night",
    "title": "After the Last Peak",
    "category": "original",
    "file": "night.mp3",
    "gain": 0.6
  },
  {
    "id": "canto-dare-to-love",
    "title": "敢愛敢做 · 林子祥",
    "category": "cantonese",
    "file": "soundtrack/canto-dare-to-love.mp3",
    "gain": 0.56234
  },
  {
    "id": "canto-love-of-my-life",
    "title": "一生中最愛 · 譚詠麟",
    "category": "cantonese",
    "file": "soundtrack/canto-love-of-my-life.mp3",
    "gain": 0.50758
  }
];

export const RADIO_STATIONS = [
  ['cantonese', '粵語金曲 FM · Cantopop'],
  ['gameplay', 'Guideway FM · 行車音樂'],
  ['loading', 'Platform Lounge · 月台音樂'],
  ['original', 'SGMTS Originals · 原聲台']
].map(([id, name]) => ({id, name, tracks: MUSIC_TRACKS.filter(track => track.category === id)}));

export const stationById = new Map(RADIO_STATIONS.map(station => [station.id, station]));
const trackById = new Map(MUSIC_TRACKS.map(track => [track.id, track]));
const dial = ['auto', ...stationById.keys(), 'off'];

function step(items, index, direction) {
  return items[(index + direction + items.length) % items.length];
}

// Entering radio from a fixed song keeps its station. Automatic follows the scene until tuned.
export function tuneRadio(state, control, direction) {
  const current = trackById.get(musicChoice(state).id);
  const station = stationById.get(state.gameMusic) || stationById.get(current?.category);
  if (control === 'station') {
    const choice = state.gameMusic ?? 'auto';
    const channel = dial.includes(choice) ? choice : station?.id || 'auto';
    return {gameMusic: step(dial, dial.indexOf(channel), direction), radioTrack: null};
  }
  const playlist = station || RADIO_STATIONS[0];
  const index = playlist.tracks.indexOf(current);
  const next = index < 0 ? playlist.tracks[direction > 0 ? 0 : playlist.tracks.length - 1] : step(playlist.tracks, index, direction);
  return {gameMusic: playlist.id, radioTrack: next.id};
}

export function musicChoice(state){
 const {screen,condition,mode,avatar,crashed,park,v=0,menuMusic='auto',gameMusic='auto',loadingVariant='window'}=state;
 if(crashed||screen==='paused'||!['loading','menu','driving','complete'].includes(screen))return {id:null,level:0};
 const menu=screen==='loading'||screen==='menu',inGame=screen==='driving';
 const choice=menu?menuMusic:gameMusic;
 if(choice==='off')return {id:null,level:0};
 const exploring=mode==='free'||(avatar&&avatar!=='drive');
 let id=menu?({route:'l04a',departure:'l02b',window:'l01b'}[loadingVariant]||'l01b'):
  screen==='complete'?'l03b':mode==='control'?'g04b':exploring?'g05a':({morning:'g01b',sunset:'g02a',rain:'g03b',night:'g04b'}[condition]||'g01b');
 const station=inGame?stationById.get(choice):null;
 if(station){
  const selected=trackById.get(state.radioTrack);
  id=selected?.category===station.id?selected.id:station.tracks[0].id;
 }else if(trackById.has(choice))id=choice;
 const level=menu?.65:screen==='complete'?.5:mode==='control'?.28:exploring?.45:park||Math.abs(v)<1?.28:condition==='rain'?.42:.55;
 return {id,level};
}
