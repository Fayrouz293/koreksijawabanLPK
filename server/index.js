// Server lokal kecil: meneruskan dua jenis permintaan ke Claude API dengan API key
// dari file .env (tidak pernah dikirim ke browser), dan menyajikan hasil build aplikasi.
// Jalankan: node --env-file-if-exists=.env server/index.js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, hasKey, bacaKunci, bacaNama, errorInfo } from './claude.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '15mb' }));

const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp']);
function parseImage(body) {
  const { gambar, mediaType } = body || {};
  if (typeof gambar !== 'string' || !MEDIA.has(mediaType)) throw Object.assign(new Error('Gambar tidak sah'), { status: 400, kode: 'masukan' });
  return { base64: gambar.replace(/^data:[^,]*,/, ''), mediaType };
}

app.get('/api/status', (req, res) => {
  res.json({ claude: hasKey(), model: hasKey() ? MODEL : null });
});

app.post('/api/kunci', async (req, res) => {
  try {
    const img = parseImage(req.body);
    const nomor = req.body.nomor;
    const opsi = Number(req.body.opsi);
    if (!Array.isArray(nomor) || !nomor.length || !nomor.every(Number.isInteger) || !(opsi >= 2)) throw Object.assign(new Error('Daftar nomor/opsi tidak sah'), { status: 400, kode: 'masukan' });
    res.json(await bacaKunci({ ...img, nomor, opsi }));
  } catch (e) {
    const info = errorInfo(e);
    console.error('[kunci]', info.kode, e.message);
    res.status(info.status).json(info);
  }
});

app.post('/api/nama', async (req, res) => {
  try {
    res.json(await bacaNama(parseImage(req.body)));
  } catch (e) {
    const info = errorInfo(e);
    console.error('[nama]', info.kode, e.message);
    res.status(info.status).json(info);
  }
});

// produksi: sajikan dist/ (hasil `npm run build`)
const dist = path.join(here, '..', 'dist');
app.use(express.static(dist, { index: 'index.html', maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get(/^\/(?!api\/).*/, (req, res, next) => res.sendFile(path.join(dist, 'index.html'), err => err && next()));

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Server koreksi berjalan di http://localhost:${port}`);
  console.log(hasKey() ? `Claude API aktif (model ${MODEL}).` : 'ANTHROPIC_API_KEY tidak ada: aplikasi berjalan dalam mode manual.');
});
