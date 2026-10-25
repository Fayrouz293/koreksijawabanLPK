// Pembacaan lembar jawaban (OMR) dengan OpenCV.js. Jalan lokal, tanpa jaringan.
// Dipakai di browser dan di Node (tes akurasi), jadi modul ini tidak menyentuh DOM:
// masukan dan keluaran gambar berupa {width, height, data: RGBA}.
//
// Alur readSheet():
//   1. perkecil ke ukuran kerja, normalisasi cahaya (bagi dengan latar yang dikaburkan)
//   2. cari segi empat besar (calon tabel soal) pada 4 rotasi (0/90/180/270)
//   3. cocokkan calon dengan template: pola garis baris di dalam tabel + tata letak
//   4. gerbang kualitas (tabel lengkap, ketajaman, kecerahan)
//   5. luruskan tiap tabel, rapatkan posisi baris ke garis yang terdeteksi,
//      ukur kegelapan tiap bulatan relatif terhadap baseline lembar kosong
//   6. tentukan status per soal: jelas / kosong / ganda / tidak_yakin + kepercayaan

import { parseRows, describe } from './template.js';

export const DEFAULT_PARAMS = {
  workMaxSide: 2000,      // sisi terpanjang gambar kerja (px)
  detectMaxSide: 1400,    // sisi terpanjang untuk deteksi tabel
  tableNormWidth: 480,    // lebar tabel setelah diluruskan (px)
  minQuadAreaFrac: 0.004, // luas minimum calon tabel relatif terhadap gambar
  minStructureScore: 0.8, // skor kecocokan pola baris minimum agar tabel diterima
  minSharpness: 40,       // varians Laplacian minimum pada area tabel
  minSharpnessGlobal: 25, // varians Laplacian minimum seluruh foto (dipakai bila tabel tak ditemukan)
  minBrightness: 60,      // rata-rata kecerahan minimum area tabel (0-255, sebelum normalisasi)
  minTableFrac: 0.12,     // tinggi tabel terbesar minimum relatif terhadap sisi pendek foto
};

export const DEFAULT_AMBANG = {
  tanda: 0.16,      // selisih kegelapan dari baseline agar bulatan dianggap terisi
  samar: 0.06,      // di bawah ini dianggap bersih
  rasioGanda: 0.55, // bulatan ke-2 >= rasio * bulatan ke-1 (dan >= tanda) => ganda
  rasioJelas: 0.3,  // bulatan ke-2 < rasio * bulatan ke-1 => tetap jelas walau ada sisa
};

// ---------------------------------------------------------------- util umum

function track() {
  const mats = [];
  const t = m => (mats.push(m), m);
  t.free = () => { for (const m of mats) { try { m.delete(); } catch { /* sudah dibebaskan */ } } mats.length = 0; };
  return t;
}

export function orderCorners(pts) {
  // TL, TR, BR, BL berdasarkan jumlah & selisih koordinat
  const s = pts.map(p => p[0] + p[1]);
  const d = pts.map(p => p[0] - p[1]);
  const tl = pts[s.indexOf(Math.min(...s))];
  const br = pts[s.indexOf(Math.max(...s))];
  const tr = pts[d.indexOf(Math.max(...d))];
  const bl = pts[d.indexOf(Math.min(...d))];
  return [tl, tr, br, bl];
}

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

function quadSize(q) {
  return { w: (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h: (dist(q[0], q[3]) + dist(q[1], q[2])) / 2 };
}

function matFromPts(cv, pts) {
  return cv.matFromArray(pts.length, 1, cv.CV_32FC2, pts.flat());
}

function perspective(cv, from, to) {
  const a = matFromPts(cv, from), b = matFromPts(cv, to);
  const M = cv.getPerspectiveTransform(a, b);
  a.delete(); b.delete();
  return M;
}

function applyH(M, p) {
  const h = M.data64F;
  const w = h[6] * p[0] + h[7] * p[1] + h[8];
  return [(h[0] * p[0] + h[1] * p[1] + h[2]) / w, (h[3] * p[0] + h[4] * p[1] + h[5]) / w];
}

function invert(cv, M) {
  const inv = new cv.Mat();
  cv.invert(M, inv, cv.DECOMP_LU);
  return inv;
}

function rectPts(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; }

export function imageDataToMat(cv, img) {
  return cv.matFromImageData({ data: img.data, width: img.width, height: img.height });
}

export function matToImageData(cv, mat) {
  const t = track();
  let rgba = mat;
  if (mat.channels() === 1) { rgba = t(new cv.Mat()); cv.cvtColor(mat, rgba, cv.COLOR_GRAY2RGBA); }
  else if (mat.channels() === 3) { rgba = t(new cv.Mat()); cv.cvtColor(mat, rgba, cv.COLOR_RGB2RGBA); }
  const out = { width: rgba.cols, height: rgba.rows, data: new Uint8ClampedArray(rgba.data) };
  t.free();
  return out;
}

function resizeMax(cv, src, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(src.cols, src.rows));
  const dst = new cv.Mat();
  if (scale < 1) cv.resize(src, dst, new cv.Size(0, 0), scale, scale, cv.INTER_AREA);
  else src.copyTo(dst);
  return { mat: dst, scale };
}

