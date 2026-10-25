const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const sharp=require('sharp'),QR=require('qrcode');
const {normalizeImage,readImageMetadata,downloadQrImage}=require('./zalo-image');
const prefix='89504e470d0a1a0a';
const svg=(body,width=540,height=640)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
test('VietQR SVG disguised as .png is saved as real PNG with correct metadata and unchanged QR payload',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mindup-qr-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const destination=path.join(directory,'qr.png');
 const payload='TEST VietQR amount=960000 memo=HP1026 Test Student';
 const embedded=await QR.toBuffer(payload,{type:'png',width:400,margin:4});
 const input=svg(`<rect width="540" height="640" fill="white"/><image x="70" y="100" width="400" height="400" href="data:image/png;base64,${embedded.toString('base64')}"/>`);
 await downloadQrImage('https://img.vietqr.io/image/test-test-compact2.png',destination,async()=>new Response(input,{headers:{'content-type':'image/jpeg'}}));
 const output=await fs.readFile(destination);assert.equal(output.subarray(0,8).toString('hex'),prefix);
 assert.deepEqual(await readImageMetadata(destination),{width:540,height:640,size:output.length});
 const {data,info}=await sharp(output).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const decoded=require('jsqr')(new Uint8ClampedArray(data),info.width,info.height);
 assert.equal(decoded?.data,payload);
 await fs.writeFile(path.join(directory,'bad.png'),input);
 await assert.rejects(()=>readImageMetadata(path.join(directory,'bad.png')),/chuyển sang PNG/);
});
test('image conversion rejects invalid bodies, excessive dimensions and SVG external resources',async()=>{
 for(const input of [Buffer.from('not an image'),svg('<image href="file:///C:/private.png"/>'),svg('<image href="https://example.com/image.png"/>'),svg('<script>alert(1)</script>'),svg('<rect/>',50000,50000),Buffer.from('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>')]) {
  await assert.rejects(()=>normalizeImage(input));
 }
 await assert.rejects(()=>downloadQrImage('http://127.0.0.1/private','unused',()=>{throw Error('must not fetch');}),/Nguồn ảnh/);
 let calls=0;
 await assert.rejects(()=>downloadQrImage('https://img.vietqr.io/image/test.png','unused',async()=>{calls++;return new Response(null,{status:302,headers:{location:'https://example.com/private'}});}),/Nguồn ảnh/);
 assert.equal(calls,1);
});
test('real PNG input retains pixels and JPEG dimensions are read instead of fabricated',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mindup-qr-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const original=await sharp({create:{width:17,height:23,channels:3,background:'#12a843'}}).png().toBuffer();
 const converted=await normalizeImage(original);
 assert.deepEqual(await sharp(converted).raw().toBuffer(),await sharp(original).raw().toBuffer());
 const file=path.join(directory,'image.jpg');await sharp(original).jpeg().toFile(file);
 const metadata=await readImageMetadata(file);assert.equal(metadata.width,17);assert.equal(metadata.height,23);
});
