// Ukur akurasi OMR pada lembar isian sintetis.
// Pakai: node tests/accuracy/run.mjs [jumlahPolaPerFoto=3] [--simpan-contoh]
import fs from 'node:fs';
import { loadCv, readJpeg, writeJpeg } from '../../scripts/node-cv.mjs';
import { readSheet } from '../../src/lib/omr.js';
import * as S from './synth.mjs';

const nPola = Number(process.argv[2] || 3);
const gayaNama = process.argv.find(a => a.startsWith('--gaya='))?.slice(7) || 'normal';
const gaya = S.GAYA[gayaNama];
const simpanContoh = process.argv.includes('--simpan-contoh');
const cv = await loadCv();

const BASES = [
  { foto: 'samples/blank/mojigoi-a.jpg', template: 'templates/n4-mojigoi.json', catatan: 'foto yang sama dengan kalibrasi' },
  { foto: 'samples/blank/mojigoi-b.jpg', template: 'templates/n4-mojigoi.json', catatan: 'foto lain (tidak dipakai kalibrasi)' },
  { foto: 'samples/blank/bunpou-dokkai-a.jpg', template: 'templates/n4-bunpou-dokkai.json', catatan: 'foto yang sama dengan kalibrasi' },
];

const VARIASI = {
  lurus: (img) => img,
  miring: (img, s) => S.tilt(cv, img, 6 + (s % 3) * 2, 0.04),
  terbalik: (img) => S.rotate(cv, img, 180),
  rotasi90: (img) => S.rotate(cv, img, 90),
  bayangan: (img, s) => S.shadow(img, 0.45, s),
  miring_bayangan: (img, s) => S.shadow(S.tilt(cv, img, -8, 0.05), 0.4, s + 7),
  buram_ringan: (img) => S.blur(cv, img, 1.5),
};
const GERBANG = {
  buram_berat: (img) => S.blur(cv, img, 9),
  gelap: (img) => S.darken(img, 0.22),
  terpotong: (img) => S.cropBottom(img, 0.35),
};

function nilai(gt, j) {
  // hasil: 'benar' (otomatis benar), 'tinjau_benar' (ditandai tinjau, saran benar / ganda terdeteksi),
  // 'tinjau' (ditandai tinjau, saran salah), 'salah_diam' (tidak ditandai tetapi salah)
  const perluTinjau = j.status === 'ganda' || j.status === 'tidak_yakin';
  if (gt === 'ganda') return j.status === 'ganda' ? 'benar' : perluTinjau ? 'tinjau' : 'salah_diam';
  if (gt == null) return j.status === 'kosong' ? 'benar' : perluTinjau ? 'tinjau' : 'salah_diam';
  if (j.status === 'jelas') return j.pilihan === gt ? 'benar' : 'salah_diam';
  if (j.status === 'kosong') return 'salah_diam';
  return j.pilihan === gt ? 'tinjau_benar' : 'tinjau';
}

const tambah = (o, k, v = 1) => { o[k] = (o[k] || 0) + v; };
const hasil = { perVariasi: {}, perBase: {}, perJenis: {}, gerbang: [], salahDiam: [], lembarDitolak: [] };
let total = { soal: 0 };