/** Normalisasi cahaya: bagi gambar abu-abu dengan perkiraan latar kertas.
 *  Latar dihitung pada resolusi rendah (cepat), lalu diperbesar kembali. */
function normalizeLight(cv, gray) {
  const t = track();
  const f = Math.min(1, 400 / Math.max(gray.cols, gray.rows));
  const small = t(new cv.Mat());
  cv.resize(gray, small, new cv.Size(0, 0), f, f, cv.INTER_AREA);
  const k = Math.max(5, Math.round(Math.max(small.cols, small.rows) / 50)) | 1;
  const ker = t(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(k, k)));
  cv.morphologyEx(small, small, cv.MORPH_CLOSE, ker);
  cv.GaussianBlur(small, small, new cv.Size(0, 0), k / 2);
  const bg = t(new cv.Mat());
  cv.resize(small, bg, new cv.Size(gray.cols, gray.rows), 0, 0, cv.INTER_LINEAR);
  const norm = new cv.Mat();
  cv.divide(gray, bg, norm, 255);
  t.free();
  return norm;
}

function binarize(cv, norm, block, C = 15) {
  const bin = new cv.Mat();
  cv.adaptiveThreshold(norm, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, block | 1, C);
  return bin;
}

/** Cari segi empat besar (calon tabel / kotak). */
function findQuads(cv, norm, minAreaFrac) {
  const t = track();
  const bin = t(binarize(cv, norm, Math.max(15, Math.round(norm.cols / 60))));
  const contours = t(new cv.MatVector());
  const hier = t(new cv.Mat());
  cv.findContours(bin, contours, hier, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
  const minArea = minAreaFrac * norm.cols * norm.rows;
  const quads = [];
  for (let i = 0; i < contours.size(); i++) {
    const c = contours.get(i);
    const area = cv.contourArea(c);
    if (area >= minArea) {
      const ap = new cv.Mat();
      cv.approxPolyDP(c, ap, 0.02 * cv.arcLength(c, true), true);
      if (ap.rows === 4 && cv.isContourConvex(ap)) {
        const pts = [];
        for (let j = 0; j < 4; j++) pts.push([ap.data32S[j * 2], ap.data32S[j * 2 + 1]]);
        quads.push({ pts: orderCorners(pts), area });
      }
      ap.delete();
    }
    c.delete();
  }
  t.free();
  // buang duplikat (kontur dalam & luar garis yang sama)
  quads.sort((a, b) => b.area - a.area);
  const out = [];
  for (const q of quads) {
    if (!out.some(o => q.pts.every((p, i) => dist(p, o.pts[i]) < 0.02 * norm.cols))) out.push(q);
  }
  return out;
}

function warp(cv, src, quad, W, H, interp, whiteBorder) {
  const M = perspective(cv, quad, rectPts(0, 0, W, H));
  const dst = new cv.Mat();
  if (whiteBorder) cv.warpPerspective(src, dst, M, new cv.Size(W, H), interp ?? cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));
  else cv.warpPerspective(src, dst, M, new cv.Size(W, H), interp ?? cv.INTER_LINEAR, cv.BORDER_REPLICATE);
  M.delete();
  return dst;
}

/** Posisi garis horizontal penuh di dalam tabel yang sudah diluruskan (px). */
function horizontalLines(cv, tableNorm) {
  const t = track();
  const W = tableNorm.cols, H = tableNorm.rows;
  const bin = t(binarize(cv, tableNorm, Math.max(15, Math.round(W / 16)), 7));
  // kernel pendek: garis tabel sering putus-putus di foto, teks & bulatan lebih pendek dari ini
  const ker = t(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.round(W * 0.07), 1)));
  const lines = t(new cv.Mat());
  cv.morphologyEx(bin, lines, cv.MORPH_OPEN, ker);
  const vk = t(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, 3)));
  cv.dilate(lines, lines, vk);
  const prof = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    let s = 0;
    const row = y * W;
    for (let x = 0; x < W; x++) s += lines.data[row + x];
    prof[y] = s / 255 / W;
  }
  t.free();
  const found = [];
  let y = 0;
  while (y < H) {
    if (prof[y] > 0.35) {
      let y2 = y, sum = 0, wsum = 0;
      while (y2 < H && prof[y2] > 0.35) { sum += y2 * prof[y2]; wsum += prof[y2]; y2++; }
      found.push(sum / wsum);
      y = y2;
    } else y++;
  }
  return found;
}

