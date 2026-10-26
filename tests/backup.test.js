import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackup, FORMAT } from '../src/lib/backup.js';

const ok = { format: FORMAT, versi: 1, dibuat: '2026-10-01T00:00:00Z', data: {
  kelas: [{ id: 'k1', nama: 'A', siswa: [{ id: 's1', nama: 'Nurul' }] }], paket: [{ id: 'p', kunci: { 1: 1 }, templateId: 'n4-mojigoi' }],
  sesi: [{ id: 'x', kunci: { 1: 1 }, mondai: [], kelasId: 'k1' }], hasil: [{ id: 'h', sesiId: 'x', siswaId: 's1', jawaban: {}, nilai: {} }], templat: [], meta: [{ key: 'a', value: 1 }] } };

test('cadangan sah diterima', () => assert.deepEqual(validateBackup(ok), []));
test('bukan file cadangan ditolak', () => assert.ok(validateBackup({ a: 1 }).length));
test('versi lebih baru ditolak', () => assert.ok(validateBackup({ ...ok, versi: 99 }).length));
test('catatan rusak ditolak sebelum mengganti data', () => {
  const rusak = structuredClone(ok); rusak.data.kelas[0].siswa = null; rusak.data.hasil.push({ id: 'z' });
  const e = validateBackup(rusak);
  assert.ok(e.some(x => x.includes('kelas')) && e.some(x => x.includes('hasil')), e.join('; '));
});
