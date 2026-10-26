import test from 'node:test';
import assert from 'node:assert/strict';
import { akses, handleKunci, handleNama, jalankan } from '../server/handlers.js';
import { buildKunciRequest, buildNamaRequest } from '../server/claude.js';
import { amankanSel, toCSV, toTSV } from '../src/lib/csv.js';

// pasang env sementara; tunggu fn selesai (termasuk async) sebelum memulihkan
const env = async (o, fn) => {
  const lama = Object.fromEntries(Object.keys(o).map(k => [k, process.env[k]]));
  const pasang = x => { for (const [k, v] of Object.entries(x)) { if (v == null) delete process.env[k]; else process.env[k] = v; } };
  pasang(o);
  try { return await fn(); } finally { pasang(lama); }
};

test('tanpa API key: mode manual, endpoint menolak 503', async () => {
  await env({ ANTHROPIC_API_KEY: null, KODE_AKSES: null }, async () => {
    assert.equal(akses({}, true).claude, false);
    assert.equal((await handleNama({ gambar: 'x', mediaType: 'image/jpeg' }, {}, true)).status, 503);
  });
});
test('key tanpa KODE_AKSES: hanya komputer server sendiri (localhost)', async () => {
  await env({ ANTHROPIC_API_KEY: 'sk-x', KODE_AKSES: null }, () => {
    assert.equal(akses({}, true).claude, true);
    const a = akses({}, false); assert.equal(a.claude, false); assert.match(a.alasan, /KODE_AKSES/);
  });
});
test('KODE_AKSES terlalu pendek: Claude dimatikan', async () => {
  await env({ ANTHROPIC_API_KEY: 'sk-x', KODE_AKSES: 'pendek' }, () => assert.equal(akses({ 'x-kode-akses': 'pendek' }, false).claude, false));
});
test('KODE_AKSES: salah ditolak 401, benar diterima, spasi & non-ASCII aman', async () => {
  await env({ ANTHROPIC_API_KEY: 'sk-x', KODE_AKSES: ' rahasia–lpk-2026\n' }, async () => {
    const benar = { 'x-kode-akses': encodeURIComponent('rahasia–lpk-2026') };
    assert.equal(akses({ 'x-kode-akses': 'salah-salah-salah' }).claude, false);
    assert.equal((await handleKunci({}, { 'x-kode-akses': 'salah' }, false)).status, 401);
    assert.equal(akses({ 'x-kode-akses': '%E0%A4%A' }).claude, false); // encoding rusak tidak melempar
    assert.equal(akses(benar).claude, true);
    assert.equal((await handleKunci({ gambar: 'x', mediaType: 'image/gif' }, benar, false)).status, 400);
    assert.equal((await handleKunci({ gambar: 'x', mediaType: 'image/jpeg', nomor: [], opsi: 4 }, benar, false)).status, 400);
  });
});
test('perilaku rute sama untuk Express & Vercel: 405, 404, body rusak 400', async () => {
  assert.equal((await jalankan('kunci', { method: 'GET', headers: {}, lokal: false })).status, 405);
  assert.equal((await jalankan('xyz', { method: 'GET', headers: {}, lokal: false })).status, 404);
  await env({ ANTHROPIC_API_KEY: 'sk-x', KODE_AKSES: null }, async () => {
    const r = await jalankan('nama', { method: 'POST', headers: {}, lokal: true, bacaBody: () => { throw new SyntaxError('x'); } });
    assert.equal(r.status, 400);
  });
});
test('status tidak pernah memuat API key', async () => {
  await env({ ANTHROPIC_API_KEY: 'sk-ant-RAHASIA', KODE_AKSES: null }, () => assert.ok(!JSON.stringify(akses({}, true)).includes('RAHASIA')));
});
test('bentuk permintaan Claude: model, structured output, hanya gambar yang diberikan', () => {
  const k = buildKunciRequest({ base64: 'AAA', mediaType: 'image/jpeg', nomor: [1, 2, 3], opsi: 4 });
  assert.equal(k.model, 'claude-opus-5-5'); assert.equal(k.output_config.format.type, 'json_schema');
  assert.equal(k.messages[0].content[0].source.data, 'AAA'); assert.match(k.messages[0].content[1].text, /1-3/);
  const n = buildNamaRequest({ base64: 'BBB', mediaType: 'image/jpeg' });
  assert.equal(n.messages[0].content.filter(c => c.type === 'image').length, 1);
});
test('ekspor aman dari formula injection', () => {
  assert.equal(amankanSel('=HYPERLINK("x")'), `'=HYPERLINK("x")`);
  assert.equal(amankanSel('+62 812'), "'+62 812");
  assert.equal(amankanSel(-5), -5); assert.equal(amankanSel('Nurul'), 'Nurul');
  assert.equal(amankanSel(' =1+1'), "' =1+1"); assert.equal(amankanSel('\uFF1D1+1'), "'\uFF1D1+1");
  assert.equal(toCSV([['a\rb']]), '\uFEFF"a\rb"'); assert.equal(toTSV([['a\rb']]), 'a b');
  assert.ok(toCSV([['=1+1']]).includes("'=1+1")); assert.equal(toTSV([['@SUM(A1)']]), "'@SUM(A1)");
});
