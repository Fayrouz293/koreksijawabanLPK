import test from 'node:test';
import assert from 'node:assert/strict';
import { matchName, jaroWinkler, normKana } from '../src/lib/namematch.js';

// Daftar fiktif untuk pengujian (bukan data siswa sungguhan)
const kelas = [
  { id: 'a', nama: 'Muhammad Rizki', katakana: 'ムハマド リズキ' },
  { id: 'b', nama: 'Muhammad Fadil' },
  { id: 'c', nama: 'Nurul Aini', katakana: 'ヌルル アイニ' },
  { id: 'd', nama: 'Cut Nyak Dhien' },
  { id: 'e', nama: 'Teuku Ridwan Syah' },
  { id: 'f', nama: 'Rizki Ananda' },
];

test('nama persis: kuat', () => { const r = matchName({ latin: 'Nurul Aini' }, kelas); assert.equal(r.status, 'kuat'); assert.equal(r.kandidat[0].id, 'c'); });
test('salah satu huruf: kuat', () => { const r = matchName({ latin: 'Nurul Ainy' }, kelas); assert.equal(r.kandidat[0].id, 'c'); assert.equal(r.status, 'kuat'); });
test('urutan terbalik', () => { const r = matchName({ latin: 'Ridwan Syah Teuku' }, kelas); assert.equal(r.kandidat[0].id, 'e'); });
test('singkatan inisial', () => { const r = matchName({ latin: 'M. Rizki' }, kelas); assert.equal(r.kandidat[0].id, 'a'); });
test('katakana dicocokkan ke field katakana', () => { const r = matchName({ kana: 'ヌルルアイニ' }, kelas); assert.equal(r.kandidat[0].id, 'c'); assert.equal(r.status, 'kuat'); });
test('hiragana dinormalisasi ke katakana', () => { assert.equal(normKana('ぬるる・あいに'), 'ヌルルアイニ'); });
test('ambigu: dua kandidat dekat => lemah, 3 teratas', () => {
  const r = matchName({ latin: 'Muhammad' }, kelas); assert.notEqual(r.status, 'kuat'); assert.equal(r.kandidat.length, 3);
});
test('tidak ada yang mirip => tidak_cocok', () => { const r = matchName({ latin: 'Xavier Wong' }, kelas); assert.equal(r.status, 'tidak_cocok'); });
test('jaro-winkler simetris dan 1 untuk sama', () => { assert.equal(jaroWinkler('aceh', 'aceh'), 1); assert.equal(jaroWinkler('martha', 'marhta').toFixed(3), jaroWinkler('marhta', 'martha').toFixed(3)); });