/** Cocokkan garis terdeteksi dengan batas baris yang diharapkan (pecahan tinggi). */
function matchBoundaries(found, expectedFrac, H) {
  const exp = expectedFrac.map(f => f * H);
  let minGap = Infinity;
  for (let i = 1; i < exp.length; i++) minGap = Math.min(minGap, exp[i] - exp[i - 1]);
  const tol = minGap * 0.35;
  const used = new Set();
  const snapped = exp.map(e => {
    let best = -1, bd = Infinity;
    found.forEach((f, i) => { const d = Math.abs(f - e); if (d < bd && !used.has(i)) { bd = d; best = i; } });
    if (best >= 0 && bd <= tol) { used.add(best); return { y: found[best], ok: true }; }
    return { y: e, ok: false };
  });
  const matched = snapped.filter(s => s.ok).length;
  // garis interior yang tidak diharapkan (mis. dari tabel lain) menurunkan skor
  const extra = found.filter((f, i) => !used.has(i) && f > tol && f < H - tol).length;
  // isi batas yang tidak cocok dengan interpolasi pergeseran tetangga
  for (let i = 0; i < snapped.length; i++) {
    if (snapped[i].ok) continue;
    let lo = i - 1, hi = i + 1;
    while (lo >= 0 && !snapped[lo].ok) lo--;
    while (hi < snapped.length && !snapped[hi].ok) hi++;
    const offLo = lo >= 0 ? snapped[lo].y - exp[lo] : 0;
    const offHi = hi < snapped.length ? snapped[hi].y - exp[hi] : offLo;
    snapped[i].y = exp[i] + (lo >= 0 ? (offLo + offHi) / 2 : offHi);
  }
  const score = matched / exp.length - extra / exp.length;
  return { ys: snapped.map(s => s.y), score, matched, extra, total: exp.length };
}

function laplacianVar(cv, gray) {
  const t = track();
  const lap = t(new cv.Mat());
  cv.Laplacian(gray, lap, cv.CV_64F);
  const mean = t(new cv.Mat()), sd = t(new cv.Mat());
  cv.meanStdDev(lap, mean, sd);
  const v = sd.data64F[0] ** 2;
  t.free();
  return v;
}

function ellipseStats(mat, cx, cy, rx, ry) {
  // rata-rata kegelapan (0 = putih, 1 = hitam) di dalam elips
  const W = mat.cols, H = mat.rows, d = mat.data;
  let sum = 0, n = 0;
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(W - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(H - 1, Math.ceil(cy + ry));
  for (let y = y0; y <= y1; y++) {
    const dy = (y - cy) / ry;
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dy * dy <= 1) { sum += 255 - d[y * W + x]; n++; }
    }
  }
  return n ? sum / n / 255 : 0;
}

// ------------------------------------------------------- persiapan gambar

function prepare(cv, img, params) {
  const t = track();
  const src = t(imageDataToMat(cv, img));
  const work = resizeMax(cv, src, params.workMaxSide);
  const workGray = new cv.Mat();
  cv.cvtColor(work.mat, workGray, cv.COLOR_RGBA2GRAY);
  t.free();
  return { workRGBA: work.mat, workGray, scale: work.scale };
}

function rotateMat(cv, m, rot) {
  const out = new cv.Mat();
  if (rot === 0) m.copyTo(out);
  else cv.rotate(m, out, { 90: cv.ROTATE_90_CLOCKWISE, 180: cv.ROTATE_180, 270: cv.ROTATE_90_COUNTERCLOCKWISE }[rot]);
  return out;
}

// --------------------------------------------------------------- kalibrasi

/**
 * Kalibrasi template dari foto lembar kosong.
 * @param template objek dengan id, nama, opsi, struktur (tanpa kalibrasi)
 * @param opts.rotation rotasi foto (0/90/180/270) agar lembar tegak; default 0
 * @returns template baru dengan field kalibrasi
 */
