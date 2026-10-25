'use strict';
const fs = require('node:fs/promises');
const sharp = require('sharp');
const { DOMParser } = require('@xmldom/xmldom');
const MAX_BYTES = 10 * 1024 * 1024;
const options = { limitInputPixels: 16777216, failOn: 'error' };

function isSvgImage(buffer) {
  let index=buffer[0]===0xef&&buffer[1]===0xbb&&buffer[2]===0xbf?3:0;
  while(index<buffer.length && [9,10,11,12,13,32].includes(buffer[index])) index++;
  return buffer[index]===60;
}
function validateSvg(buffer) {
  const xml = buffer.toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('SVG chứa khai báo không an toàn');
  const doc = new DOMParser({onError: () => { throw new Error('Ảnh SVG không hợp lệ'); }}).parseFromString(xml, 'image/svg+xml');
  if (doc.documentElement?.localName !== 'svg') throw new Error('Nội dung tải về không phải ảnh SVG');
  for (const node of Array.from(doc.getElementsByTagName('*'))) {
    if (['script','foreignobject','iframe','style'].includes(node.localName.toLowerCase())) throw new Error('SVG chứa nội dung không được hỗ trợ');
    for (const attribute of Array.from(node.attributes)) {
      const value = attribute.value.trim();
      if (/^on/i.test(attribute.localName) || /url\s*\(|@import/i.test(value)) throw new Error('SVG chứa tài nguyên ngoài');
      if (attribute.localName === 'href' && !value.startsWith('#') && !/^data:image\/(png|jpeg);base64,[a-z0-9+/=\s]+$/i.test(value)) throw new Error('SVG chứa tài nguyên ngoài');
    }
  }
}
async function normalizeImage(buffer) {
  if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Ảnh trống hoặc vượt quá 10 MB');
  if (isSvgImage(buffer)) validateSvg(buffer);
  const image = sharp(buffer, options);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096) throw new Error('Kích thước ảnh không hợp lệ');
  const data = await image.png().toBuffer();
  if (data.length > MAX_BYTES) throw new Error('Ảnh PNG vượt quá 10 MB');
  return data;
}
async function readImageMetadata(file) {
  const buffer = await fs.readFile(file);
  if (isSvgImage(buffer)) throw new Error('Ảnh cần chuyển sang PNG trước khi gửi Zalo');
  const meta = await sharp(buffer, options).metadata();
  if (meta.format === 'svg') throw new Error('Ảnh cần chuyển sang PNG trước khi gửi Zalo');
  if (!meta.width || !meta.height) throw new Error('Không đọc được kích thước ảnh');
  return {width:meta.width, height:meta.height, size:buffer.length};
}
async function downloadQrImage(url, destination, request = fetch) {
  for (let redirect = 0; redirect < 4; redirect++) {
    const target = new URL(url);
    if (target.protocol !== 'https:' || target.hostname !== 'img.vietqr.io' || target.port || target.username || target.password || !target.pathname.startsWith('/image/')) throw new Error('Nguồn ảnh VietQR không hợp lệ');
    const response = await request(target.href, {redirect:'manual',signal:AbortSignal.timeout(15000)});
    if ([301,302,303,307,308].includes(response.status)) {
      url = new URL(response.headers.get('location'),target).href;
      await response.body?.cancel();
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status} khi tải ảnh QR`); }
    if (Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); throw new Error('Ảnh QR vượt quá 10 MB'); }
    const chunks=[];let size=0;
    for await (const chunk of response.body) { size+=chunk.length;if(size>MAX_BYTES)throw new Error('Ảnh QR vượt quá 10 MB');chunks.push(chunk); }
    // The URL suffix and Content-Type are not proof of PNG bytes.
    const png = await normalizeImage(Buffer.concat(chunks));
    await fs.writeFile(destination,png);
    return destination;
  }
  throw new Error('Ảnh QR chuyển hướng quá nhiều lần');
}
module.exports = {isSvgImage,normalizeImage,readImageMetadata,downloadQrImage};
