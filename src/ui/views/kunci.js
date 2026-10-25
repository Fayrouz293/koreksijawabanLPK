// Editor kunci jawaban: dari gambar (Claude), dari lembar jawaban berisi kunci (OMR lokal), atau ketik.
import { h, mount, toast, pilihFile } from '../dom.js';
import { describe, opsiLabels } from '../../lib/template.js';
import { fileToImage, blobToBase64 } from '../../lib/images.js';
import { bacaKunciClaude } from '../../lib/api.js';
import { bacaLembar } from '../../omr-client.js';
import { app } from '../../main.js';

export function editorKunci({ template, kunci, bobot = {}, catatan = {} }) {
  const d = describe(template);
  const labels = opsiLabels(template);
  const state = { kunci: { ...kunci }, bobot: { ...bobot }, catatan: { ...catatan } };
  const info = h('div');
  const grid = h('div');
  const status = h('div');

  const renderGrid = () => {
    const kosong = d.soal.filter(s => state.kunci[s.no] == null).map(s => s.no);
    mount(info, h('div', { class: kosong.length ? 'banner warn small' : 'banner ok small' },
      `${d.jumlahSoal - kosong.length} dari ${d.jumlahSoal} soal berkunci.`,
      kosong.length ? ` Belum ada kunci: ${kosong.join(', ')}. Soal tanpa kunci tidak dinilai.` : ''));
    mount(grid, h('div', { class: 'qgrid cols2' }, d.mondai.map(m => [
      h('div', { class: 'mondaihead' }, `Mondai ${m.no} (soal ${m.dari}-${m.sampai})`),
      m.soal.map(no => h('div', { class: 'q' + (state.kunci[no] == null ? ' kosongkunci' : ''), 'data-no': no },
        h('div', { class: 'no' }, no),
        h('div', { class: 'opts' }, labels.map((lb, i) => h('button', {
          class: 'opt' + (state.kunci[no] === i + 1 ? ' on' : ''), 'aria-label': `Soal ${no} kunci ${lb}`, 'aria-pressed': String(state.kunci[no] === i + 1),
          onclick: () => { state.kunci[no] = state.kunci[no] === i + 1 ? null : i + 1; delete state.catatan[no]; renderGrid(); },
        }, lb))),
        h('div', { class: 'info' }, state.catatan[no] ? h('span', { class: 'badge warn', title: state.catatan[no] }, 'cek') : ''))),
    ])));
  };

  const terapkan = (jawaban, cat, sumber) => {
    let n = 0;
    for (const s of d.soal) {
      const v = jawaban[s.no];
      state.kunci[s.no] = v ?? null;
      if (v != null) n++;
    }
    state.catatan = { ...cat };
    renderGrid();
    toast(`${n} dari ${d.jumlahSoal} nomor terbaca dari ${sumber}. Periksa sebelum menyimpan.`, n === d.jumlahSoal ? 'ok' : 'info', 5000);
  };

  const sibuk = (pesan) => mount(status, h('div', { class: 'busy' }, h('div', { class: 'spinner' }), pesan));

  const dariClaude = async () => {
    const f = await pilihFile('image/*');
    if (!f) return;
    sibuk('Mengirim gambar kunci ke Claude API dan menunggu hasil...');
    try {
      const img = await fileToImage(f, 2000);
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
      const r = await bacaKunciClaude(await blobToBase64(blob), 'image/jpeg', d.soal.map(s => s.no), template.opsi);
      mount(status, h('div', { class: 'small muted' }, `Ringkasan model: ${r.ringkasan}`));
      terapkan(r.jawaban, r.catatan || {}, 'gambar (Claude)');
    } catch (e) {
      mount(status, h('div', { class: 'banner bad small' }, `Gagal membaca kunci: ${e.message}. Isi kunci secara manual di bawah.`));
    }
  };

  const dariLembar = async () => {
    const f = await pilihFile('image/*', { capture: 'environment' });
    if (!f) return;
    sibuk('Membaca bulatan di perangkat...');
    try {
      const r = await bacaLembar(await fileToImage(f), template);
      if (!r.ok) { mount(status, h('div', { class: 'banner bad small' }, r.petunjuk)); return; }
      const jaw = {}, cat = {};
      for (const [no, b] of Object.entries(r.jawaban)) {
        if (b.status === 'jelas') jaw[no] = b.pilihan;
        else if (b.status !== 'kosong') cat[no] = `Bulatan ${b.status === 'ganda' ? 'ganda' : 'tidak jelas'}`;
      }
      mount(status, '');
      terapkan(jaw, cat, 'lembar jawaban (lokal)');
    } catch (e) {
      mount(status, h('div', { class: 'banner bad small' }, `Gagal: ${e.message}`));
    }
  };

  const bobotEl = h('details', { class: 'card' }, h('summary', null, h('b', null, 'Bobot soal'), h('span', { class: 'muted small' }, ' (default 1 per soal)')),
    h('p', { class: 'small muted' }, 'Ubah bila ada soal yang nilainya berbeda. Bobot 0 = tidak dihitung.'),
    h('div', { class: 'qgrid cols2' }, d.soal.map(s => h('label', { class: 'q' }, h('span', { class: 'no' }, s.no),
      h('input', { type: 'number', min: 0, step: 0.5, value: state.bobot[s.no] ?? 1, oninput: e => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) state.bobot[s.no] = v; else delete state.bobot[s.no]; } }), h('span')))));

  renderGrid();
  const el = h('div', null,
    h('div', { class: 'card stack' },
      h('b', null, 'Isi kunci jawaban'),
      app.status.claude
        ? [h('button', { class: 'btn btn-block', onclick: dariClaude }, 'Baca gambar kunci (Claude)'),
           h('div', { class: 'datakeluar' }, 'Data keluar perangkat: gambar kunci dikirim ke Claude API (Anthropic) lewat server lokal.')]
        : h('div', { class: 'small muted' }, `Membaca gambar kunci dengan Claude tidak tersedia: ${app.status.alasan || 'API key tidak ada'}.`),
      h('button', { class: 'btn btn-block', onclick: dariLembar }, 'Baca lembar jawaban berisi kunci (di perangkat)'),
      h('div', { class: 'small muted' }, 'Atau ketuk jawaban langsung pada tabel di bawah. Ketuk lagi untuk mengosongkan.'),
      status),
    info, grid, bobotEl);
  return { el, get: () => ({ kunci: { ...state.kunci }, bobot: { ...state.bobot } }), kosong: () => d.soal.filter(s => state.kunci[s.no] == null).map(s => s.no) };
}
