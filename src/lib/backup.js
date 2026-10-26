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
    if (!errs.length) errs.push(...validateIsi(obj.data || {}));
  }
  return errs;
}

/** Periksa bentuk minimum tiap catatan agar tampilan tidak rusak setelah impor. */
function validateIsi(data) {
  const errs = [];
  const obj = x => x && typeof x === 'object' && !Array.isArray(x);
  const str = x => typeof x === 'string' && x.length > 0;
  const cek = (st, fn, pesan) => { const n = (data[st] || []).filter(x => !(obj(x) && fn(x))).length; if (n) errs.push(`${n} catatan ${st} rusak: ${pesan}`); };
  cek('kelas', k => str(k.id) && typeof k.nama === 'string' && Array.isArray(k.siswa) && k.siswa.every(s => obj(s) && str(s.id) && typeof s.nama === 'string'), 'butuh id, nama, siswa[]');
  cek('paket', p => str(p.id) && obj(p.kunci) && str(p.templateId), 'butuh id, kunci, templateId');
  cek('sesi', s => str(s.id) && obj(s.kunci) && Array.isArray(s.mondai) && str(s.kelasId), 'butuh id, kunci, mondai[], kelasId');
  cek('hasil', h => str(h.id) && str(h.sesiId) && str(h.siswaId) && obj(h.jawaban) && obj(h.nilai), 'butuh id, sesiId, siswaId, jawaban, nilai');
  cek('templat', t => str(t.id) && Array.isArray(t.struktur), 'butuh id, struktur[]');
  cek('meta', m => str(m.key), 'butuh key');
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
