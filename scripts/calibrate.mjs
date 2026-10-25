// Kalibrasi template dari foto lembar kosong.
// Pakai: node scripts/calibrate.mjs templates/<id>.struktur.json <foto-kosong.jpg> [rotasi]
// Hasil: templates/<id>.json (dipakai aplikasi).
import fs from 'node:fs';
import path from 'node:path';
import { loadCv, readJpeg } from './node-cv.mjs';
import { calibrate } from '../src/lib/omr.js';
import { validateTemplate, describe } from '../src/lib/template.js';

const [strukturPath, fotoPath, rot] = process.argv.slice(2);
if (!strukturPath || !fotoPath) { console.error('Pakai: node scripts/calibrate.mjs <struktur.json> <foto.jpg> [rotasi]'); process.exit(1); }
const cv = await loadCv();
const base = JSON.parse(fs.readFileSync(strukturPath, 'utf8'));
const out = calibrate(cv, readJpeg(fotoPath), base, { rotation: Number(rot || 0), sumber: path.basename(fotoPath) });
const errs = validateTemplate(out);
if (errs.length) { console.error('Template tidak valid:', errs); process.exit(1); }
const dest = path.join(path.dirname(strukturPath), `${base.id}.json`);
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
const d = describe(out);
console.log(`Tersimpan ${dest}: ${d.jumlahSoal} soal, mondai ${d.mondai.map(m => `${m.no}(${m.dari}-${m.sampai})`).join(' ')}`);
for (const tb of out.kalibrasi.tabel) console.log(` ${tb.id}: kolom=${tb.kolomOpsi.join(',')} r=${JSON.stringify(tb.radius)} baris=${tb.batasBaris.length - 1}`);
console.log(' kotakNama', out.kalibrasi.kotakNama, '\n kotakNoPeserta', out.kalibrasi.kotakNoPeserta, '\n kanvas', out.kalibrasi.kanvas);
