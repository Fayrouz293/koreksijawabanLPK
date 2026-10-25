// Pemuat OpenCV.js & JPEG untuk skrip/tes Node.
import fs from 'node:fs';
import jpeg from 'jpeg-js';
import cvModule from '@techstark/opencv-js';

export async function loadCv() {
  let cv = cvModule;
  if (cv instanceof Promise) cv = await cv;
  while (!cv.Mat) await new Promise(r => setTimeout(r, 20));
  return cv;
}

export function readJpeg(path) {
  const raw = jpeg.decode(fs.readFileSync(path), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048 });
  return { width: raw.width, height: raw.height, data: new Uint8ClampedArray(raw.data.buffer, raw.data.byteOffset, raw.data.length) };
}

export function writeJpeg(path, img, q = 80) {
  fs.writeFileSync(path, jpeg.encode({ data: Buffer.from(img.data.buffer, img.data.byteOffset, img.data.length), width: img.width, height: img.height }, q).data);
}
