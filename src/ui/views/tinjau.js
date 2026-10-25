// Panel tinjau: foto yang diluruskan + jawaban terbaca + benar/salah, semua sel bisa dikoreksi.
import { h, mount } from '../dom.js';
import { describe, opsiLabels } from '../../lib/template.js';
import { finalAnswers } from '../../lib/grading.js';
import { nilaiDenganSesi } from '../../lib/model.js';

const LABEL_STATUS = { jelas: 'jelas', kosong: 'kosong', ganda: 'ganda', tidak_yakin: 'tidak yakin', manual: 'manual' };

/**
 * @param {object} p
 * @param p.foto  HTMLCanvasElement | ImageBitmap | null  foto yang sudah diluruskan
 * @param p.overlay  [{no, titik:[[x,y]...], r}] dalam koordinat foto
 * @param p.bacaan  {no: {status, pilihan, kepercayaan, skor}}
 * @param p.koreksi {no: pilihan|null} koreksi guru
 */
export function panelTinjau({ sesi, template, bacaan, koreksi = {}, foto, overlay = [], onChange }) {
  const d = describe(template);
  const labels = opsiLabels(template);
  const st = { koreksi: { ...koreksi }, fokus: null };
  const canvas = h('canvas');
  const skorEl = h('div');
  const listEl = h('div');

  const final = () => finalAnswers(bacaan, st.koreksi);

  const gambar = () => {
    if (!foto) return;
    const W = foto.width, H = foto.height;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(foto, 0, 0);
    const { jawaban, belum } = final();
    const perlu = new Set(belum);
    for (const o of overlay) {
      const k = sesi.kunci[o.no];
      const j = jawaban[o.no];
      o.titik.forEach((p, i) => {
        const pilih = j === i + 1, kunci = k === i + 1;
        if (!pilih && !kunci && !perlu.has(o.no) && st.fokus !== o.no) return;
        ctx.lineWidth = pilih ? 3 : 2;
        ctx.strokeStyle = perlu.has(o.no) ? '#d49a00' : pilih ? (kunci ? '#1d7a43' : '#b3261e') : kunci ? '#1d7a43' : '#1f5fbf';
        if (!pilih && kunci) ctx.setLineDash([4, 3]); else ctx.setLineDash([]);
        ctx.beginPath(); ctx.ellipse(p[0], p[1], o.r * 1.25, o.r * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
      });
      if (st.fokus === o.no) {
        const xs = o.titik.map(p => p[0]);
        ctx.setLineDash([]); ctx.strokeStyle = '#1f5fbf'; ctx.lineWidth = 2;
        ctx.strokeRect(Math.min(...xs) - o.r * 3, o.titik[0][1] - o.r * 2.2, Math.max(...xs) - Math.min(...xs) + o.r * 6, o.r * 4.4);
      }
    }
  };

  const render = () => {
    const { jawaban, belum } = final();
    const nilai = nilaiDenganSesi(sesi, jawaban);
    mount(skorEl, h('div', { class: 'card scorebar' },
      h('span', { class: 'big' }, `${nilai.persen}%`),
      h('span', null, `${nilai.skor}/${nilai.skorMaks} · ${nilai.lulus ? 'lulus' : 'tidak lulus'}`),
      h('span', { class: 'badge warn' }, 'Belum final sebelum disimpan'),
      belum.length ? h('span', { class: 'badge bad' }, `${belum.length} soal wajib ditinjau: ${belum.join(', ')}`) : h('span', { class: 'badge ok' }, 'Tidak ada soal yang menunggu tinjauan')));
    const perlu = new Set(belum);
    mount(listEl, h('div', { class: 'qgrid' }, d.mondai.map(m => [
      h('div', { class: 'mondaihead' }, `Mondai ${m.no}`, (() => { const pm = nilai.perMondai.find(x => x.no === m.no); return pm ? ` · ${pm.skor}/${pm.maks}` : ''; })()),
      m.soal.map(no => {
        const b = bacaan[no] || { status: 'manual' };
        const j = jawaban[no];
        const k = sesi.kunci[no];
        const dikoreksi = Object.prototype.hasOwnProperty.call(st.koreksi, no);
        const cls = perlu.has(no) ? 'perlu' : k == null ? '' : j === k ? 'benar' : 'salah';
        const set = v => { st.koreksi[no] = v; st.fokus = no; render(); onChange?.(); };
        return h('div', { class: `q ${cls}`, 'data-no': no, onclick: () => { st.fokus = no; gambar(); } },
          h('div', { class: 'no' }, no),
          h('div', { class: 'opts' },
            labels.map((lb, i) => h('button', { class: 'opt' + (j === i + 1 && !perlu.has(no) ? ' on' : '') + (k === i + 1 ? ' kunci' : ''), 'aria-label': `Soal ${no} pilih ${lb}`, onclick: e => { e.stopPropagation(); set(i + 1); } }, lb)),
            h('button', { class: 'opt x' + (j == null && !perlu.has(no) ? ' on' : ''), 'aria-label': `Soal ${no} kosong`, onclick: e => { e.stopPropagation(); set(null); } }, 'Kosong')),
          h('div', { class: 'info' },
            h('div', null, dikoreksi ? h('span', { class: 'badge' }, 'dikoreksi') : h('span', { class: 'badge ' + ({ jelas: 'ok', kosong: '', ganda: 'bad', tidak_yakin: 'warn' }[b.status] || '') }, LABEL_STATUS[b.status] || b.status)),
            b.kepercayaan != null && h('div', null, `yakin ${Math.round(b.kepercayaan * 100)}%`),
            k != null ? h('div', null, perlu.has(no) ? '' : j === k ? 'benar' : 'salah') : h('div', null, 'tanpa kunci')));
      }),
    ])));
    gambar();
  };

  render();
  const el = h('div', { class: 'scan-layout review' },
    h('div', { class: 'sticky photo' }, foto ? canvas : h('div', { class: 'card muted' }, 'Foto tidak tersimpan'),
      h('div', { class: 'small muted' }, 'Garis hijau = kunci, merah = jawaban salah, kuning = perlu ditinjau. Ketuk baris soal untuk menyorot di foto.')),
    h('div', null, skorEl, listEl));
  return { el, get: () => ({ ...final(), koreksi: { ...st.koreksi } }) };
}
