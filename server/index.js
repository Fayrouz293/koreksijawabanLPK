// Server lokal kecil: meneruskan dua jenis permintaan ke Claude API dengan API key
// dari file .env (tidak pernah dikirim ke browser), dan menyajikan hasil build aplikasi.
// Jalankan: node --env-file-if-exists=.env server/index.js
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL, hasKey } from './claude.js';
import { jalankan } from './handlers.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
// Permintaan lewat tunnel/reverse proxy (ngrok, cloudflared) datang dari loopback tetapi membawa
// x-forwarded-for: itu tidak dianggap lokal.
const lokal = req => LOOPBACK.has(req.socket.remoteAddress) && !req.headers['x-forwarded-for'] && !req.headers.forwarded;

app.all('/api/:nama', express.json({ limit: '6mb' }), async (req, res) => {
  const out = await jalankan(req.params.nama, { method: req.method, headers: req.headers, bacaBody: () => req.body, lokal: lokal(req) });
  res.status(out.status).set('Cache-Control', 'no-store').json(out.json);
});
app.use('/api', (req, res) => res.status(404).json({ kode: 'tidak_ada', pesan: 'Endpoint tidak ada' }));

// produksi: sajikan dist/ (hasil `npm run build`)
const dist = path.join(here, '..', 'dist');
app.use(express.static(dist, { index: 'index.html', maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache'); } }));
app.get(/^\/(?!api\/).*/, (req, res, next) => res.sendFile(path.join(dist, 'index.html'), err => err && next()));

// galat (mis. body terlalu besar / JSON rusak): selalu JSON, tanpa jejak tumpukan
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ kode: status === 413 ? 'terlalu_besar' : status === 400 ? 'masukan' : 'server', pesan: status === 413 ? 'Gambar terlalu besar' : status === 400 ? 'Body JSON tidak sah' : 'Galat server' });
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Server koreksi berjalan di http://localhost:${port}`);
  if (!hasKey()) console.log('ANTHROPIC_API_KEY tidak ada: aplikasi berjalan dalam mode manual.');
  else if (process.env.KODE_AKSES) console.log(`Claude API aktif (model ${MODEL}), dilindungi KODE_AKSES.`);
  else console.log(`Claude API aktif (model ${MODEL}) hanya untuk browser di komputer ini. Atur KODE_AKSES agar HP di Wi-Fi bisa memakainya.`);
});
