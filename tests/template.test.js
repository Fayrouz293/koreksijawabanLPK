import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, validateTemplate, parseRows } from '../src/lib/template.js';

for (const f of ['n4-mojigoi', 'n4-bunpou-dokkai']) {
  test(`template ${f} valid & 35 soal berurutan`, () => {
    const t = JSON.parse(fs.readFileSync(`templates/${f}.json`, 'utf8'));
    assert.deepEqual(validateTemplate(t), []);
    const d = describe(t);
    assert.equal(d.jumlahSoal, 35);
    assert.deepEqual(d.soal.map(s => s.no), Array.from({ length: 35 }, (_, i) => i + 1));
  });
}
test('struktur tidak sah ditolak', () => {
  assert.throws(() => parseRows(['X1']));
  assert.ok(validateTemplate({ id: 'x', nama: 'x', opsi: 4, struktur: [{ id: 'T1', baris: ['1-3'] }] }).length > 0); // soal tanpa judul mondai
  assert.ok(validateTemplate({ id: 'x', nama: 'x', opsi: 4, struktur: [{ id: 'T1', baris: ['M1', '1-3', '3'] }] }).length > 0); // nomor ganda
});
