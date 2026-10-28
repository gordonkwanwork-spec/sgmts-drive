// Storage may be unavailable in embedded/private browsers. Settings still work for this session.
const memory=new Map();
export function readSetting(key,fallback=null){try{return localStorage.getItem(key)??memory.get(key)??fallback;}catch{return memory.get(key)??fallback;}}
export function writeSetting(key,value){memory.set(key,String(value));try{localStorage.setItem(key,String(value));}catch{}}
