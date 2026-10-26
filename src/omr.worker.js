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
    let hasil;
    if (tipe === 'kalibrasi') hasil = calibrate(cv, img, template, opts || {});
    else if (tipe === 'otomatis') {
      // coba semua template, pilih yang terbaca dengan skor struktur tertinggi
      let gagal = null;
      for (const t of template) {
        const r = readSheet(cv, img, t, opts || {});
        if (r.ok) { r.templateId = t.id; if (!hasil || r.kualitas.skorStruktur > hasil.kualitas.skorStruktur) hasil = r; }
        else if (!gagal || r.alasan !== 'tabel_tidak_lengkap') gagal = r;
      }
      hasil ??= gagal;
    } else hasil = readSheet(cv, img, template, opts || {});
    const transfer = [];
    if (hasil?.gambarLurus) transfer.push(hasil.gambarLurus.data.buffer);
    if (hasil?.kotakNama) transfer.push(hasil.kotakNama.data.buffer);
    delete hasil?.posisiAsli;
    self.postMessage({ id, ok: true, hasil }, transfer);
  } catch (err) {
    self.postMessage({ id, ok: false, pesan: err?.message || String(err) });
  }
};
