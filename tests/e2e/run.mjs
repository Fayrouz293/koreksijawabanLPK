// Tes alur lengkap di Chromium (Playwright) dengan layar HP:
// kelas -> sesi baru -> kunci -> pindai beruntun -> konfirmasi nama -> tinjau -> simpan -> rekap ->
// ekspor CSV -> cadangan -> tutup/buka browser -> hapus data -> impor cadangan -> offline -> mode Claude (tiruan).
// Pakai: npm run build && node tests/e2e/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadCv, readJpeg, writeJpeg } from '../../scripts/node-cv.mjs';
import { readSheet } from '../../src/lib/omr.js';
import { fillSheet } from '../accuracy/synth.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const { chromium } = playwright;

const OUT = 'scratch/e2e';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const hasil = [];
const cek = (nama, ok, detail = '') => { hasil.push({ nama, ok: !!ok, detail }); console.log(`${ok ? 'LOLOS' : 'GAGAL'}  ${nama}${detail ? ' - ' + detail : ''}`); };

// ---------------------------------------------------------------- fixture
const cv = await loadCv();
const tpl = JSON.parse(fs.readFileSync('templates/n4-mojigoi.json', 'utf8'));
const blank = readJpeg('samples/blank/mojigoi-b.jpg');
const pos = readSheet(cv, blank, tpl).posisiAsli;
const kunciSheet = fillSheet(blank, pos, 999, { normal: 1, tipis: 0, hapus: 0, kosong: 0, ganda: 0, sebagian: 0 });
writeJpeg(`${OUT}/kunci.jpg`, kunciSheet.img, 85);
const SISWA = ['Nurul Aini', 'Teuku Ridwan Syah', 'Muhammad Rizki', 'Cut Intan Nabila'];
const lembar = [];
for (let i = 0; i < 4; i++) {
  const f = fillSheet(blank, pos, 500 + i);
  writeJpeg(`${OUT}/siswa${i}.jpg`, f.img, 85);
  lembar.push(f);
}

// ---------------------------------------------------------------- server
const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: '' }, stdio: 'pipe' });
await new Promise(r => setTimeout(r, 1200));

const userDir = path.resolve(OUT, 'profil');
const opsiCtx = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] };
const launch = (dir = userDir) => chromium.launchPersistentContext(dir, { ...opsiCtx, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });

let ctx = await launch();
let page = ctx.pages()[0] || await ctx.newPage();
page.on('pageerror', e => cek('tanpa galat JS di halaman', false, e.message));
const shot = n => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

