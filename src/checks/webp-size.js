// Width and height of a WebP file (lossy, lossless or extended) without an image library.
export function webpSize(b){
  if(b.subarray(0,4).toString()!=='RIFF'||b.subarray(8,12).toString()!=='WEBP')throw Error('Not a WebP file');
  const kind=b.subarray(12,16).toString();
  if(kind==='VP8 ')return {width:b.readUInt16LE(26)&0x3fff,height:b.readUInt16LE(28)&0x3fff};
  if(kind==='VP8L'){const v=b.readUInt32LE(21);return {width:(v&0x3fff)+1,height:((v>>14)&0x3fff)+1};}
  return {width:b.readUIntLE(24,3)+1,height:b.readUIntLE(27,3)+1};// VP8X
}