export function calibrate(cv, img, template, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params || {}) };
  const t = track();
  const prep = prepare(cv, img, params);
  t(prep.workRGBA); t(prep.workGray);
  const gray = t(rotateMat(cv, prep.workGray, opts.rotation || 0));
  const norm = t(normalizeLight(cv, gray));
  const detScale = Math.min(1, params.detectMaxSide / Math.max(norm.cols, norm.rows));
  const det = t(new cv.Mat());
  cv.resize(norm, det, new cv.Size(0, 0), detScale, detScale, cv.INTER_AREA);
  const quads = findQuads(cv, det, params.minQuadAreaFrac).map(q => ({ ...q, pts: q.pts.map(p => [p[0] / detScale, p[1] / detScale]) }));

  const tabelSpec = template.struktur.map(s => ({ id: s.id, rows: parseRows(s.baris) }));
  // Tabel diurutkan kiri ke kanan; calon = segi empat yang garis horizontalnya
  // sama banyak dengan jumlah baris + 1.
  const W = params.tableNormWidth;
  const candidates = [];
  for (const q of quads) {
    const { w, h } = quadSize(q.pts);
    const H = Math.round(W * h / w);
    if (H < 20 || H > W * 20) continue;
    const tw = t(warp(cv, norm, q.pts, W, H));
    const lines = horizontalLines(cv, tw);
    candidates.push({ q, H, lines, tw });
  }
  const tabelKal = [];
  const usedQ = new Set();
  for (const spec of tabelSpec) {
    const need = spec.rows.length + 1;
    const fits = candidates.filter(c => !usedQ.has(c) && withBorders(c.lines, c.H).length === need)
      .sort((a, b) => a.q.pts[0][0] - b.q.pts[0][0]);
    if (!fits.length) {
      const counts = candidates.map(c => withBorders(c.lines, c.H).length - 1).join(', ');
      throw new Error(`Tabel ${spec.id}: tidak ada kotak dengan ${spec.rows.length} baris. Baris terdeteksi pada kotak-kotak: [${counts}]`);
    }
    const c = fits[0];
    usedQ.add(c);
    const ys = withBorders(c.lines, c.H);
    const cols = bubbleColumns(cv, c.tw, ys, spec.rows, template.opsi);
    tabelKal.push({ id: spec.id, quadWork: c.q.pts, H: c.H, ys, cols, tw: c.tw, rows: spec.rows });
  }

  // Bingkai kanonik: luruskan tabel pertama menjadi persegi panjang di posisinya sendiri.
  const t0 = tabelKal[0];
  const s0 = quadSize(t0.quadWork);
  const o = t0.quadWork[0];
  const Hc = t(perspective(cv, t0.quadWork, rectPts(o[0], o[1], s0.w, s0.h)));
  const toCanon = p => applyH(Hc, p);

  const out = { ...template, kalibrasi: { tanggal: new Date().toISOString(), sumber: opts.sumber || null, tabel: [] } };
  let bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const grow = pts => { for (const p of pts) { bbox[0] = Math.min(bbox[0], p[0]); bbox[1] = Math.min(bbox[1], p[1]); bbox[2] = Math.max(bbox[2], p[0]); bbox[3] = Math.max(bbox[3], p[1]); } };

  for (const tk of tabelKal) {
    const sudut = tk.quadWork.map(toCanon);
    grow(sudut);
    // baseline tinta per bulatan (lembar kosong): kegelapan elips dalam
    const baseline = {};
    const rowsQ = tk.rows.map((r, i) => ({ ...r, i })).filter(r => r.jenis === 'soal');
    for (const r of rowsQ) {
      const cy = (tk.ys[r.i] + tk.ys[r.i + 1]) / 2;
      baseline[r.no] = tk.cols.cx.map(cx => round4(ellipseStats(tk.tw, cx, cy, tk.cols.rx * 0.8, tk.cols.ry * 0.8)));
    }
    out.kalibrasi.tabel.push({
      id: tk.id,
      sudut: sudut.map(p => p.map(round2)),
      normW: W, normH: tk.H,
      batasBaris: tk.ys.map(y => round4(y / tk.H)),
      kolomOpsi: tk.cols.cx.map(x => round4(x / W)),
      radius: { rx: round4(tk.cols.rx / W), ry: round4(tk.cols.ry / tk.H) },
      baseline,
    });
  }

  // Kotak nama & nomor peserta: segi empat lebar di atas tabel.
  const boxes = findHeaderBoxes(cv, norm, quads, tabelKal, params);
  if (boxes.nama) { out.kalibrasi.kotakNama = canonRect(boxes.nama.map(toCanon), boxes.namaTerbuka); grow(boxes.nama.map(toCanon)); }
  if (boxes.peserta) { out.kalibrasi.kotakNoPeserta = canonRect(boxes.peserta.map(toCanon), false); grow(boxes.peserta.map(toCanon)); }

  const m = 0.06 * (bbox[2] - bbox[0]);
  out.kalibrasi.kanvas = { x: round2(bbox[0] - m), y: round2(bbox[1] - m), w: round2(bbox[2] - bbox[0] + 2 * m), h: round2(bbox[3] - bbox[1] + 2 * m) };
  if (out.kalibrasi.kotakNama?.terbuka) {
    // kotak nama terpotong di foto kalibrasi: perpanjang sampai tepi kanan kanvas
    const kn = out.kalibrasi.kotakNama;
    kn.w = round2(out.kalibrasi.kanvas.x + out.kalibrasi.kanvas.w - kn.x);
  }
  out.ambang = { ...DEFAULT_AMBANG, ...(template.ambang || {}) };
  t.free();
  return out;
}

function round2(v) { return Math.round(v * 100) / 100; }
function round4(v) { return Math.round(v * 10000) / 10000; }

function withBorders(lines, H) {
  const ys = [...lines];
  const tol = H * 0.01 + 2;
  if (!ys.length || ys[0] > tol) ys.unshift(0);
  if (ys[ys.length - 1] < H - tol) ys.push(H - 1);
  return ys;
}

function canonRect(pts, terbuka) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x: round2(x), y: round2(y), w: round2(Math.max(...xs) - x), h: round2(Math.max(...ys) - y), terbuka: !!terbuka };
}

