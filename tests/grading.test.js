import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeSheet, rekapSesi, finalAnswers } from '../src/lib/grading.js';

const mondai = [{ no: 1, soal: [1, 2, 3] }, { no: 2, soal: [4, 5] }];
const kunci = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 1 };

test('skor dasar, persen, lulus, per mondai', () => {
  const r = gradeSheet({ jawaban: { 1: 1, 2: 2, 3: 4, 4: 4, 5: null }, kunci, mondai, batasLulus: 60 });
  assert.equal(r.skor, 3); assert.equal(r.skorMaks, 5); assert.equal(r.persen, 60); assert.equal(r.lulus, true);
  assert.deepEqual(r.salah, [3, 5]);
  assert.deepEqual(r.perMondai.map(m => [m.no, m.skor, m.maks, m.persen]), [[1, 2, 3, 66.67], [2, 1, 2, 50]]);
});

test('batas lulus: tepat di bawah batas tidak lulus', () => {
  const r = gradeSheet({ jawaban: { 1: 1, 2: 2 }, kunci, batasLulus: 60 });
  assert.equal(r.persen, 40); assert.equal(r.lulus, false);
});

test('bobot per soal', () => {
  const r = gradeSheet({ jawaban: { 1: 1, 2: 1, 3: 3, 4: 4, 5: 1 }, kunci, bobot: { 1: 3, 2: 2 } });
  assert.equal(r.skorMaks, 3 + 2 + 1 + 1 + 1); assert.equal(r.skor, 3 + 0 + 1 + 1 + 1);
});

test('bobot tidak sah jatuh ke 1, bobot 0 diterima', () => {
  const r = gradeSheet({ jawaban: { 1: 1 }, kunci: { 1: 1, 2: 2 }, bobot: { 1: -5, 2: 0 } });
  assert.equal(r.skorMaks, 1); assert.equal(r.skor, 1);
});

test('soal tanpa kunci tidak dinilai', () => {
  const r = gradeSheet({ jawaban: { 1: 1, 2: 3 }, kunci: { 1: 1, 2: null } });
  assert.equal(r.skorMaks, 1); assert.deepEqual(r.tanpaKunci, [2]); assert.equal(r.perSoal[2].benar, null);
});

test('kunci kosong: persen 0 dan tidak lulus', () => {
  const r = gradeSheet({ jawaban: {}, kunci: {} });
  assert.equal(r.persen, 0); assert.equal(r.lulus, false);
});

test('fungsi murni: masukan tidak berubah', () => {
  const j = { 1: 1 }; const k = { 1: 1, 2: 2 }; const cj = structuredClone(j); const ck = structuredClone(k);
  gradeSheet({ jawaban: j, kunci: k }); assert.deepEqual(j, cj); assert.deepEqual(k, ck);
});

test('rekap sesi: rata-rata, tertinggi, terendah, soal sering salah', () => {
  const a = gradeSheet({ jawaban: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 1 }, kunci });
  const b = gradeSheet({ jawaban: { 1: 1, 2: 1, 3: 1, 4: 4, 5: 1 }, kunci });
  const c = gradeSheet({ jawaban: { 1: 2, 2: 1, 3: 3, 4: 1, 5: 1 }, kunci });
  const r = rekapSesi([{ nama: 'A', nilai: a }, { nama: 'B', nilai: b }, { nama: 'C', nilai: c }]);
  assert.equal(r.rataRata, 66.67); assert.deepEqual(r.tertinggi, { persen: 100, nama: ['A'] }); assert.deepEqual(r.terendah, { persen: 40, nama: ['C'] });
  assert.deepEqual(r.soalSeringSalah[0], { no: 2, jumlah: 2, persen: 66.67 });
  assert.equal(r.lulus, 2);
  assert.equal(rekapSesi([]).jumlah, 0);
});

test('jawaban final: ganda/tidak yakin harus dikoreksi', () => {
  const bacaan = { 1: { status: 'jelas', pilihan: 2 }, 2: { status: 'kosong', pilihan: null }, 3: { status: 'ganda', pilihan: null }, 4: { status: 'tidak_yakin', pilihan: 3 } };
  let f = finalAnswers(bacaan);
  assert.deepEqual(f.belum, [3, 4]); assert.equal(f.jawaban[1], 2); assert.equal(f.jawaban[2], null);
  f = finalAnswers(bacaan, { 3: null, 4: 3, 1: 4 });
  assert.deepEqual(f.belum, []); assert.equal(f.jawaban[1], 4); assert.equal(f.jawaban[4], 3);
});
