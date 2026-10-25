// Impor daftar kelas (CSV atau tempel dari Google Sheets) dan ekspor CSV/TSV. Murni.

/** Pecah teks CSV/TSV menjadi baris & kolom (mendukung tanda kutip). */
export function parseDelimited(text) {
  const src = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const firstLine = src.split('\n').find(l => l.trim()) || '';
  const delim = firstLine.includes('\t') ? '\t' : (firstLine.split(';').length > firstLine.split(',').length ? ';' : ',');
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"' && cell === '') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x));
}

const KOLOM = {
  nama: ['nama', 'name', 'nama lengkap', 'nama siswa', 'nama latin'],
  katakana: ['katakana', 'kana', 'nama katakana', 'カタカナ'],
  nis: ['nis', 'nisn', 'no', 'nomor', 'no induk', 'nomor induk', 'id'],
};

/**
 * Ubah teks daftar kelas menjadi siswa. Baris judul opsional: bila tidak ada,
 * kolom 1 = nama, kolom 2 = katakana (bila berisi kana) atau NIS, kolom 3 = sisanya.
 * @returns {{siswa: Array<{nama, katakana, nis}>, peringatan: string[]}}
 */
export function parseClassList(text) {
  const rows = parseDelimited(text);
  const peringatan = [];
  if (!rows.length) return { siswa: [], peringatan: ['Teks kosong'] };
  const head = rows[0].map(h => h.toLowerCase());
  const idx = {};
  for (const [k, names] of Object.entries(KOLOM)) {
    // nama kolom diurutkan menurut prioritas: "nis" lebih diutamakan daripada "no"
    for (const n of names) { const i = head.indexOf(n); if (i >= 0) { idx[k] = i; break; } }
  }
  let body = rows;
  if (idx.nama != null) body = rows.slice(1);
  else if (head.length >= 1 && /^(no\.?|#)$/.test(head[0]) && rows.length > 1) {
    peringatan.push('Kolom "Nama" tidak ditemukan pada baris judul; kolom kedua dipakai sebagai nama');
    idx.nama = 1; body = rows.slice(1);
  }
  const kana = /[぀-ヿ]/;
  const siswa = [];
  const seen = new Set();
  body.forEach((r, i) => {
    let nama, katakana = '', nis = '';
    if (idx.nama != null) {
      nama = r[idx.nama] || '';
      katakana = idx.katakana != null ? r[idx.katakana] || '' : '';
      nis = idx.nis != null ? r[idx.nis] || '' : '';
      if (idx.katakana == null) { const k = r.find((x, j) => j !== idx.nama && kana.test(x)); if (k) katakana = k; }
    } else {
      nama = r[0] || '';
      for (const x of r.slice(1)) { if (kana.test(x)) katakana = katakana || x; else if (x) nis = nis || x; }
    }
    // nama latin kosong tetapi ada katakana saja
    if (!nama && katakana) nama = katakana;
    if (!nama) { peringatan.push(`Baris ${i + 1 + (body === rows ? 0 : 1)} dilewati: nama kosong`); return; }
    if (kana.test(nama) && !katakana) { katakana = nama; }
    const key = nama.toLowerCase();
    if (seen.has(key)) peringatan.push(`Nama ganda: ${nama}`);
    seen.add(key);
    siswa.push({ nama, katakana, nis });
  });
  return { siswa, peringatan };
}

function esc(v, delim) {
  const s = v == null ? '' : String(v);
  return s.includes(delim) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV(rows) { return '﻿' + rows.map(r => r.map(v => esc(v, ',')).join(',')).join('\r\n'); }
export function toTSV(rows) { return rows.map(r => r.map(v => (v == null ? '' : String(v).replace(/[\t\n]/g, ' '))).join('\t')).join('\n'); }