/** Pusat kolom bulatan & radius dari proyeksi vertikal piksel gelap di baris soal. */
function bubbleColumns(cv, tw, ys, rows, nOpsi) {
  const t = track();
  const W = tw.cols;
  const bin = t(binarize(cv, tw, Math.max(15, Math.round(W / 16))));
  // garis vertikal (batas kolom nomor) dihapus dulu supaya tidak ikut terhitung
  const vk = t(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(1, Math.round(tw.rows * 0.05) + 3)));
  const vl = t(new cv.Mat());
  cv.morphologyEx(bin, vl, cv.MORPH_OPEN, vk);
  const hk = t(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.round(W * 0.3), 1)));
  const hl = t(new cv.Mat());
  cv.morphologyEx(bin, hl, cv.MORPH_OPEN, hk);
  const vlineX = [];
  {
    const prof = new Float32Array(W);
    for (let y = 0; y < tw.rows; y++) for (let x = 0; x < W; x++) prof[x] += vl.data[y * W + x];
    const mx = Math.max(...prof);
    for (let x = 0; x < W; x++) if (prof[x] > mx * 0.5) vlineX.push(x);
  }
  // pemisah kolom nomor = garis vertikal interior paling kiri
  const interior = vlineX.filter(x => x > W * 0.08 && x < W * 0.5);
  const startX = interior.length ? Math.max(...interior.filter(x => x < Math.min(...interior) + 6)) + 4 : Math.round(W * 0.25);
  const prof = new Float32Array(W);
  const vprof = [];
  rows.forEach((r, i) => {
    if (r.jenis !== 'soal') return;
    const y0 = Math.round(ys[i] + (ys[i + 1] - ys[i]) * 0.15), y1 = Math.round(ys[i + 1] - (ys[i + 1] - ys[i]) * 0.15);
    for (let y = y0; y < y1; y++) for (let x = startX; x < W - 4; x++) {
      const k = y * W + x;
      if (bin.data[k] && !vl.data[k] && !hl.data[k]) prof[x] += 1;
    }
    vprof.push(ys[i + 1] - ys[i]);
  });
  t.free();
  // cari nOpsi kelompok kolom
  const mx = Math.max(...prof);
  const runs = [];
  let x = startX;
  while (x < W) {
    if (prof[x] > mx * 0.15) {
      let x2 = x, s = 0, sw = 0;
      while (x2 < W && prof[x2] > mx * 0.15) { s += x2 * prof[x2]; sw += prof[x2]; x2++; }
      runs.push({ c: s / sw, w: x2 - x, mass: sw });
      x = x2;
    } else x++;
  }
  // gabungkan run yang terlalu dekat, lalu ambil nOpsi run dengan massa terbesar
  runs.sort((a, b) => b.mass - a.mass);
  const top = runs.slice(0, nOpsi).sort((a, b) => a.c - b.c);
  if (top.length !== nOpsi) throw new Error(`Hanya ${top.length} kolom bulatan terdeteksi (perlu ${nOpsi})`);
  const gaps = top.slice(1).map((r, i) => r.c - top[i].c);
  const rowH = vprof.sort((a, b) => a - b)[Math.floor(vprof.length / 2)];
  const rx = Math.min(...top.map(r => r.w)) / 2;
  return { cx: top.map(r => r.c), rx: Math.max(3, Math.min(rx, Math.min(...gaps) * 0.35)), ry: rowH * 0.36 };
}

/** Cari kotak nomor peserta & nama: segi empat lebar dan pendek di atas tabel. */
function findHeaderBoxes(cv, norm, quads, tabelKal, params) {
  const topTable = Math.min(...tabelKal.flatMap(t => t.quadWork.map(p => p[1])));
  const leftTable = Math.min(...tabelKal.map(t => t.quadWork[0][0]));
  const wide = quads.filter(q => {
    const { w, h } = quadSize(q.pts);
    return w / h > 3 && q.pts[2][1] < topTable && q.pts[2][1] > topTable - h * 3;
  }).sort((a, b) => a.pts[0][0] - b.pts[0][0]);
  // buang kotak yang berada di dalam kotak lain (sel isian di dalam kotak)
  const outer = wide.filter(q => !wide.some(o => o !== q && o.area > q.area && q.pts[0][0] >= o.pts[0][0] - 3 && q.pts[1][0] <= o.pts[1][0] + 3));
  let peserta = outer.find(q => q.pts[1][0] < leftTable + 5)?.pts || null;
  let nama = outer.find(q => q.pts[0][0] > leftTable - 30)?.pts || null;
  let namaTerbuka = false;
  if (!nama && peserta) {
    // kotak nama tidak tertutup di foto (terpotong): pakai garis horizontal sejajar kotak peserta
    const { w, h } = quadSize(peserta);
    const x0 = leftTable - 10;
    nama = [[x0, peserta[0][1]], [x0 + w * 3, peserta[1][1]], [x0 + w * 3, peserta[2][1]], [x0, peserta[3][1]]];
    namaTerbuka = true;
    void h;
  }
  // bagian isian saja: buang sel label di kiri (kira-kira 8% lebar kotak nama, 33% kotak peserta)
  const trimLeft = (q, frac) => {
    const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    return [lerp(q[0], q[1], frac), q[1], q[2], lerp(q[3], q[2], frac)];
  };
  void params; void norm;
  return {
    nama: nama ? trimLeft(nama, namaTerbuka ? 0.03 : 0.08) : null,
    namaTerbuka,
    peserta: peserta ? trimLeft(peserta, 0.33) : null,
  };
}

// ----------------------------------------------------------------- membaca

/**
 * Baca satu foto lembar jawaban.
 * @returns {ok, alasan?, petunjuk?, rotation, jawaban: {[no]: {pilihan, status, kepercayaan, skor[]}},
 *           kualitas, gambarLurus (ImageData), kotakNama (ImageData|null), overlay}
 */
