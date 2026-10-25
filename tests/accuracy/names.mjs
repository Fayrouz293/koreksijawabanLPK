// Akurasi pencocokan nama pada bacaan SINTETIS (salah huruf, urutan, singkatan, sebagian).
// Daftar nama fiktif bergaya nama Aceh/Indonesia; bukan data siswa sungguhan.
// Mengukur pencocokan saja, BUKAN pembacaan tulisan tangan oleh Claude (butuh API key + foto asli).
import fs from 'node:fs';
import { matchName } from '../../src/lib/namematch.js';
import { rng } from './synth.mjs';

const NAMA = ['Muhammad Rizki', 'Muhammad Fadil', 'Muhammad Iqbal Maulana', 'Nurul Aini', 'Nurul Hidayah', 'Cut Nyak Dhien Safitri',
  'Teuku Ridwan Syah', 'Rizki Ananda', 'Putri Ramadhani', 'Siti Aisyah', 'Siti Rahmah', 'Fajar Maulana', 'Agus Salim', 'Rahmat Hidayat',
  'Dedi Saputra', 'Zulfikar', 'Khairul Anwar', 'Fitriani', 'Mutia Sari', 'Ilham Akbar', 'Teuku Ilham Fajri', 'Cut Intan Nabila',
  'Riski Amalia', 'Yusuf Habibie', 'Dewi Sartika Putri', 'Andi Firmansyah', 'Fadhil Akbar', 'Nanda Syahputra', 'Rahmi Aulia', 'Safrizal'];
const KANA = { 'Nurul Aini': 'ヌルル アイニ', 'Muhammad Rizki': 'ムハマド リズキ', 'Siti Aisyah': 'シティ アイシャ', 'Fajar Maulana': 'ファジャル マウラナ', 'Agus Salim': 'アグス サリム' };
const kelas = NAMA.map((n, i) => ({ id: String(i), nama: n, katakana: KANA[n] || '' }));
const r = rng(42);
const letters = 'abcdefghijklmnopqrstuvwxyz';
const typo = (s, n) => { let a = [...s]; for (let k = 0; k < n; k++) { let i; do { i = Math.floor(r() * a.length); } while (a[i] === ' '); a[i] = letters[Math.floor(r() * 26)]; } return a.join(''); };
const VAR = {
  persis: s => s,
  salah1huruf: s => typo(s, 1),
  salah2huruf: s => typo(s, 2),
  hurufHilang: s => { const i = 1 + Math.floor(r() * (s.length - 2)); return s.slice(0, i) + s.slice(i + 1); },
  urutanTerbalik: s => s.split(' ').reverse().join(' '),
  inisialDepan: s => s.split(' ').length > 1 ? s.split(' ')[0][0] + '. ' + s.split(' ').slice(1).join(' ') : s,
  hurufBesarSemua: s => s.toUpperCase(),
  namaDepanSaja: s => s.split(' ')[0],
};
const out = {};
for (const [v, fn] of Object.entries(VAR)) {
  const st = { n: 0, top1: 0, top3: 0, kuat: 0, kuatSalah: 0, lemah: 0, tidak_cocok: 0 };
  for (let rep = 0; rep < 3; rep++) for (const s of kelas) {
    const m = matchName({ latin: fn(s.nama) }, kelas);
    st.n++; st[m.status]++;
    if (m.kandidat[0]?.id === s.id) st.top1++;
    if (m.kandidat.some(k => k.id === s.id)) st.top3++;
    if (m.status === 'kuat' && m.kandidat[0].id !== s.id) st.kuatSalah++;
  }
  out[v] = st;
}
{ // katakana
  const st = { n: 0, top1: 0, top3: 0, kuat: 0, kuatSalah: 0, lemah: 0, tidak_cocok: 0 };
  for (const s of kelas.filter(k => k.katakana)) for (const kana of [s.katakana, s.katakana.replace(' ', ''), s.katakana.replace(/ャ|ュ|ョ/, 'ヤ')]) {
    const m = matchName({ kana }, kelas); st.n++; st[m.status]++;
    if (m.kandidat[0]?.id === s.id) st.top1++; if (m.kandidat.some(k => k.id === s.id)) st.top3++;
    if (m.status === 'kuat' && m.kandidat[0].id !== s.id) st.kuatSalah++;
  }
  out.katakana = st;
}
const pct = (a, b) => (100 * a / b).toFixed(2) + '%';
const tabel = Object.fromEntries(Object.entries(out).map(([k, s]) => [k, { n: s.n, top1: pct(s.top1, s.n), top3: pct(s.top3, s.n), kuat: pct(s.kuat, s.n), kuat_tapi_salah: s.kuatSalah, lemah: pct(s.lemah, s.n), tidak_cocok: pct(s.tidak_cocok, s.n) }]));
fs.writeFileSync('tests/accuracy/laporan-nama-sintetis.json', JSON.stringify(tabel, null, 1));
console.table(tabel);
