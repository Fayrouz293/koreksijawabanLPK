import { h, mount, toast, konfirmasi, back, formatTanggal } from '../dom.js';
import * as M from '../../lib/model.js';
import { describe } from '../../lib/template.js';
import { editorKunci } from './kunci.js';

export async function viewDaftarPaket(root) {
  const [paket, sesi] = await Promise.all([M.semuaPaket(), M.semuaSesi()]);
  const tpls = await M.semuaTemplate();
  const namaT = id => tpls.find(t => t.id === id)?.nama || id;
  mount(root,
    h('h1', null, 'Paket soal'),
    h('p', { class: 'small muted' }, 'Paket = template lembar + kunci + bobot + batas lulus. Dipakai ulang di banyak sesi. Paket baru dibuat saat memulai sesi baru.'),
    paket.length
      ? h('ul', { class: 'list card' }, paket.map(p => {
          const isi = Object.values(p.kunci).filter(v => v != null).length;
          const n = Object.keys(p.kunci).length;
          return h('li', null,
            h('div', { class: 'grow' }, h('b', null, p.nama),
              h('div', { class: 'small muted' }, `${namaT(p.templateId)} · kunci ${isi}/${n} · lulus ${p.batasLulus}% · ${sesi.filter(s => s.paketId === p.id).length} sesi · ${formatTanggal(p.diubah)}`)),
            h('a', { class: 'btn btn-sm', href: `#/paket/${p.id}` }, 'Ubah'),
            h('button', { class: 'btn btn-sm', onclick: async () => { const c = await M.duplikatPaket(p); toast('Paket diduplikasi', 'ok'); location.hash = `#/paket/${c.id}`; } }, 'Duplikat'));
        }))
      : h('p', { class: 'muted' }, 'Belum ada paket.'),
    h('a', { class: 'btn btn-primary btn-block', href: '#/sesi/baru' }, 'Sesi baru (buat paket)'));
}

export async function viewPaket(root, id) {
  const p = await M.getPaket(id);
  if (!p) { location.hash = '#/paket'; return; }
  const tpl = await M.getTemplate(p.templateId);
  if (!tpl) { mount(root, h('div', { class: 'banner bad' }, `Template ${p.templateId} tidak ditemukan.`)); return; }
  const nama = h('input', { type: 'text', value: p.nama });
  const lulus = h('input', { type: 'number', min: 0, max: 100, value: p.batasLulus });
  const ed = editorKunci({ template: tpl, kunci: p.kunci, bobot: p.bobot });
  const d = describe(tpl);
  mount(root,
    back('#/paket'),
    h('h1', null, 'Ubah paket'),
    h('div', { class: 'card' },
      h('label', { class: 'field' }, h('span', null, 'Nama paket'), nama),
      h('label', { class: 'field' }, h('span', null, 'Batas lulus (%)'), lulus),
      h('div', { class: 'small muted' }, `Template: ${tpl.nama} · ${d.jumlahSoal} soal · mondai ${d.mondai.map(m => `${m.no} (${m.dari}-${m.sampai})`).join(', ')}`),
      h('div', { class: 'small muted' }, 'Mengubah paket tidak mengubah sesi yang sudah dibuat; tiap sesi menyimpan salinan kuncinya sendiri.')),
    ed.el,
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary grow', onclick: async () => {
        const { kunci, bobot } = ed.get();
        await M.simpanPaket({ ...p, nama: nama.value.trim() || p.nama, batasLulus: clampPct(lulus.value, p.batasLulus), kunci, bobot });
        toast('Paket tersimpan', 'ok'); location.hash = '#/paket';
      } }, 'Simpan paket'),
      h('button', { class: 'btn btn-danger', onclick: async () => {
        if (!(await konfirmasi('Hapus paket?', 'Sesi yang memakai paket ini tetap tersimpan (punya salinan kunci).', 'Hapus', true))) return;
        await M.hapusPaket(id); location.hash = '#/paket';
      } }, 'Hapus')));
}

export function clampPct(v, def) { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : def; }