export function readSheet(cv, img, template, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params || {}) };
  const ambang = { ...DEFAULT_AMBANG, ...(template.ambang || {}) };
  const kal = template.kalibrasi;
  if (!kal) throw new Error('Template belum dikalibrasi');
  const t = track();
  try {
    const prep = prepare(cv, img, params);
    t(prep.workRGBA); t(prep.workGray);

    // --- deteksi di 4 rotasi, pilih yang paling cocok dengan template
    const tabelSpec = template.struktur.map(s => ({ id: s.id, rows: parseRows(s.baris), kal: kal.tabel.find(k => k.id === s.id) }));
    const workNorm = t(normalizeLight(cv, prep.workGray));
    let best = null;
    for (const rot of [0, 180, 90, 270]) {
      const r = locate(cv, prep.workGray, workNorm, rot, tabelSpec, params, t);
      if (r && (!best || r.score > best.score)) { best = r; }
      if (best && best.score > tabelSpec.length * 0.97 && best.complete) break;
    }
    if (!best || !best.complete) {
      const n = best ? best.found : 0;
      // beri petunjuk spesifik bila penyebabnya kemungkinan gelap/buram
      const mean = cv.mean(prep.workGray)[0];
      const sharp = laplacianVar(cv, prep.workGray);
      const kualitas = { kecerahan: Math.round(mean), ketajaman: Math.round(sharp) };
      if (mean < params.minBrightness) return { ok: false, alasan: 'terlalu_gelap', kualitas, petunjuk: 'Foto terlalu gelap sehingga tabel soal tidak terlihat. Pindah ke tempat lebih terang, hindari bayangan tangan/HP.' };
      if (sharp < params.minSharpnessGlobal) return { ok: false, alasan: 'terlalu_buram', kualitas, petunjuk: 'Foto buram sehingga garis tabel tidak terbaca. Pegang HP diam, ketuk layar untuk fokus, lalu foto ulang.' };
      return {
        kualitas,
        ok: false,
        alasan: 'tabel_tidak_lengkap',
        petunjuk: `Kotak tabel soal tidak terdeteksi lengkap (${n} dari ${tabelSpec.length}). Pastikan seluruh tabel soal masuk bingkai, garis kotak tidak tertutup jari/bayangan pekat, lalu foto ulang.`,
      };
    }
    const { rot, norm, gray, tables } = best;

    // --- gerbang kualitas
    const allPts = tables.flatMap(tb => tb.quad);
    const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
    const roi = new cv.Rect(Math.max(0, Math.floor(Math.min(...xs))), Math.max(0, Math.floor(Math.min(...ys))), 0, 0);
    roi.width = Math.min(gray.cols, Math.ceil(Math.max(...xs))) - roi.x;
    roi.height = Math.min(gray.rows, Math.ceil(Math.max(...ys))) - roi.y;
    const roiGray = t(gray.roi(roi));
    const mean = cv.mean(roiGray)[0];
    const sharp = laplacianVar(cv, roiGray);
    const tallest = Math.max(...tables.map(tb => quadSize(tb.quad).h));
    const kualitas = { kecerahan: Math.round(mean), ketajaman: Math.round(sharp), ukuranTabel: round4(tallest / Math.min(gray.cols, gray.rows)), rotasi: rot, skorStruktur: round4(best.score / tabelSpec.length) };
    if (mean < params.minBrightness) return { ok: false, alasan: 'terlalu_gelap', kualitas, petunjuk: 'Foto terlalu gelap. Pindah ke tempat lebih terang atau nyalakan lampu, hindari bayangan tangan/HP di atas lembar.' };
    if (sharp < params.minSharpness) return { ok: false, alasan: 'terlalu_buram', kualitas, petunjuk: 'Foto buram. Pegang HP diam, ketuk layar untuk fokus pada tabel soal, lalu foto ulang.' };
    if (kualitas.ukuranTabel < params.minTableFrac) return { ok: false, alasan: 'terlalu_jauh', kualitas, petunjuk: 'Lembar terlalu kecil di foto. Dekatkan HP sampai lembar memenuhi bingkai panduan.' };

    // --- baca bulatan per tabel
    const jawaban = {};
    const overlay = [];
    const ratios = [];
    const raw = [];
    for (const tb of tables) {
      const k = tb.spec.kal;
      const W = k.normW, H = k.normH;
      const tw = t(warp(cv, norm, tb.quad, W, H));
      const lines = horizontalLines(cv, tw);
      const m = matchBoundaries(lines, k.batasBaris, H);
      const Minv = t(invert(cv, t(perspective(cv, tb.quad, rectPts(0, 0, W, H)))));
      tb.spec.rows.forEach((r, i) => {
        if (r.jenis !== 'soal') return;
        const cy = (m.ys[i] + m.ys[i + 1]) / 2;
        const rowH = m.ys[i + 1] - m.ys[i];
        const ry = Math.min(k.radius.ry * H, rowH * 0.4);
        const rx = k.radius.rx * W;
        const d = k.kolomOpsi.map(fx => ellipseStats(tw, fx * W, cy, rx * 0.8, ry * 0.8));
        const base = k.baseline[r.no] || d.map(() => 0);
        d.forEach((v, j) => { if (base[j] > 0.02) ratios.push(v / base[j]); });
        raw.push({ no: r.no, d, base });
        overlay.push({ no: r.no, titik: k.kolomOpsi.map(fx => applyH(Minv, [fx * W, cy])), ...applyRadius(Minv, [k.kolomOpsi[0] * W, cy], rx, ry) });
      });
    }
    // skala baseline per lembar: median rasio kegelapan/baseline (mayoritas bulatan kosong)
    ratios.sort((a, b) => a - b);
    const f = ratios.length ? Math.min(2.5, Math.max(0.4, ratios[Math.floor(ratios.length * 0.4)])) : 1;
    kualitas.skalaBaseline = round4(f);
    for (const { no, d, base } of raw) {
      const skor = d.map((v, j) => Math.max(0, v - f * base[j]));
      // bayangan lokal menggelapkan semua bulatan satu soal secara merata: kurangi lantai baris,
      // kecuali semua bulatan memang terisi (lantai melewati ambang tanda).
      const lantai = Math.min(...skor);
      if (lantai < ambang.tanda) for (let j = 0; j < skor.length; j++) skor[j] -= lantai;
      jawaban[no] = decide(skor, ambang);
    }

    // --- foto yang diluruskan (bingkai kanonik) & potongan kotak nama
    const Hcw = t(canonToWork(cv, tables, kal));
    const kv = kal.kanvas;
    const scaleOut = Math.min(1, 1400 / kv.w);
    const outW = Math.round(kv.w * scaleOut), outH = Math.round(kv.h * scaleOut);
    const rgb = t(rotateMat(cv, prep.workRGBA, rot));
    const lurusPts = rectPts(kv.x, kv.y, kv.w, kv.h).map(p => applyH(Hcw, p));
    const lurus = t(warp(cv, rgb, lurusPts, outW, outH, cv.INTER_AREA, true));
    const toOut = p => [(p[0] - kv.x) * scaleOut, (p[1] - kv.y) * scaleOut];
    const Hwc = t(invert(cv, Hcw));
    const overlayOut = overlay.map(o => ({ no: o.no, titik: o.titik.map(p => toOut(applyH(Hwc, p))), r: (o.rx + o.ry) / 2 * scaleOut }));

    let kotakNama = null, namaTerpotong = false;
    if (kal.kotakNama) {
      const kn = kal.kotakNama;
      let pts = rectPts(kn.x, kn.y, kn.w, kn.h).map(p => applyH(Hcw, p));
      const inside = p => p[0] >= 0 && p[1] >= 0 && p[0] < rgb.cols && p[1] < rgb.rows;
      if (!pts.every(inside)) {
        namaTerpotong = true;
        // potong ke bagian yang masih di dalam foto
        const lim = clipRightToImage(pts, rgb.cols, rgb.rows);
        pts = lim;
      }
      if (pts) {
        const { w, h } = quadSize(pts);
        if (w > 20 && h > 5) {
          const scale = Math.min(1, 1200 / w);
          const nm = t(warp(cv, rgb, pts, Math.round(w * scale), Math.round(h * scale)));
          kotakNama = matToImageData(cv, nm);
        }
      }
    }
    // posisi bulatan pada foto asli (dipakai generator data uji); hanya untuk rotasi 0
    const posisiAsli = rot === 0 ? overlay.map(o => ({ no: o.no, titik: o.titik.map(p => [p[0] / prep.scale, p[1] / prep.scale]), rx: o.rx / prep.scale, ry: o.ry / prep.scale })) : null;
    return {
      ok: true,
      rotation: rot,
      posisiAsli,
      jawaban,
      kualitas,
      namaTerpotong,
      gambarLurus: matToImageData(cv, lurus),
      overlay: overlayOut,
      kotakNama,
    };
  } finally {
    t.free();
  }
}

