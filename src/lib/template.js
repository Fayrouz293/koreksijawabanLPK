// Modul template lembar jawaban. Murni (tanpa OpenCV / DOM) supaya bisa dites di Node.
//
// Template terdiri dari dua bagian:
//  1. "struktur": diketik manusia, menjelaskan isi tiap tabel soal secara berurutan
//     dari atas ke bawah, mis. ["M1", "1-9", "M2", "10-15"]. "M<n>" = baris judul
//     mondai n, "a-b" = baris soal a sampai b. Jumlah soal & pembagian mondai
//     diturunkan dari sini, tidak pernah ditulis di kode.
//  2. "kalibrasi": hasil pengukuran otomatis dari foto lembar kosong (posisi baris,
//     kolom bulatan, baseline tinta, kotak nama). Dibuat oleh omr.calibrate().

/** Uraikan satu tabel struktur menjadi daftar baris. */
export function parseRows(tokens) {
  const rows = [];
  for (const raw of tokens) {
    const t = String(raw).trim().toUpperCase();
    let m;
    if ((m = t.match(/^M(\d+)$/))) {
      rows.push({ jenis: 'judul', mondai: Number(m[1]) });
    } else if ((m = t.match(/^(\d+)\s*-\s*(\d+)$/))) {
      const a = Number(m[1]), b = Number(m[2]);
      if (b < a) throw new Error(`Rentang terbalik: ${raw}`);
      for (let no = a; no <= b; no++) rows.push({ jenis: 'soal', no });
    } else if ((m = t.match(/^(\d+)$/))) {
      rows.push({ jenis: 'soal', no: Number(m[1]) });
    } else {
      throw new Error(`Token struktur tidak dikenal: "${raw}"`);
    }
  }
  return rows;
}

/** Ringkasan turunan dari struktur: daftar soal berurutan & mondai. */
export function describe(template) {
  const soal = [];
  const mondaiMap = new Map();
  let mondaiAktif = null;
  for (const tabel of template.struktur) {
    for (const row of parseRows(tabel.baris)) {
      if (row.jenis === 'judul') {
        mondaiAktif = row.mondai;
        if (!mondaiMap.has(mondaiAktif)) mondaiMap.set(mondaiAktif, []);
      } else {
        if (mondaiAktif == null) throw new Error(`Soal ${row.no} tidak berada di bawah judul mondai`);
        soal.push({ no: row.no, mondai: mondaiAktif, tabel: tabel.id });
        mondaiMap.get(mondaiAktif).push(row.no);
      }
    }
  }
  const nos = soal.map(s => s.no);
  const dup = nos.filter((n, i) => nos.indexOf(n) !== i);
  if (dup.length) throw new Error(`Nomor soal ganda di struktur: ${[...new Set(dup)].join(', ')}`);
  const mondai = [...mondaiMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([no, list]) => ({ no, soal: list, dari: Math.min(...list), sampai: Math.max(...list) }));
  return { jumlahSoal: soal.length, soal: soal.sort((a, b) => a.no - b.no), mondai };
}

/** Validasi struktur template; kembalikan daftar pesan galat (kosong = valid). */
export function validateTemplate(t) {
  const errs = [];
  if (!t || typeof t !== 'object') return ['Template bukan objek'];
  if (!t.id) errs.push('id kosong');
  if (!t.nama) errs.push('nama kosong');
  if (!Number.isInteger(t.opsi) || t.opsi < 2) errs.push('opsi harus bilangan bulat >= 2');
  if (!Array.isArray(t.struktur) || !t.struktur.length) errs.push('struktur kosong');
  else {
    try { describe(t); } catch (e) { errs.push(e.message); }
  }
  if (t.kalibrasi) {
    const ids = new Set((t.struktur || []).map(s => s.id));
    for (const tb of t.kalibrasi.tabel || []) {
      if (!ids.has(tb.id)) errs.push(`Kalibrasi untuk tabel tak dikenal: ${tb.id}`);
      if (tb.kolomOpsi?.length !== t.opsi) errs.push(`Tabel ${tb.id}: jumlah kolom bulatan ${tb.kolomOpsi?.length} != opsi ${t.opsi}`);
    }
  }
  return errs;
}

export function opsiLabels(template) {
  return template.labelOpsi || Array.from({ length: template.opsi }, (_, i) => String(i + 1));
}
