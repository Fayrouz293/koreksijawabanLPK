// Konversi gambar di browser: File/video -> {width,height,data}, ImageData -> JPEG.

export async function fileToImage(file, maxSide = 2600) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return bitmapToImage(bmp, maxSide);
}

export function bitmapToImage(src, maxSide = 2600) {
  const w0 = src.videoWidth || src.width, h0 = src.videoHeight || src.height;
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.round(w0 * s), h = Math.round(h0 * s);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, w, h);
  src.close?.();
  const id = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data: id.data };
}

export function imageToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return c;
}

export function imageToBlob(img, quality = 0.8) {
  const c = imageToCanvas(img);
  return new Promise(r => c.toBlob(r, 'image/jpeg', quality));
}

export async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}