function applyRadius(Minv, c, rx, ry) {
  const a = applyH(Minv, c), b = applyH(Minv, [c[0] + rx, c[1]]), d = applyH(Minv, [c[0], c[1] + ry]);
  return { rx: dist(a, b), ry: dist(a, d) };
}

function clipRightToImage(pts, W, H) {
  // pts: TL TR BR BL. Geser TR/BR ke kiri sampai masuk gambar.
  const inside = p => p[0] >= 0 && p[1] >= 0 && p[0] < W && p[1] < H;
  if (!inside(pts[0]) || !inside(pts[3])) return null;
  const lerp = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inside(lerp(pts[0], pts[1], mid)) && inside(lerp(pts[3], pts[2], mid))) lo = mid; else hi = mid;
  }
  return [pts[0], lerp(pts[0], pts[1], lo), lerp(pts[3], pts[2], lo), pts[3]];
}

/** Homografi kanonik -> gambar kerja dari semua sudut tabel yang terdeteksi. */
function canonToWork(cv, tables, kal) {
  const src = [], dst = [];
  for (const tb of tables) {
    const k = tb.spec.kal;
    src.push(...k.sudut); dst.push(...tb.quad);
  }
  if (src.length === 4) return perspective(cv, src, dst);
  const a = matFromPts(cv, src), b = matFromPts(cv, dst);
  const Hm = cv.findHomography(a, b, 0);
  a.delete(); b.delete();
  return Hm;
}

