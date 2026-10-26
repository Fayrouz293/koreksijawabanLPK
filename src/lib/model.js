// Operasi data aplikasi di atas IndexedDB: kelas, paket, sesi, hasil, template.
import * as db from './db.js';
import { describe } from './template.js';
import { gradeSheet, kunciDariBacaan } from './grading.js';
import mojigoi from '../../templates/n4-mojigoi.json';
import bunpou from '../../templates/n4-bunpou-dokkai.json';

export const TEMPLATE_BAWAAN = [mojigoi, bunpou];

/** Tanggal hari ini menurut jam perangkat (bukan UTC), format YYYY-MM-DD. */
export function hariIni(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- template
export async function semuaTemplate() {
  const custom = await db.all('templat');
  return [...TEMPLATE_BAWAAN.map(t => ({ ...t, bawaan: true })), ...custom];
}
export async function getTemplate(id) {
  return TEMPLATE_BAWAAN.find(t => t.id === id) || (await db.get('templat', id)) || null;
}

// ------------------------------------------------------------------- kelas
export async function semuaKelas() { return (await db.all('kelas')).sort((a, b) => a.nama.localeCompare(b.nama)); }
export const getKelas = id => db.get('kelas', id);
export async function simpanKelas(k) {
  const now = new Date().toISOString();
  return db.put('kelas', { dibuat: now, ...k, id: k.id || db.uid(), diubah: now, siswa: (k.siswa || []).map(s => ({ ...s, id: s.id || db.uid() })) });
}
export async function hapusKelas(id) { await db.del('kelas', id); }

// ------------------------------------------------------------------- paket
export async function semuaPaket() { return (await db.all('paket')).sort((a, b) => (b.diubah || '').localeCompare(a.diubah || '')); }
export const getPaket = id => db.get('paket', id);
export async function paketBaru({ nama, template, batasLulus = 60 }) {
  const d = describe(template);
  const now = new Date().toISOString();
  return {
    id: db.uid(), nama, templateId: template.id, batasLulus,
    kunci: Object.fromEntries(d.soal.map(s => [s.no, null])),
    bobot: {}, mondai: d.mondai.map(m => ({ no: m.no, soal: m.soal })),
    dibuat: now, diubah: now,
  };
}
export async function simpanPaket(p) { return db.put('paket', { ...p, diubah: new Date().toISOString() }); }
export async function duplikatPaket(p) {
  const now = new Date().toISOString();
  return db.put('paket', { ...structuredClone(p), id: db.uid(), nama: `${p.nama} (salinan)`, dibuat: now, diubah: now });
}
export const hapusPaket = id => db.del('paket', id);

// -------------------------------------------------------------------- sesi
export async function semuaSesi() { return (await db.all('sesi')).sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '') || (b.dibuat || '').localeCompare(a.dibuat || '')); }
export const getSesi = id => db.get('sesi', id);
/** Sesi menyimpan salinan kunci paket; ubah kunci sesi tidak mengubah sesi lain. */
export async function sesiBaru({ paket, kelas, tanggal }) {
  const now = new Date().toISOString();
  return db.put('sesi', {
    id: db.uid(), paketId: paket.id, namaPaket: paket.nama, templateId: paket.templateId,
    kelasId: kelas.id, namaKelas: kelas.nama, tanggal: tanggal || hariIni(),
    kunci: { ...paket.kunci }, bobot: { ...paket.bobot }, mondai: paket.mondai, batasLulus: paket.batasLulus,
    status: 'aktif', dibuat: now, diubah: now,
  });
}
export async function simpanSesi(s) { return db.put('sesi', { ...s, diubah: new Date().toISOString() }); }
export async function hapusSesi(id) {
  for (const h of await hasilSesi(id)) await db.del('hasil', h.id);
  await db.del('sesi', id);
}

// ------------------------------------------------------------------- hasil
export const hasilSesi = sesiId => db.byIndex('hasil', 'sesiId', sesiId);
export const hasilSiswa = siswaId => db.byIndex('hasil', 'siswaId', siswaId);
export const getHasil = id => db.get('hasil', id);
export const hapusHasil = id => db.del('hasil', id);

