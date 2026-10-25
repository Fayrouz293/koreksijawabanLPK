// Cadangan: ekspor & impor seluruh data sebagai satu file JSON.
import { dumpAll, replaceAll, getMeta, setMeta, STORES } from './db.js';

export const FORMAT = 'koreksi-lpk-josg-cadangan';
export const VERSI_CADANGAN = 1;
export const HARI_PENGINGAT = 14;

async function blobToDataURL(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(bin)}`;
}

function dataURLToBlob(url) {
  const m = /^data:([^;]*);base64,(.*)$/.exec(url);
  if (!m) return null;
  const bin = atob(m[2]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: m[1] });
}

/** @param {{denganFoto?: boolean}} opts */
export async function buildBackup(opts = { denganFoto: true }) {
  const data = await dumpAll();
  data.hasil = await Promise.all(data.hasil.map(async h => {
    const c = { ...h };
    if (c.foto instanceof Blob) c.foto = opts.denganFoto ? await blobToDataURL(c.foto) : null;
    return c;
  }));
  return { format: FORMAT, versi: VERSI_CADANGAN, dibuat: new Date().toISOString(), denganFoto: !!opts.denganFoto, data };
}

export function validateBackup(obj) {
  const errs = [];
  if (!obj || obj.format !== FORMAT) errs.push('Bukan file cadangan aplikasi ini');
  else {
    if (typeof obj.versi !== 'number' || obj.versi > VERSI_CADANGAN) errs.push(`Versi cadangan ${obj.versi} tidak didukung`);
    for (const st of STORES) if (obj.data?.[st] && !Array.isArray(obj.data[st])) errs.push(`Bagian ${st} rusak`);
  }
  return errs;
}

export async function restoreBackup(obj) {
  const errs = validateBackup(obj);
  if (errs.length) throw new Error(errs.join('; '));
  const data = { ...obj.data };
  data.hasil = (data.hasil || []).map(h => ({ ...h, foto: typeof h.foto === 'string' ? dataURLToBlob(h.foto) : null }));
  // waktu cadangan terakhir ikut dipulihkan dari file, lalu dicatat ulang
  await replaceAll(data);
  await setMeta('cadanganTerakhir', obj.dibuat);
  return Object.fromEntries(STORES.map(st => [st, (data[st] || []).length]));
}

export async function markBackedUp() { await setMeta('cadanganTerakhir', new Date().toISOString()); }

/** Hari sejak cadangan terakhir; null bila belum pernah. */
export async function daysSinceBackup(now = Date.now()) {
  const t = await getMeta('cadanganTerakhir');
  return t ? Math.floor((now - Date.parse(t)) / 86400000) : null;
}
