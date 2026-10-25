// Pencocokan nama hasil bacaan dengan daftar kelas. Murni, dites di tests/namematch.test.js.
// Toleran terhadap salah huruf (Jaro-Winkler), urutan kata, singkatan inisial
// ("M." = "Muhammad"), dan nama katakana (dibandingkan dengan field katakana siswa).

export const AMBANG_NAMA = { kuat: 0.9, selisihKuat: 0.06, lemah: 0.62 };

export function normLatin(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s.]/g, ' ')
    .replace(/\./g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Hiragana -> katakana, buang spasi & titik tengah. */
export function normKana(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・･·.]/g, '');
}

export function hasKana(s) { return /[぀-ヿ]/.test(String(s || '')); }

export function jaroWinkler(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const md = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - md); j < Math.min(b.length, i + md + 1); j++) {
      if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; m++; break; }
    }
  }
  if (!m) return 0;
  let k = 0, tr = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) tr++;
    k++;
  }
  const jaro = (m / a.length + m / b.length + (m - tr / 2) / m) / 3;
  let p = 0;
  while (p < Math.min(4, a.length, b.length) && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

function tokenSim(a, b) {
  const ai = a.endsWith('.') ? a.slice(0, -1) : a;
  const bi = b.endsWith('.') ? b.slice(0, -1) : b;
  if (ai.length === 1 || bi.length === 1) return ai[0] === bi[0] ? 0.85 : 0;
  return jaroWinkler(ai, bi);
}

/** Kemiripan token dua arah: tiap token dicocokkan ke token terbaik di sisi lain. */
function tokenSetScore(ta, tb) {
  if (!ta.length || !tb.length) return 0;
  const dir = (x, y) => {
    let s = 0, w = 0;
    for (const t of x) {
      const best = Math.max(...y.map(u => tokenSim(t, u)));
      const wt = Math.max(1, t.replace('.', '').length);
      s += best * wt; w += wt;
    }
    return s / w;
  };
  // nama yang terbaca sering hanya sebagian (mis. nama depan saja): beri bobot lebih
  // pada arah bacaan->siswa, tetapi tetap hukum token siswa yang tak terwakili
  return 0.65 * dir(ta, tb) + 0.35 * dir(tb, ta);
}

export function nameScore(dibaca, siswa) {
  const out = [];
  if (dibaca.latin) {
    const a = normLatin(dibaca.latin);
    const b = normLatin(siswa.nama);
    if (a && b) {
      const ta = a.split(' '), tb = b.split(' ');
      const sorted = jaroWinkler([...ta].sort().join(' '), [...tb].sort().join(' '));
      out.push(Math.max(sorted, tokenSetScore(ta, tb), jaroWinkler(a, b)));
    }
  }
  if (dibaca.kana && siswa.katakana) {
    out.push(jaroWinkler(normKana(dibaca.kana), normKana(siswa.katakana)));
  }
  return out.length ? Math.max(...out) : 0;
}

/**
 * Cocokkan nama terbaca dengan daftar siswa.
 * @param {{latin?:string, kana?:string}} dibaca
 * @param {Array<{id:string, nama:string, katakana?:string}>} siswa
 * @returns {{status:'kuat'|'lemah'|'tidak_cocok', kandidat:Array<{id, nama, skor}>}}
 */
export function matchName(dibaca, siswa, ambang = AMBANG_NAMA) {
  const kandidat = siswa
    .map(s => ({ id: s.id, nama: s.nama, skor: Math.round(nameScore(dibaca, s) * 1000) / 1000 }))
    .sort((a, b) => b.skor - a.skor);
  const [t1, t2] = kandidat;
  if (!t1 || t1.skor < ambang.lemah) return { status: 'tidak_cocok', kandidat: kandidat.slice(0, 3) };
  if (t1.skor >= ambang.kuat && (!t2 || t1.skor - t2.skor >= ambang.selisihKuat)) return { status: 'kuat', kandidat: kandidat.slice(0, 3) };
  return { status: 'lemah', kandidat: kandidat.slice(0, 3) };
}
