// Penanganan permintaan /api/*: dipakai bersama oleh server Express lokal (server/index.js)
// dan fungsi Vercel (api/*.js).
//
// Pengaman biaya: siapa pun yang bisa menjangkau endpoint ini bisa memakai API key. Aturannya:
//  - Tanpa KODE_AKSES: Claude hanya melayani permintaan dari komputer server itu sendiri
//    (localhost). Dari HP di Wi-Fi atau dari internet -> ditolak.
//  - Dengan KODE_AKSES (minimal 12 karakter): setiap permintaan wajib membawa kode yang sama.
//    Kode pendek ditolak karena bisa ditebak berulang-ulang (endpoint tidak membatasi percobaan).
import { timingSafeEqual } from 'node:crypto';
import { MODEL, hasKey, bacaKunci, bacaNama, errorInfo } from './claude.js';

const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const PANJANG_KODE_MIN = 12;

function kodeServer() { return String(process.env.KODE_AKSES || '').trim(); }

function kodeDariHeader(headers) {
  const raw = headers?.['x-kode-akses'];
  if (!raw) return '';
  try { return decodeURIComponent(String(raw)).trim(); } catch { return ''; }
}

function kodeCocok(diberikan, seharusnya) {
  const a = Buffer.from(diberikan, 'utf8'), b = Buffer.from(seharusnya, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Status akses Claude untuk satu permintaan.
 * @param headers header HTTP (huruf kecil)
 * @param lokal   true bila permintaan berasal dari komputer server sendiri (loopback)
 */
export function akses(headers = {}, lokal = false) {
  const kode = kodeServer();
  if (!hasKey()) return { claude: false, alasan: 'API key belum diatur di server (mode manual)', perluKode: false };
  if (kode && kode.length < PANJANG_KODE_MIN) return { claude: false, alasan: `KODE_AKSES di server terlalu pendek (minimal ${PANJANG_KODE_MIN} karakter); fitur Claude dimatikan`, perluKode: false };
  if (!kode) {
    if (lokal) return { claude: true, model: MODEL, perluKode: false };
    return { claude: false, alasan: 'Server tanpa KODE_AKSES hanya melayani Claude dari komputer server sendiri. Atur KODE_AKSES di server untuk dipakai dari HP/internet.', perluKode: false };
  }
  if (!kodeCocok(kodeDariHeader(headers), kode)) return { claude: false, alasan: 'Kode akses server belum diisi atau salah (Lainnya > Pengaturan)', perluKode: true, kodeSalah: true };
  return { claude: true, model: MODEL, perluKode: true };
}

function parseImage(body) {
  const { gambar, mediaType } = body || {};
  if (typeof gambar !== 'string' || !MEDIA.has(mediaType)) throw Object.assign(new Error('Gambar tidak sah'), { status: 400, kode: 'masukan' });
  // batas ~3 MB data biner (base64 ~4 MB) agar muat di batas body fungsi serverless (4,5 MB)
  if (gambar.length > 4_000_000) throw Object.assign(new Error('Gambar terlalu besar'), { status: 413, kode: 'masukan' });
  return { base64: gambar.replace(/^data:[^,]*,/, ''), mediaType };
}

function tolak(a) { return { status: a.kodeSalah ? 401 : 503, json: { kode: a.kodeSalah ? 'kode_akses' : 'tanpa_akses', pesan: a.alasan } }; }

/** Jalankan fn hanya bila akses Claude diizinkan; galat diubah ke bentuk JSON {kode, pesan}. */
async function denganAkses(label, headers, lokal, fn) {
  const a = akses(headers, lokal);
  if (!a.claude) return tolak(a);
  try {
    return { status: 200, json: await fn() };
  } catch (e) {
    const info = errorInfo(e);
    console.error(`[${label}]`, info.kode, e.message);
    return { status: info.status, json: { kode: info.kode, pesan: info.pesan } };
  }
}

export function handleStatus(body, headers, lokal) {
  return { status: 200, json: akses(headers, lokal) };
}

export function handleKunci(body, headers, lokal) {
  return denganAkses('kunci', headers, lokal, () => {
    const img = parseImage(body);
    const nomor = body.nomor;
    const opsi = Number(body.opsi);
    if (!Array.isArray(nomor) || !nomor.length || nomor.length > 500 || !nomor.every(Number.isInteger) || !(opsi >= 2 && opsi <= 10)) {
      throw Object.assign(new Error('Daftar nomor/opsi tidak sah'), { status: 400, kode: 'masukan' });
    }
    return bacaKunci({ ...img, nomor, opsi });
  });
}

export function handleNama(body, headers, lokal) {
  return denganAkses('nama', headers, lokal, () => bacaNama(parseImage(body)));
}

export const RUTE = {
  status: { metode: 'GET', handler: handleStatus },
  kunci: { metode: 'POST', handler: handleKunci },
  nama: { metode: 'POST', handler: handleNama },
};

/** Jalankan satu rute; dipakai Express & Vercel agar perilakunya sama (405, galat JSON). */
export async function jalankan(nama, { method, headers, bacaBody, lokal }) {
  const r = RUTE[nama];
  if (!r) return { status: 404, json: { kode: 'tidak_ada', pesan: 'Endpoint tidak ada' } };
  if (method !== r.metode) return { status: 405, json: { kode: 'metode', pesan: 'Metode tidak diizinkan' } };
  let body = null;
  if (r.metode === 'POST') {
    try { body = bacaBody(); } catch { return { status: 400, json: { kode: 'masukan', pesan: 'Body JSON tidak sah' } }; }
  }
  return r.handler(body, headers, lokal);
}

/** Adaptor fungsi Vercel. Permintaan di Vercel tidak pernah dianggap lokal. */
export function vercelAdapter(nama) {
  return async (req, res) => {
    const out = await jalankan(nama, { method: req.method, headers: req.headers, bacaBody: () => req.body, lokal: false });
    res.setHeader('Cache-Control', 'no-store');
    res.status(out.status).json(out.json);
  };
}