/** Temukan tabel template pada satu rotasi. */
function locate(cv, workGray, workNorm, rot, tabelSpec, params, t) {
  const gray = t(rotateMat(cv, workGray, rot));
  const norm = t(rotateMat(cv, workNorm, rot));
  const detScale = Math.min(1, params.detectMaxSide / Math.max(norm.cols, norm.rows));
  const det = t(new cv.Mat());
  cv.resize(norm, det, new cv.Size(0, 0), detScale, detScale, cv.INTER_AREA);
  const quads = findQuads(cv, det, params.minQuadAreaFrac).slice(0, 14)
    .map(q => ({ ...q, pts: q.pts.map(p => [p[0] / detScale, p[1] / detScale]) }));
  // skor struktur tiap pasangan (calon, tabel)
  const scored = tabelSpec.map(spec => {
    const k = spec.kal;
    const aspect = k.normH / k.normW;
    return quads.map(q => {
      const { w, h } = quadSize(q.pts);
      const a = h / w;
      if (a < aspect * 0.6 || a > aspect * 1.6) return { q, score: -1 };
      const Wd = 240, Hd = Math.round(240 * aspect);
      const tw = warp(cv, det, q.pts.map(p => [p[0] * detScale, p[1] * detScale]), Wd, Hd);
      const m = matchBoundaries(horizontalLines(cv, tw), k.batasBaris, Hd);
      tw.delete();
      return { q, score: m.score };
    });
  });
  // pilih kombinasi terbaik (tabel berbeda, susunan cocok dengan kanonik)
  let best = null;
  const n = tabelSpec.length;
  const pick = (i, chosen, total) => {
    if (i === n) {
      let layout = 0;
      if (n > 1) layout = layoutError(chosen.map(c => c.q.pts), tabelSpec.map(s => s.kal.sudut));
      const score = total - layout;
      if (!best || score > best.score) best = { score, chosen: [...chosen] };
      return;
    }
    for (const s of scored[i]) {
      if (s.score < params.minStructureScore) continue;
      if (chosen.some(c => c.q === s.q)) continue;
      chosen.push(s); pick(i + 1, chosen, total + s.score); chosen.pop();
    }
  };
  pick(0, [], 0);
  if (!best) {
    // laporkan berapa tabel yang bisa ditemukan sendiri-sendiri
    const found = scored.filter(arr => arr.some(s => s.score >= params.minStructureScore)).length;
    return { score: found - n, complete: false, found, rot };
  }
  return {
    score: best.score, complete: true, found: n, rot, norm, gray,
    tables: best.chosen.map((c, i) => ({ quad: c.q.pts, spec: tabelSpec[i] })),
  };
}

/** Galat tata letak: sudut tabel dipetakan ke kanonik dengan homografi tabel pertama. */
function layoutError(quads, canon) {
  // bandingkan vektor antar-pusat tabel yang dinormalisasi dengan lebar tabel pertama
  const c = q => [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4];
  const w0 = quadSize(quads[0]).w, cw0 = quadSize(canon[0]).w;
  let err = 0;
  for (let i = 1; i < quads.length; i++) {
    const a = c(quads[i]), a0 = c(quads[0]);
    const b = c(canon[i]), b0 = c(canon[0]);
    const v1 = [(a[0] - a0[0]) / w0, (a[1] - a0[1]) / w0];
    const v2 = [(b[0] - b0[0]) / cw0, (b[1] - b0[1]) / cw0];
    err += Math.hypot(v1[0] - v2[0], v1[1] - v2[1]);
  }
  return err;
}

/** Keputusan per soal dari skor kegelapan bersih (sudah dikurangi baseline). */
export function decide(skor, ambang = DEFAULT_AMBANG) {
  const idx = skor.map((v, i) => i).sort((a, b) => skor[b] - skor[a]);
  const top1 = skor[idx[0]], top2 = skor[idx[1]] ?? 0;
  const r = v => Math.round(v * 1000) / 1000;
  const base = { skor: skor.map(r) };
  if (top1 < ambang.samar) {
    return { ...base, pilihan: null, status: 'kosong', kepercayaan: r(clamp01(1 - top1 / ambang.samar * 0.5)) };
  }
  if (top1 < ambang.tanda) {
    // tanda sangat tipis: bisa tanda pensil ringan atau sisa hapusan
    return { ...base, pilihan: idx[0] + 1, status: 'tidak_yakin', kepercayaan: r(clamp01((top1 - ambang.samar) / (ambang.tanda - ambang.samar)) * 0.5) };
  }
  if (top2 >= ambang.tanda && top2 >= ambang.rasioGanda * top1) {
    const marked = idx.filter(i => skor[i] >= ambang.tanda && skor[i] >= ambang.rasioGanda * top1).map(i => i + 1).sort();
    return { ...base, pilihan: null, ganda: marked, status: 'ganda', kepercayaan: r(clamp01(top2 / top1)) };
  }
  if (top2 < ambang.samar || top2 < ambang.rasioJelas * top1) {
    const margin = (top1 - Math.max(top2, ambang.samar)) / top1;
    return { ...base, pilihan: idx[0] + 1, status: 'jelas', kepercayaan: r(clamp01(0.5 + margin * 0.5) * clamp01(top1 / ambang.tanda)) };
  }
  return { ...base, pilihan: idx[0] + 1, status: 'tidak_yakin', kepercayaan: r(clamp01(1 - top2 / top1) * 0.6) };
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

export { describe };
