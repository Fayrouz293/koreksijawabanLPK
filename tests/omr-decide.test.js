import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, DEFAULT_AMBANG as A } from '../src/lib/omr.js';

test('satu bulatan gelap, lainnya bersih -> jelas', () => { const r = decide([0.02, 0.5, 0.01, 0.0], A); assert.equal(r.status, 'jelas'); assert.equal(r.pilihan, 2); assert.ok(r.kepercayaan > 0.8); });
test('semua bersih -> kosong', () => { const r = decide([0.01, 0.02, 0.0, 0.03], A); assert.equal(r.status, 'kosong'); assert.equal(r.pilihan, null); });
test('dua bulatan gelap setara -> ganda', () => { const r = decide([0.45, 0.4, 0.01, 0], A); assert.equal(r.status, 'ganda'); assert.deepEqual(r.ganda, [1, 2]); });
test('tanda tipis di bawah ambang -> tidak_yakin dengan saran', () => { const r = decide([0.0, 0.0, 0.1, 0.0], A); assert.equal(r.status, 'tidak_yakin'); assert.equal(r.pilihan, 3); });
test('sisa hapusan kecil di samping tanda kuat -> tetap jelas', () => { const r = decide([0.6, 0.1, 0, 0], A); assert.equal(r.status, 'jelas'); assert.equal(r.pilihan, 1); });
test('bulatan kedua sedang (antara rasio jelas dan ganda) -> tidak_yakin', () => { const r = decide([0.5, 0.2, 0, 0], A); assert.equal(r.status, 'tidak_yakin'); assert.equal(r.pilihan, 1); });
test('kepercayaan selalu 0..1', () => { for (const s of [[0, 0, 0, 0], [1, 1, 1, 1], [0.9, 0, 0, 0], [0.2, 0.19, 0, 0]]) { const k = decide(s, A).kepercayaan; assert.ok(k >= 0 && k <= 1, `${s} -> ${k}`); } });
