// Penilaian: fungsi murni tanpa efek samping (dites di tests/grading.test.js).

/**
 * Nilai satu lembar.
 * @param {object} p
 * @param {Object<string, number|null>} p.jawaban  jawaban final per nomor (null = kosong / tidak sah)
 * @param {Object<string, number|null>} p.kunci    kunci per nomor (null/undefined = soal tanpa kunci, tidak dinilai)
 * @param {Object<string, number>} [p.bobot]       bobot per nomor, default 1
 * @param {Array<{no:number, soal:number[]}>} [p.mondai]
 * @param {number} [p.batasLulus]                  persen 0-100, default 60
 */
export function gradeSheet({ jawaban = {}, kunci = {}, bobot = {}, mondai = [], batasLulus = 60 }) {
  const perSoal = {};
  let skor = 0, skorMaks = 0, benarCount = 0, dinilai = 0;
  const salah = [], tanpaKunci = [];
  const nomor = Object.keys(kunci).map(Number).sort((a, b) => a - b);
  for (const no of nomor) {
    const k = kunci[no];
    const j = jawaban[no] ?? null;
    if (k == null) { tanpaKunci.push(no); perSoal[no] = { jawab: j, kunci: null, benar: null, bobot: 0 }; continue; }
    const w = bobotOf(bobot, no);
    const benar = j != null && j === k;
    dinilai++;
    skorMaks += w;
    if (benar) { skor += w; benarCount++; } else salah.push(no);
    perSoal[no] = { jawab: j, kunci: k, benar, bobot: w };
  }
  const perMondai = mondai.map(m => {
    let s = 0, mx = 0, b = 0, n = 0;
    for (const no of m.soal) {
      const ps = perSoal[no];
      if (!ps || ps.kunci == null) continue;
      mx += ps.bobot; n++;
      if (ps.benar) { s += ps.bobot; b++; }
    }
    return { no: m.no, skor: s, maks: mx, benar: b, jumlah: n, persen: mx ? round2(100 * s / mx) : null };
  });
  const persen = skorMaks ? round2(100 * skor / skorMaks) : 0;
  return { skor, skorMaks, persen, lulus: skorMaks > 0 && persen >= batasLulus, benar: benarCount, dinilai, salah, tanpaKunci, perSoal, perMondai };
}

function bobotOf(bobot, no) {
  const w = bobot?.[no];
  return typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : 1;
}

export function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Rekap satu sesi.
 * @param {Array<{nama:string, nilai:ReturnType<typeof gradeSheet>}>} hasil
 */
export function rekapSesi(hasil) {
  const n = hasil.length;
  if (!n) return { jumlah: 0, rataRata: null, tertinggi: null, terendah: null, lulus: 0, soalSeringSalah: [] };
  const ps = hasil.map(h => h.nilai.persen);
  const salahCount = new Map();
  for (const h of hasil) for (const no of h.nilai.salah) salahCount.set(no, (salahCount.get(no) || 0) + 1);
  const soalSeringSalah = [...salahCount.entries()]
    .map(([no, jumlah]) => ({ no, jumlah, persen: round2(100 * jumlah / n) }))
    .sort((a, b) => b.jumlah - a.jumlah || a.no - b.no);
  const maxP = Math.max(...ps), minP = Math.min(...ps);
  return {
    jumlah: n,
    rataRata: round2(ps.reduce((a, b) => a + b, 0) / n),
    tertinggi: { persen: maxP, nama: hasil.filter(h => h.nilai.persen === maxP).map(h => h.nama) },
    terendah: { persen: minP, nama: hasil.filter(h => h.nilai.persen === minP).map(h => h.nama) },
    lulus: hasil.filter(h => h.nilai.lulus).length,
    soalSeringSalah,
  };
}

/** Jawaban final dari hasil OMR + koreksi guru. Ganda/tidak yakin tanpa koreksi => belum final. */
export function finalAnswers(bacaan, koreksi = {}) {
  const jawaban = {}, belum = [];
  for (const [no, b] of Object.entries(bacaan)) {
    if (Object.prototype.hasOwnProperty.call(koreksi, no)) { jawaban[no] = koreksi[no]; continue; }
    if (b.status === 'jelas') jawaban[no] = b.pilihan;
    else if (b.status === 'kosong') jawaban[no] = null;
    else { jawaban[no] = null; belum.push(Number(no)); }
  }
  return { jawaban, belum: belum.sort((a, b) => a - b) };
}