for (const base of BASES) {
  const tpl = JSON.parse(fs.readFileSync(base.template, 'utf8'));
  const blank = readJpeg(base.foto);
  const ref = readSheet(cv, blank, tpl);
  if (!ref.ok || !ref.posisiAsli) throw new Error(`Foto dasar gagal dibaca: ${base.foto}`);
  for (let pola = 1; pola <= nPola; pola++) {
    const seed = pola * 101 + base.foto.length;
    const { img, gt, jenis } = S.fillSheet(blank, ref.posisiAsli, seed, {}, gaya);
    for (const [nama, fn] of Object.entries(VARIASI)) {
      const foto = fn(img, seed);
      if (simpanContoh && pola === 1) writeJpeg(`scratch/sintetis-${gayaNama}-${base.foto.split('/').pop().replace('.jpg', '')}-${nama}.jpg`, foto, 70);
      const r = readSheet(cv, foto, tpl);
      const kunciV = `${nama}`;
      if (!r.ok) {
        hasil.lembarDitolak.push({ foto: base.foto, pola, variasi: nama, alasan: r.alasan });
        tambah(hasil.perVariasi, `${kunciV}:ditolak`);
        continue;
      }
      for (const [no, g] of Object.entries(gt)) {
        const v = nilai(g, r.jawaban[no]);
        total.soal++;
        tambah(total, v);
        hasil.perVariasi[kunciV] ??= {}; tambah(hasil.perVariasi[kunciV], v); tambah(hasil.perVariasi[kunciV], 'soal');
        hasil.perBase[base.foto] ??= { catatan: base.catatan }; tambah(hasil.perBase[base.foto], v); tambah(hasil.perBase[base.foto], 'soal');
        hasil.perJenis[jenis[no]] ??= {}; tambah(hasil.perJenis[jenis[no]], v); tambah(hasil.perJenis[jenis[no]], 'soal');
        if (v === 'salah_diam') hasil.salahDiam.push({ foto: base.foto, pola, variasi: nama, no: Number(no), gt: g, jenis: jenis[no], baca: r.jawaban[no] });
      }
    }
    if (pola === 1) {
      for (const [nama, fn] of Object.entries(GERBANG)) {
        const r = readSheet(cv, fn(img, seed), tpl);
        hasil.gerbang.push({ foto: base.foto, variasi: nama, ditolak: !r.ok, alasan: r.alasan || null, kualitas: r.kualitas || null });
      }
    }
    process.stderr.write(`${base.foto} pola ${pola} selesai\n`);
  }
}

const pct = (a, b) => b ? (100 * a / b).toFixed(2) + '%' : '-';
const ringkas = o => ({ soal: o.soal, benar_otomatis: pct(o.benar || 0, o.soal), tinjau_saran_benar: pct(o.tinjau_benar || 0, o.soal), tinjau_saran_salah: pct(o.tinjau || 0, o.soal), salah_tanpa_tanda: pct(o.salah_diam || 0, o.soal) });
const laporan = {
  gaya: gayaNama,
  catatan: 'DATA SINTETIS: tanda pensil digambar program di atas foto lembar kosong asli. Bukan pengukuran pada lembar isian siswa sungguhan.',
  total: ringkas(total),
  perVariasi: Object.fromEntries(Object.entries(hasil.perVariasi).map(([k, v]) => [k, typeof v === 'number' ? v : ringkas(v)])),
  perFotoDasar: Object.fromEntries(Object.entries(hasil.perBase).map(([k, v]) => [k, { catatan: v.catatan, ...ringkas(v) }])),
  perJenisTanda: Object.fromEntries(Object.entries(hasil.perJenis).map(([k, v]) => [k, ringkas(v)])),
  lembarDitolak: hasil.lembarDitolak,
  gerbangKualitas: hasil.gerbang,
  contohSalahTanpaTanda: hasil.salahDiam.slice(0, 30),
  jumlahSalahTanpaTanda: hasil.salahDiam.length,
};
fs.writeFileSync(`tests/accuracy/laporan-sintetis-${gayaNama}.json`, JSON.stringify(laporan, null, 1));
console.log(JSON.stringify({ total: laporan.total, perVariasi: laporan.perVariasi, perFotoDasar: laporan.perFotoDasar, perJenisTanda: laporan.perJenisTanda, lembarDitolak: laporan.lembarDitolak, gerbang: laporan.gerbangKualitas.map(g => `${g.foto.split('/').pop()} ${g.variasi}: ${g.ditolak ? 'DITOLAK (' + g.alasan + ')' : 'LOLOS'}`), jumlahSalahTanpaTanda: laporan.jumlahSalahTanpaTanda }, null, 1));