export function nilaiDenganSesi(sesi, jawaban) {
  return gradeSheet({ jawaban, kunci: sesi.kunci, bobot: sesi.bobot, mondai: sesi.mondai, batasLulus: sesi.batasLulus });
}

/** Simpan hasil; nama siswa wajib sudah dikonfirmasi. */
export async function simpanHasil(sesi, h) {
  if (!h.siswaId || !h.namaDikonfirmasi) throw new Error('Nama siswa belum dikonfirmasi; hasil tidak disimpan.');
  const now = new Date().toISOString();
  const nilai = nilaiDenganSesi(sesi, h.jawaban);
  const obj = { dibuat: now, ...h, id: h.id || db.uid(), sesiId: sesi.id, nilai, status: 'dikonfirmasi', diubah: now };
  await db.put('hasil', obj);
  await simpanSesi(sesi);
  return obj;
}

/** Hitung ulang semua nilai sesi (setelah kunci/bobot/batas lulus sesi diubah). */
export async function hitungUlangSesi(sesi) {
  for (const h of await hasilSesi(sesi.id)) await db.put('hasil', { ...h, nilai: nilaiDenganSesi(sesi, h.jawaban) });
}

export async function cariHasilSiswaDiSesi(sesiId, siswaId, kecualiId) {
  return (await hasilSesi(sesiId)).find(h => h.siswaId === siswaId && h.id !== kecualiId) || null;
}

// ------------------------------------------------------- mode scan otomatis
export const ID_KELAS_OTOMATIS = 'kelas-otomatis';

/** Kelas penampung siswa yang namanya dibaca otomatis (dibuat bila belum ada). */
export async function kelasOtomatis() {
  return (await getKelas(ID_KELAS_OTOMATIS)) || simpanKelas({ id: ID_KELAS_OTOMATIS, nama: 'Siswa (scan otomatis)', siswa: [], otomatis: true });
}

/** Semua siswa dari semua kelas, untuk pencocokan nama. */
export async function semuaSiswa() {
  return (await semuaKelas()).flatMap(k => k.siswa.map(s => ({ ...s, kelasId: k.id })));
}

/** Sesi baru dari lembar kunci yang dipindai: paket + sesi dibuat otomatis, tanpa ketikan. */
export async function sesiDariLembarKunci(template, bacaan) {
  const { kunci, tidakJelas } = kunciDariBacaan(bacaan);
  const tgl = hariIni();
  const p = await paketBaru({ nama: `${template.nama} · ${tgl}`, template, batasLulus: 60 });
  p.kunci = { ...p.kunci, ...kunci };
  await simpanPaket(p);
  const kelas = await kelasOtomatis();
  const s = await sesiBaru({ paket: p, kelas, tanggal: tgl });
  s.otomatis = true;
  s.kunciTidakJelas = tidakJelas;
  await simpanSesi(s);
  return { sesi: s, tidakJelas };
}

/** Simpan hasil tanpa konfirmasi guru (mode scan otomatis). Ditandai agar bisa dicek belakangan. */
export async function simpanHasilOtomatis(sesi, h) {
  const now = new Date().toISOString();
  const nilai = nilaiDenganSesi(sesi, h.jawaban);
  const obj = { dibuat: now, ...h, id: h.id || db.uid(), sesiId: sesi.id, nilai, status: 'otomatis', namaDikonfirmasi: false, diubah: now };
  await db.put('hasil', obj);
  await simpanSesi(sesi);
  return obj;
}

/** Tambah siswa baru (nama hasil bacaan) ke kelas otomatis. */
export async function tambahSiswaOtomatis(nama, katakana = '') {
  const k = await kelasOtomatis();
  const s = { id: db.uid(), nama, katakana, nis: '', dariScan: true };
  k.siswa.push(s);
  await simpanKelas(k);
  return { ...s, kelasId: k.id };
}

export { db };
