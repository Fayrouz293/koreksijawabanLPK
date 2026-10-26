// E2E mode "hanya scan": tanpa kelas, tanpa ketikan.
// 1) unggah sekaligus: lembar kunci + 3 lembar siswa -> kunci dikenali, 3 hasil tersimpan otomatis
// 2) PDF 2 halaman dari "aplikasi scanner" -> 2 hasil tersimpan
// 3) kamera (video palsu berisi foto lembar) -> tertangkap otomatis sekali, tidak dobel
// Nama: respons Claude ditiru di browser (tanpa API key sungguhan).
// Pakai: npm run build && node tests/e2e/scan.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadCv, readJpeg, writeJpeg } from '../../scripts/node-cv.mjs';
import { readSheet } from '../../src/lib/omr.js';
import { jawabanOtomatis, kunciDariBacaan, gradeSheet } from '../../src/lib/grading.js';
import { describe as describeT } from '../../src/lib/template.js';
import { fillSheet } from '../accuracy/synth.mjs';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); } catch { playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')); }
const { chromium } = playwright;

const OUT = path.resolve('scratch/e2e-scan');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const PORT = 8797, BASE = `http://localhost:${PORT}`;
const hasil = [];
const cek = (nama, ok, detail = '') => { hasil.push({ nama, ok: !!ok, detail }); console.log(`${ok ? 'LOLOS' : 'GAGAL'}  ${nama}${detail ? ' - ' + detail : ''}`); };

// ---------------------------------------------------------------- fixture
const cv = await loadCv();
const tpl = JSON.parse(fs.readFileSync('templates/n4-mojigoi.json', 'utf8'));
const blank = readJpeg('samples/blank/mojigoi-b.jpg');
const pos = readSheet(cv, blank, tpl).posisiAsli;
const kunci = fillSheet(blank, pos, 4242, { normal: 1, tipis: 0, hapus: 0, kosong: 0, ganda: 0, sebagian: 0 });
writeJpeg(`${OUT}/kunci.jpg`, kunci.img, 85);
const siswa = [];
for (let i = 0; i < 6; i++) { const f = fillSheet(blank, pos, 700 + i); writeJpeg(`${OUT}/siswa${i}.jpg`, f.img, 85); siswa.push(f); }
// nilai yang diharapkan = hasil OMR yang sama di Node (memeriksa konsistensi alur, bukan akurasi)
const kunciOmr = kunciDariBacaan(readSheet(cv, readJpeg(`${OUT}/kunci.jpg`), tpl).jawaban).kunci;
const mondai = describeT(tpl).mondai;
const harapan = siswa.map((_, i) => gradeSheet({ jawaban: jawabanOtomatis(readSheet(cv, readJpeg(`${OUT}/siswa${i}.jpg`), tpl).jawaban).jawaban, kunci: kunciOmr, mondai }).persen);
// PDF 2 halaman (siswa3, siswa4) seperti keluaran aplikasi scanner
execSync(`python3 -c "from PIL import Image; a=Image.open('${OUT}/siswa3.jpg').convert('RGB'); b=Image.open('${OUT}/siswa4.jpg').convert('RGB'); a.save('${OUT}/scan.pdf', save_all=True, append_images=[b], resolution=200)"`);
// video kamera palsu: MJPEG berisi foto siswa5
execSync(`python3 -c "from PIL import Image; im=Image.open('${OUT}/siswa5.jpg').convert('RGB').resize((1600,1200)); im.save('${OUT}/f.jpg', quality=90)"`);
const frame = fs.readFileSync(`${OUT}/f.jpg`);
fs.writeFileSync(`${OUT}/kamera.mjpeg`, Buffer.concat(Array(20).fill(frame)));

// ---------------------------------------------------------------- server
const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));
const profil = path.join(OUT, 'profil');
const opsi = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true };
const NAMA_CLAUDE = ['Nurul Aini', 'Teuku Ridwan Sah', '', 'Zulfikar', 'Nurul Aini'];
let nPanggilNama = 0;
const tiruClaude = async (page) => {
  await page.route('**/api/status', r => r.fulfill({ json: { claude: true, model: 'claude-opus-5-5' } }));
  await page.route('**/api/nama', async r => {
    const n = NAMA_CLAUDE[nPanggilNama++ % NAMA_CLAUDE.length];
    await new Promise(s => setTimeout(s, 300));
    await r.fulfill({ json: n ? { terbaca: true, teks_asli: n, aksara: 'latin', latin: n, kana: '', ragu: [] } : { terbaca: false, teks_asli: '', aksara: 'tidak_terbaca', latin: '', kana: '', ragu: [] } });
  });
};
const jumlahItem = page => page.locator('#daftar-scan li').count();