try {
  await page.goto(BASE);
  await page.waitForSelector('#status-mode');
  await page.waitForFunction(() => document.querySelector('#status-mode').textContent === 'Mode manual');
  cek('mode manual tampil tanpa API key', true);
  await shot('01-beranda');

  // --- kelas
  await page.goto(`${BASE}/#/kelas/baru`);
  await page.fill('input[type=text]', 'N4 Angkatan Uji');
  await page.fill('textarea', 'Nama\tKatakana\tNIS\n' + SISWA.map((s, i) => `${s}\t\t${100 + i}`).join('\n'));
  await page.getByRole('button', { name: 'Simpan kelas' }).click();
  await page.waitForSelector('h1:has-text("N4 Angkatan Uji")');
  cek('impor daftar kelas (tempel dari Sheets)', (await page.locator('ul.list li').count()) === 4);

  // --- sesi baru, kunci dari lembar berisi kunci (OMR lokal)
  await page.goto(`${BASE}/#/sesi/baru`);
  await page.getByRole('button', { name: /N4 Angkatan Uji/ }).click();
  await page.fill('input[placeholder^="mis. Try-out"]', 'Try-out Moji-Goi Uji');
  await page.getByRole('button', { name: 'Lanjut ke kunci' }).click();
  const tombolClaude = await page.getByRole('button', { name: 'Baca gambar kunci (Claude)' }).count();
  cek('tombol baca kunci Claude disembunyikan di mode manual', tombolClaude === 0);
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /lembar jawaban berisi kunci/ }).click()]);
  await fc.setFiles(`${OUT}/kunci.jpg`);
  await page.waitForSelector('.toast:has-text("terbaca dari lembar"), .banner.bad', { timeout: 60000 });
  const infoKunci = await page.locator('.banner:has-text("soal berkunci")').textContent();
  const nKunci = Number(infoKunci.match(/(\d+) dari/)[1]);
  // bandingkan dengan jawaban sebenarnya lembar kunci
  const salahKunci = [];
  for (let no = 1; no <= 35; no++) {
    const on = await page.locator(`.q[data-no="${no}"] .opt.on`).textContent().catch(() => null);
    if (on && Number(on) !== kunciSheet.gt[no]) salahKunci.push(no);
    if (!on) await page.locator(`.q[data-no="${no}"] .opt`).nth(kunciSheet.gt[no] - 1).click(); // isi manual yang kosong
  }
  cek('kunci dibaca dari lembar berisi kunci (lokal)', salahKunci.length === 0, `${nKunci}/35 terbaca otomatis, ${salahKunci.length} salah baca`);
  await shot('02-kunci');
  await page.getByRole('button', { name: 'Simpan kunci dan mulai pindai' }).click();
  await page.waitForSelector('h1:has-text("Pindai lembar")');
  cek('sesi aktif langsung ke layar pindai', true);

  // --- kamera palsu Chromium: gambar uji harus ditolak gerbang kualitas
  await page.waitForSelector('#ambil', { timeout: 10000 }).catch(() => null);
  if (await page.locator('#ambil').count()) {
    await page.waitForFunction(() => document.querySelector('video')?.videoWidth > 0, null, { timeout: 10000 });
    await page.click('#ambil');
    await page.waitForSelector('.banner.bad:has-text("Foto ditolak")', { timeout: 60000 });
    cek('kamera (getUserMedia) + gerbang kualitas menolak gambar tanpa lembar', true, (await page.locator('.banner.bad').textContent()).slice(0, 90));
    await shot('03-ditolak');
    await page.getByRole('button', { name: 'Foto ulang' }).click();
  } else cek('kamera (getUserMedia) tersedia di localhost', false);

  // --- pindai beruntun (unggah beberapa foto sekaligus)
  const pindai = async (file, namaSiswa, harapanTimpa = false) => {
    const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Unggah foto/ }).click()]);
    await fc2.setFiles(file);
    await page.waitForSelector('text=Nama siswa: belum dikonfirmasi', { timeout: 60000 });
    const simpan = page.getByRole('button', { name: 'Simpan dan lembar berikutnya' });
    const disabledAwal = await simpan.isDisabled();
    // tinjau soal yang ditandai
    const perlu = await page.locator('.qgrid .q.perlu').count();
    for (let i = 0; i < 40; i++) {
      const q = page.locator('.qgrid .q.perlu').first();
      if (!(await q.count())) break;
      await q.locator('.opt').first().click();
    }
    await page.fill('input[type=search]', namaSiswa.split(' ')[0]);
    await page.locator('.cands button', { hasText: namaSiswa }).first().click();
    if (harapanTimpa) {
      await page.waitForSelector('text=Siswa sudah dipindai');
      await page.getByRole('button', { name: 'Timpa' }).click();
    }
    await page.waitForSelector('text=Nama siswa (dikonfirmasi)');
    await shot(`04-tinjau-${namaSiswa.split(' ')[0]}`);
    await simpan.click();
    await page.waitForSelector('.toast-ok:has-text("Tersimpan")', { timeout: 10000 });
    return { disabledAwal, perlu };
  };
  const r0 = await pindai(`${OUT}/siswa0.jpg`, SISWA[0]);
  cek('tombol simpan terkunci sebelum nama dikonfirmasi', r0.disabledAwal);
  for (let i = 1; i < 3; i++) await pindai(`${OUT}/siswa${i}.jpg`, SISWA[i]);
  const r3 = await pindai(`${OUT}/siswa3.jpg`, SISWA[0], true);
  cek('siswa ganda di sesi: peringatan + timpa', true, `${r3.perlu} soal ditinjau`);

  // --- rekap
  const sesiId = (await page.evaluate(() => location.hash)).split('/')[2];
  await page.goto(`${BASE}/#/sesi/${sesiId}`);
  await page.waitForSelector('#tabel-rekap');
  const nBaris = await page.locator('#tabel-rekap tr').count() - 1;
  cek('rekap: 3 siswa (lembar ke-4 menimpa)', nBaris === 3, `${nBaris} baris`);
  const statTeks = await page.locator('.stats').textContent();
  cek('rekap: rata-rata/tertinggi/terendah tampil', /Rata-rata[\d.]+%/.test(statTeks) && /Tertinggi/.test(statTeks));
  cek('rekap: soal paling sering salah tampil', await page.locator('h2:has-text("Soal paling sering salah")').count() === 1);
  await shot('05-rekap');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Ekspor CSV' }).click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  cek('ekspor CSV', csv.includes('Nama,NIS,Skor') && csv.split('\r\n').length === 4, `${csv.split('\r\n').length - 1} baris data`);
  await page.getByRole('button', { name: 'Salin untuk Sheets' }).click();
  const tsv = await page.evaluate(() => navigator.clipboard.readText());
  cek('salin tabel TSV untuk Sheets', tsv.split('\n')[0].startsWith('Nama\tNIS\tSkor'));

  // --- koreksi sel setelah simpan
  await page.locator('#tabel-rekap a.btn').first().click();
  await page.waitForSelector('text=Simpan perubahan');
  cek('hasil tersimpan bisa ditinjau ulang dengan foto', await page.locator('.photo canvas').count() === 1);

  // --- riwayat siswa
  await page.goto(`${BASE}/#/kelas`);
  await page.getByRole('link', { name: 'Buka' }).first().click();
  await page.locator('li', { hasText: SISWA[0] }).getByRole('link', { name: 'Riwayat' }).click();
  await page.waitForURL(/\/siswa\//);
  await page.waitForSelector('table.data, p.muted');
  await shot('05b-riwayat');
  cek('riwayat per siswa', await page.locator('table.data tr').count() >= 2, `${await page.locator('table.data tr').count() - 1} baris`);

  // --- cadangan
  await page.goto(`${BASE}/#/pengaturan`);
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Ekspor cadangan (JSON)' }).click()]);
  const backupPath = `${OUT}/cadangan.json`;
  fs.copyFileSync(await dl2.path(), backupPath);
  const bk = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  cek('ekspor cadangan JSON', bk.data.hasil.length === 3 && bk.data.hasil.every(h => typeof h.foto === 'string' && h.foto.startsWith('data:image/jpeg')), `${(fs.statSync(backupPath).size / 1e6).toFixed(2)} MB`);

  // --- tutup browser, buka lagi: sesi bertahan
  await ctx.close();
  ctx = await launch();
  page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector('h2:has-text("Sesi aktif")');
  cek('sesi bertahan setelah browser ditutup & dibuka', await page.locator('text=Try-out Moji-Goi Uji').count() > 0 && await page.locator('text=3/4 lembar').count() > 0);

  // --- offline: aplikasi & OMR tetap jalan (service worker)
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#status-mode', { timeout: 15000 });
  const modeOffline = await page.locator('#status-mode').textContent();
  await page.goto(`${BASE}/#/sesi/${sesiId}/pindai`);
  const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Unggah foto/ }).click()]);
  await fc3.setFiles(`${OUT}/siswa2.jpg`);
  const okOffline = await page.waitForSelector('text=Nama siswa: belum dikonfirmasi', { timeout: 60000 }).then(() => true).catch(() => false);
  cek('offline: aplikasi terbuka dan OMR jalan', okOffline && modeOffline === 'Mode manual');
  await ctx.setOffline(false);

  // --- perangkat/profil browser baru (data kosong) lalu impor cadangan
  await ctx.close();
  ctx = await launch(path.resolve(OUT, 'profil-baru'));
  page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(`${BASE}/#/sesi`);
  await page.waitForSelector('h1:has-text("Sesi")');
  const kosong = await page.locator('text=Belum ada sesi.').count();
  await page.goto(`${BASE}/#/pengaturan`);
  const [fc4] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Impor cadangan' }).click()]);
  await fc4.setFiles(backupPath);
  await page.getByRole('button', { name: 'Ganti semua data' }).click();
  await page.waitForSelector('.toast-ok:has-text("Dipulihkan")', { timeout: 15000 });
  await page.goto(`${BASE}/#/sesi/${sesiId}`);
  await page.waitForSelector('#tabel-rekap');
  const nPulih = await page.locator('#tabel-rekap tr').count() - 1;
  await page.locator('#tabel-rekap a.btn').first().click();
  await page.waitForSelector('.photo canvas');
  cek('impor cadangan memulihkan semuanya (termasuk foto)', kosong === 1 && nPulih === 3, `data kosong sebelum impor: ${kosong === 1}, baris pulih: ${nPulih}`);

  // --- mode Claude (respons API ditiru di browser; tanpa API key sungguhan)
  await page.route('**/api/status', r => r.fulfill({ json: { claude: true, model: 'claude-opus-5-5' } }));
  let kirimNama = null;
  await page.route('**/api/nama', async r => { kirimNama = r.request().postDataJSON(); await r.fulfill({ json: { terbaca: true, teks_asli: 'Teuku Ridwan Sah', aksara: 'latin', latin: 'Teuku Ridwan Sah', kana: '', ragu: [] } }); });
  await page.route('**/api/kunci', r => r.fulfill({ json: { jawaban: Object.fromEntries(Array.from({ length: 35 }, (_, i) => [i + 1, i === 6 ? null : ((i % 4) + 1)])), catatan: { 7: 'nomor 7 tertutup' }, ringkasan: 'Tabel kunci tulisan tangan.' } }));
  await page.goto(BASE);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#status-mode')?.textContent === 'Claude aktif');
  await page.goto(`${BASE}/#/sesi/${sesiId}/pindai`);
  const [fc5] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /Unggah foto/ }).click()]);
  await fc5.setFiles(`${OUT}/siswa1.jpg`);
  await page.waitForSelector('button:has-text("Benar: Teuku Ridwan Syah")', { timeout: 60000 });
  const fotoKirim = kirimNama ? Buffer.from(kirimNama.gambar, 'base64').length : 0;
  cek('Claude: nama salah 1 huruf -> kandidat kuat, satu ketukan konfirmasi', true);
  cek('Claude: yang dikirim hanya potongan kotak nama', kirimNama && fotoKirim < 200000 && Object.keys(kirimNama).sort().join() === 'gambar,mediaType', `${(fotoKirim / 1024).toFixed(0)} KB`);
  await shot('06-nama-claude');
  await page.click('button:has-text("Benar: Teuku Ridwan Syah")');
  await page.waitForSelector('text=Siswa sudah dipindai');
  await page.getByRole('button', { name: 'Batal' }).click();
  cek('Claude: cek siswa ganda tetap berlaku', await page.locator('text=Nama siswa: belum dikonfirmasi').count() === 1);
  await page.goto(`${BASE}/#/sesi/${sesiId}/kunci`);
  await page.waitForSelector('text=Baca gambar kunci (Claude)');
  cek('UI menyebut data keluar perangkat sebelum kirim kunci', (await page.locator('.datakeluar').textContent()).includes('Data keluar perangkat'));
  const [fc6] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Baca gambar kunci (Claude)' }).click()]);
  await fc6.setFiles(`${OUT}/kunci.jpg`);
  await page.waitForSelector('text=Tabel kunci tulisan tangan');
  const info2 = await page.locator('.banner:has-text("soal berkunci")').textContent();
  cek('Claude: kunci terbaca, nomor tak terbaca dibiarkan kosong & ditandai', info2.includes('34 dari 35') && info2.includes('Belum ada kunci: 7') && await page.locator('.q.kosongkunci[data-no="7"]').count() === 1);
  await shot('07-kunci-claude');
} catch (e) {
  cek('alur selesai tanpa pengecualian', false, e.stack.split('\n').slice(0, 3).join(' | '));
  await shot('zz-galat').catch(() => {});
} finally {
  await ctx.close().catch(() => {});
  server.kill();
}

