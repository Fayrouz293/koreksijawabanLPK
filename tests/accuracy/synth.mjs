// Generator lembar isian SINTETIS untuk mengukur akurasi OMR.
// Tanda pensil digambar di atas foto lembar kosong asli, lalu foto diberi variasi
// (miring, terbalik, bayangan, buram, gelap). Jawaban sebenarnya diketahui pasti.
// Keterbatasan: tanda pensil buatan tidak sama persis dengan grafit asli; posisi
// tanda diambil dari detektor pada foto kosong (plus pergeseran acak).

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (r, a, b) => a + (b - a) * r();

/** Gambar satu tanda pensil (perkalian reflektansi) pada ImageData RGBA. */
export function drawMark(img, cx, cy, rx, ry, dark, r, opts = {}) {
  const { width: W, height: H, data } = img;
  const cover = opts.cover ?? 1; // 1 = penuh, <1 = coretan sebagian (bagian bawah kosong)
  const ex = rx * 1.15, ey = ry * 1.15;
  const x0 = Math.max(0, Math.floor(cx - ex - 2)), x1 = Math.min(W - 1, Math.ceil(cx + ex + 2));
  const y0 = Math.max(0, Math.floor(cy - ey - 2)), y1 = Math.min(H - 1, Math.ceil(cy + ey + 2));
  const stroke = opts.strokes ? between(r, 0.5, 1) : 1;
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ey;
    if (cover < 1 && (dy + 1) / 2 > cover) continue;
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / ex;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 1.05) continue;
      const edge = d > 0.85 ? Math.max(0, (1.05 - d) / 0.2) : 1; // tepi lembut
      // tekstur grafit: bintik acak + guratan horizontal
      const grain = 0.75 + 0.25 * r();
      const streak = opts.strokes ? (0.7 + 0.3 * Math.sin(y * stroke * 1.7)) : 1;
      const k = 1 - dark * edge * grain * streak;
      const i = (y * W + x) * 4;
      data[i] *= k; data[i + 1] *= k; data[i + 2] *= k * 0.98;
    }
  }
}

/** Isi satu lembar kosong dengan jawaban acak. posisi: hasil readSheet().posisiAsli */
export const GAYA = {
  normal: { jitterX: 0.18, jitterY: 0.12, size: [0.85, 1.15], dark: [0.5, 0.85] },
  // tanda meleset dari bulatan, ukuran tidak rata, lebih pucat (pensil keras / ditekan ringan)
  sulit: { jitterX: 0.35, jitterY: 0.25, size: [0.6, 1.2], dark: [0.35, 0.7] },
};

export function fillSheet(img, posisi, seed, mix = {}, gaya = GAYA.normal) {
  const r = rng(seed);
  const p = { normal: 0.66, tipis: 0.08, hapus: 0.1, kosong: 0.06, ganda: 0.05, sebagian: 0.05, ...mix };
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const gt = {};
  const jenis = {};
  for (const b of posisi) {
    const jit = () => [between(r, -gaya.jitterX, gaya.jitterX) * b.rx, between(r, -gaya.jitterY, gaya.jitterY) * b.ry];
    const sz = () => between(r, gaya.size[0], gaya.size[1]);
    const gelap = () => between(r, gaya.dark[0], gaya.dark[1]);
    const pick = () => Math.floor(r() * b.titik.length);
    const mark = (k, dark, o = {}) => {
      const [jx, jy] = jit(); const s = sz();
      drawMark(out, b.titik[k][0] + jx, b.titik[k][1] + jy, b.rx * s, b.ry * s, dark, r, o);
    };
    let u = r(), kind;
    for (kind of Object.keys(p)) { if ((u -= p[kind]) < 0) break; }
    jenis[b.no] = kind;
    const a = pick();
    if (kind === 'normal') { mark(a, gelap(), { strokes: r() < 0.5 }); gt[b.no] = a + 1; }
    else if (kind === 'tipis') { mark(a, between(r, 0.28, 0.42), { strokes: true }); gt[b.no] = a + 1; }
    else if (kind === 'hapus') {
      let e = pick(); if (e === a) e = (a + 1 + Math.floor(r() * 3)) % b.titik.length;
      mark(e, between(r, 0.06, 0.16), { strokes: true }); // sisa hapusan
      mark(a, gelap()); gt[b.no] = a + 1;
    } else if (kind === 'kosong') { gt[b.no] = null; }
    else if (kind === 'ganda') {
      let e = pick(); if (e === a) e = (a + 1) % b.titik.length;
      mark(a, gelap()); mark(e, gelap()); gt[b.no] = 'ganda';
    } else if (kind === 'sebagian') { mark(a, between(r, 0.55, 0.85), { cover: between(r, 0.55, 0.75), strokes: true }); gt[b.no] = a + 1; }
  }
  return { img: out, gt, jenis };
}

