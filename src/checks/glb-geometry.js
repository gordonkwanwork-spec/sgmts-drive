// Node has no image decoder: drop textures from a GLB so GLTFLoader can parse its geometry and materials.
export function untexturedGLB(bytes){
 const len=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+len).toString()),bin=bytes.subarray(20+len);
 delete json.images;delete json.textures;delete json.samplers;
 for(const m of json.materials||[]){if(m.pbrMetallicRoughness)for(const k of Object.keys(m.pbrMetallicRoughness))if(k.endsWith('Texture'))delete m.pbrMetallicRoughness[k];for(const k of Object.keys(m))if(k.endsWith('Texture'))delete m[k];}
 let text=JSON.stringify(json);text+=' '.repeat((4-text.length%4)%4);
 const head=Buffer.alloc(20);head.write('glTF',0);head.writeUInt32LE(2,4);head.writeUInt32LE(20+text.length+bin.length,8);head.writeUInt32LE(text.length,12);head.write('JSON',16);
 const out=Buffer.concat([head,Buffer.from(text),bin]);return out.buffer.slice(out.byteOffset,out.byteOffset+out.byteLength);
}