// --- API key tidak masuk bundle browser
const RAHASIA = 'sk-ant-api03-RAHASIA-JANGAN-BOCOR-123';
execSync('npx vite build --outDir scratch/e2e/dist-cek', { env: { ...process.env, ANTHROPIC_API_KEY: RAHASIA }, stdio: 'ignore' });
const isiBundle = fs.readdirSync('scratch/e2e/dist-cek', { recursive: true }).filter(f => /\.(js|html|css)$/.test(f)).map(f => fs.readFileSync(path.join('scratch/e2e/dist-cek', f), 'utf8')).join('');
cek('API key tidak ada di bundle browser', !isiBundle.includes(RAHASIA) && !isiBundle.includes('ANTHROPIC_API_KEY'));
const srv2 = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT + 1), ANTHROPIC_API_KEY: RAHASIA }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1000));
const st = await (await fetch(`http://localhost:${PORT + 1}/api/status`)).text();
const html = await (await fetch(`http://localhost:${PORT + 1}/`)).text();
srv2.kill();
cek('API key tidak dikirim server ke browser', !st.includes(RAHASIA) && !html.includes(RAHASIA), st);

const gagal = hasil.filter(h => !h.ok);
fs.writeFileSync(`${OUT}/hasil.json`, JSON.stringify(hasil, null, 1));
console.log(`\n${hasil.length - gagal.length}/${hasil.length} pemeriksaan lolos`);
process.exit(gagal.length ? 1 : 0);