let ctx = await chromium.launchPersistentContext(profil, opsi);
let page = ctx.pages()[0] || await ctx.newPage();
page.on('pageerror', e => cek('tanpa galat JS', false, e.message));
await tiruClaude(page);
let sesiId = null;
try {
  await page.goto(BASE);
  await page.waitForFunction(() => document.querySelector('#status-mode')?.textContent === 'Claude aktif');
  await page.click('#mulai-scan');
  await page.waitForSelector('h1:has-text("Scan lembar kunci")');
  cek('beranda -> Mulai scan tanpa membuat kelas/paket', true);

  // 1) unggah sekaligus
  const t0 = Date.now();
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#unggah-scan')]);
  await fc.setFiles([`${OUT}/kunci.jpg`, `${OUT}/siswa0.jpg`, `${OUT}/siswa1.jpg`, `${OUT}/siswa2.jpg`]);
  await page.waitForSelector('.banner:has-text("Selesai:")', { timeout: 120000 });
  cek('kunci dikenali otomatis (jenis lembar + 35 nomor)', await page.locator('h1:has-text("Scan lembar siswa")').count() === 1 && (await page.locator('text=N4 げんごちしき (もじ・ごい)').count()) > 0);
  cek('3 lembar siswa tersimpan tanpa ketukan', await jumlahItem(page) === 3, `${((Date.now() - t0) / 1000).toFixed(1)} dtk untuk 4 foto`);
  sesiId = (await page.evaluate(() => location.hash)).split('/')[2];
  await page.waitForFunction(() => ![...document.querySelectorAll('#daftar-scan li')].some(li => li.textContent.includes('membaca nama')), null, { timeout: 30000 });
  const teks = await page.locator('#daftar-scan').textContent();
  cek('nama dibaca (tiruan Claude) & dicatat otomatis', teks.includes('Nurul Aini') && teks.includes('Teuku Ridwan Sah') && teks.includes('Lembar'), teks.replace(/\s+/g, ' ').slice(0, 160));
  const persenUI = (await page.locator('#daftar-scan li > b').allTextContents()).map(s => parseFloat(s)).reverse();
  cek('nilai di layar = nilai OMR yang sama di Node', JSON.stringify(persenUI) === JSON.stringify(harapan.slice(0, 3)), `${persenUI.join(', ')} vs ${harapan.slice(0, 3).join(', ')}`);
  await page.screenshot({ path: `${OUT}/01-scan-unggah.png`, fullPage: true });

  // 2) PDF
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#unggah-scan')]);
  await fc2.setFiles(`${OUT}/scan.pdf`);
  await page.waitForFunction(() => document.querySelectorAll('#daftar-scan li').length === 5, null, { timeout: 120000 }).catch(() => {});
  cek('PDF 2 halaman dari aplikasi scanner -> 2 lembar tersimpan', await jumlahItem(page) === 5);

  // unggah ulang lembar terakhir yang sama -> tidak dobel
  const [fc3] = await Promise.all([page.waitForEvent('filechooser'), page.click('#unggah-scan')]);
  await fc3.setFiles(`${OUT}/siswa4.jpg`);
  await page.waitForSelector('.banner:has-text("Selesai:")', { timeout: 60000 });
  cek('lembar yang sama dipindai ulang tidak disimpan dua kali', await jumlahItem(page) === 5);
} catch (e) {
  cek('alur unggah selesai', false, e.stack.split('\n').slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/zz-galat.png`, fullPage: true }).catch(() => {});
}
await ctx.close();

// 3) kamera otomatis (video palsu)
ctx = await chromium.launchPersistentContext(profil, { ...opsi, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${OUT}/kamera.mjpeg`] });
page = ctx.pages()[0] || await ctx.newPage();
page.on('pageerror', e => cek('tanpa galat JS (kamera)', false, e.message));
await tiruClaude(page);
try {
  await page.goto(`${BASE}/#/scan/${sesiId}`);
  await page.waitForSelector('#daftar-scan li');
  const awal = await jumlahItem(page);
  const t0 = Date.now();
  await page.waitForFunction(n => document.querySelectorAll('#daftar-scan li').length > n, awal, { timeout: 90000 });
  const dtk = ((Date.now() - t0) / 1000).toFixed(1);
  await page.waitForTimeout(6000);
  const akhir = await jumlahItem(page);
  cek('kamera menangkap otomatis tanpa tombol', akhir === awal + 1, `${dtk} dtk sampai tersimpan; ${akhir - awal} hasil baru setelah 6 dtk lagi`);
  await page.screenshot({ path: `${OUT}/02-kamera.png`, fullPage: true });

  // rekap
  await page.goto(`${BASE}/#/sesi/${sesiId}`);
  await page.waitForSelector('#tabel-rekap');
  const baris = await page.locator('#tabel-rekap tr').count() - 1;
  cek('rekap berisi semua lembar', baris === 6, `${baris} baris`);
  cek('rekap menandai lembar "perlu cek" & menampilkan foto kotak nama untuk lembar tanpa nama', await page.locator('#tabel-rekap .badge:has-text("perlu cek")').count() >= 1 && await page.locator('#tabel-rekap img.namecrop').count() >= 1);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Ekspor CSV' }).click()]);
  cek('ekspor CSV', fs.readFileSync(await dl.path(), 'utf8').split('\r\n').length === 7);
  await page.screenshot({ path: `${OUT}/03-rekap.png`, fullPage: true });
  await page.goto(`${BASE}/#/kelas/kelas-otomatis`);
  await page.waitForSelector('h1');
  const isiKelas = await page.locator('ul.list').textContent();
  cek('siswa baru dari bacaan nama masuk kelas otomatis', isiKelas.includes('Zulfikar') && isiKelas.includes('Nurul Aini'));
} catch (e) {
  cek('alur kamera & rekap selesai', false, e.stack.split('\n').slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/zz-galat2.png`, fullPage: true }).catch(() => {});
}
await ctx.close();
server.kill();
const gagal = hasil.filter(x => !x.ok);
console.log(`\n${hasil.length - gagal.length}/${hasil.length} pemeriksaan lolos`);
process.exit(gagal.length ? 1 : 0);
