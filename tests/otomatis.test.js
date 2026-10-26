import test from 'node:test';
import assert from 'node:assert/strict';
import { jawabanOtomatis, kunciDariBacaan, sidikJawaban } from '../src/lib/grading.js';
import { putuskanNama } from '../src/lib/otomatis.js';

const bacaan = { 1: { status: 'jelas', pilihan: 2 }, 2: { status: 'kosong', pilihan: null }, 3: { status: 'tidak_yakin', pilihan: 4 }, 4: { status: 'ganda', pilihan: null, ganda: [1, 3] } };

test('jawaban otomatis: jelas dipakai, ragu pakai saran + ditandai, ganda tidak sah + ditandai', () => {
  const r = jawabanOtomatis(bacaan);
  assert.deepEqual(r.jawaban, { 1: 2, 2: null, 3: 4, 4: null });
  assert.deepEqual(r.perluCek, [3, 4]);
});
test('kunci dari lembar kunci: hanya bulatan jelas, sisanya tanpa kunci', () => {
  const r = kunciDariBacaan(bacaan);
  assert.deepEqual(r.kunci, { 1: 2, 2: null, 3: null, 4: null });
  assert.deepEqual(r.tidakJelas, [2, 3, 4]);
});
test('sidik lembar: sama untuk bacaan sama, beda bila satu jawaban beda', () => {
  assert.equal(sidikJawaban(bacaan), sidikJawaban(structuredClone(bacaan)));
  const b2 = structuredClone(bacaan); b2[1].pilihan = 3;
  assert.notEqual(sidikJawaban(bacaan), sidikJawaban(b2));
});

const siswa = [{ id: 'a', nama: 'Nurul Aini' }, { id: 'b', nama: 'Teuku Ridwan Syah' }, { id: 'c', nama: 'Muhammad Rizki' }, { id: 'd', nama: 'Muhammad Fadil' }];
test('nama: tanpa Claude -> Lembar n, ditandai', () => { const r = putuskanNama(null, siswa, 7); assert.equal(r.status, 'tanpa_nama'); assert.equal(r.nama, 'Lembar 7'); assert.ok(r.perluCek); });
test('nama: tidak terbaca -> Lembar n', () => assert.equal(putuskanNama({ terbaca: false, teks_asli: '' }, siswa, 2).status, 'tanpa_nama'));
test('nama: cocok kuat -> siswa itu, tanpa tanda', () => { const r = putuskanNama({ terbaca: true, teks_asli: 'Nurul Ainy', latin: 'Nurul Ainy' }, siswa, 1); assert.equal(r.status, 'cocok'); assert.equal(r.siswaId, 'a'); assert.equal(r.perluCek, false); });
test('nama: ambigu -> kandidat teratas + ditandai', () => { const r = putuskanNama({ terbaca: true, teks_asli: 'Muhammad', latin: 'Muhammad' }, siswa, 1); assert.equal(r.status, 'cocok_lemah'); assert.ok(r.perluCek); });
test('nama: tidak ada di daftar -> siswa baru dengan nama terbaca', () => { const r = putuskanNama({ terbaca: true, teks_asli: 'Zulfikar', latin: 'Zulfikar' }, siswa, 1); assert.equal(r.status, 'baru'); assert.equal(r.nama, 'Zulfikar'); });
test('nama: daftar kosong -> siswa baru', () => assert.equal(putuskanNama({ terbaca: true, teks_asli: 'Nurul', latin: 'Nurul' }, [], 1).status, 'baru'));