// ------------------------------------------------------------ variasi foto (OpenCV)

function toMat(cv, img) { return cv.matFromImageData(img); }
function toImg(cv, m) { const o = { width: m.cols, height: m.rows, data: new Uint8ClampedArray(m.data) }; m.delete(); return o; }

export function rotate(cv, img, rot) {
  const m = toMat(cv, img), o = new cv.Mat();
  cv.rotate(m, o, { 90: cv.ROTATE_90_CLOCKWISE, 180: cv.ROTATE_180, 270: cv.ROTATE_90_COUNTERCLOCKWISE }[rot]);
  m.delete();
  return toImg(cv, o);
}

/** Miring: rotasi kecil + efek keystone (perspektif), latar meja abu-abu. */
export function tilt(cv, img, deg, keystone) {
  const m = toMat(cv, img), o = new cv.Mat();
  const W = img.width, H = img.height;
  const c = [W / 2, H / 2], a = deg * Math.PI / 180;
  const rotp = ([x, y]) => [c[0] + (x - c[0]) * Math.cos(a) - (y - c[1]) * Math.sin(a), c[1] + (x - c[0]) * Math.sin(a) + (y - c[1]) * Math.cos(a)];
  const k = keystone * W;
  const dst = [[k, 0], [W - k, 0], [W, H], [0, H]].map(rotp);
  // skala sedikit ke dalam agar isi tetap di dalam bingkai
  const s = 0.9, ds = dst.map(([x, y]) => [c[0] + (x - c[0]) * s, c[1] + (y - c[1]) * s]);
  const A = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, W, 0, W, H, 0, H]);
  const B = cv.matFromArray(4, 1, cv.CV_32FC2, ds.flat());
  const M = cv.getPerspectiveTransform(A, B);
  cv.warpPerspective(m, o, M, new cv.Size(W, H), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(90, 90, 95, 255));
  A.delete(); B.delete(); M.delete(); m.delete();
  return toImg(cv, o);
}

/** Bayangan tambahan: pita gelap diagonal dengan tepi lembut. */
export function shadow(img, strength, seed) {
  const r = rng(seed);
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  const { width: W, height: H, data } = out;
  const ang = between(r, -0.6, 0.6), off = between(r, 0.35, 0.65), soft = 0.08 * W;
  const nx = Math.sin(ang), ny = Math.cos(ang);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (x - W / 2) * nx + (y - H * off) * ny; // > 0 = di dalam bayangan
    const f = d > soft ? 1 : d < -soft ? 0 : (d + soft) / (2 * soft);
    const k = 1 - strength * f;
    const i = (y * W + x) * 4;
    data[i] *= k; data[i + 1] *= k; data[i + 2] *= k;
  }
  return out;
}

export function blur(cv, img, sigma) {
  const m = toMat(cv, img), o = new cv.Mat();
  cv.GaussianBlur(m, o, new cv.Size(0, 0), sigma);
  m.delete();
  return toImg(cv, o);
}

export function darken(img, f) {
  const out = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  for (let i = 0; i < out.data.length; i += 4) { out.data[i] *= f; out.data[i + 1] *= f; out.data[i + 2] *= f; }
  return out;
}

export function cropBottom(img, frac) {
  const H = Math.round(img.height * (1 - frac));
  return { width: img.width, height: H, data: new Uint8ClampedArray(img.data.buffer.slice(0, img.width * H * 4)) };
}
