import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClassList, parseDelimited, toCSV, toTSV } from '../src/lib/csv.js';

test('CSV dengan judul', () => {
  const r = parseClassList('No,Nama,Katakana,NIS\n1,Nurul Aini,ヌルル アイニ,2024001\n2,"Rizki, M.",,2024002\n');
  assert.deepEqual(r.siswa, [{ nama: 'Nurul Aini', katakana: 'ヌルル アイニ', nis: '2024001' }, { nama: 'Rizki, M.', katakana: '', nis: '2024002' }]);
});
test('tempel dari Sheets (TSV) tanpa judul', () => {
  const r = parseClassList('Nurul Aini\tヌルル アイニ\nTeuku Ridwan\t\t15\n');
  assert.equal(r.siswa.length, 2); assert.equal(r.siswa[0].katakana, 'ヌルル アイニ'); assert.equal(r.siswa[1].nis, '15');
});
test('daftar satu kolom', () => { assert.equal(parseClassList('A\nB\nC').siswa.length, 3); });
test('titik koma (Excel Indonesia)', () => { assert.deepEqual(parseDelimited('nama;nis\nA;1'), [['nama', 'nis'], ['A', '1']]); });
test('nama katakana saja', () => { const r = parseClassList('ヌルル'); assert.equal(r.siswa[0].katakana, 'ヌルル'); });
test('nama ganda diperingatkan', () => { assert.ok(parseClassList('A\na').peringatan.some(p => p.includes('ganda'))); });
test('ekspor CSV meloloskan koma dan kutip', () => { assert.equal(toCSV([['a,b', 'c"d']]), '﻿"a,b","c""d"'); assert.equal(toTSV([['a\tb', 1]]), 'a b\t1'); });
