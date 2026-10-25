// Web Worker: OpenCV.js + pembacaan lembar dijalankan di luar thread UI.
import cvModule from '@techstark/opencv-js';
import { readSheet, calibrate } from './lib/omr.js';

const cvReady = (async () => {
  let cv = cvModule;
  if (cv instanceof Promise) cv = await cv;
  while (!cv.Mat) await new Promise(r => setTimeout(r, 20));
  return cv;
})();

self.onmessage = async (e) => {
  const { id, tipe, img, template, opts } = e.data;
  try {
    const cv = await cvReady;
    if (tipe === 'siap') return self.postMessage({ id, ok: true });
    const fn = tipe === 'kalibrasi' ? calibrate : readSheet;
    const hasil = fn(cv, img, template, opts || {});
    const transfer = [];
    if (hasil?.gambarLurus) transfer.push(hasil.gambarLurus.data.buffer);
    if (hasil?.kotakNama) transfer.push(hasil.kotakNama.data.buffer);
    delete hasil?.posisiAsli;
    self.postMessage({ id, ok: true, hasil }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, pesan: err?.message || String(err) });
  }
};
