// Antarmuka ke Web Worker OMR.
let worker = null, seq = 0;
const pending = new Map();

function w() {
  if (worker) return worker;
  worker = new Worker(new URL('./omr.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    e.data.ok ? p.resolve(e.data.hasil) : p.reject(new Error(e.data.pesan));
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Worker gagal')); pending.clear(); };
  return worker;
}

function kirim(msg, transfer = []) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    w().postMessage({ ...msg, id }, transfer);
  });
}

export const siapkanOmr = () => kirim({ tipe: 'siap' });
export const bacaLembar = (img, template, opts) => kirim({ tipe: 'baca', img, template, opts });
/** Baca lembar dengan deteksi template otomatis; hasil.templateId = template yang cocok. */
export const bacaLembarOtomatis = (img, templates, opts) => kirim({ tipe: 'otomatis', img, template: templates, opts });
export const kalibrasiTemplate = (img, template, opts) => kirim({ tipe: 'kalibrasi', img, template, opts });
