import { h, mount, toast, konfirmasi, back } from '../dom.js';
import * as M from '../../lib/model.js';
import { editorKunci } from './kunci.js';
import { clampPct } from './paket.js';

export async function viewSesiBaru(root) {
  const st = { kelas: null, paket: null, paketBaru: false };
  const [kelas, paket, tpls] = await Promise.all([M.semuaKelas(), M.semuaPaket(), M.semuaTemplate()]);

  const langkah = n => h('div', { class: 'steps' }, ['1 Kelas', '2 Paket', '3 Kunci'].map((s, i) => h('span', { class: i + 1 === n ? 'on' : '' }, s)));

  const step1 = () => {
    if (!kelas.length) {
      mount(root, back('#/'), h('h1', null, 'Sesi baru'), h('div', { class: 'banner warn' }, 'Belum ada kelas. ', h('a', { href: '#/kelas/baru' }, 'Buat kelas dulu')));
      return;
    }
    mount(root, back('#/'), h('h1', null, 'Sesi baru'), langkah(1), h('h2', null, 'Pilih kelas'),
      h('div', { class: 'stack' }, kelas.map(k => h('button', { class: 'btn btn-block cand', onclick: () => { st.kelas = k; step2(); } },
        h('span', null, k.nama), h('span', { class: 'muted small' }, `${k.siswa.length} siswa`)))));
  };

  const step2 = () => {
    const nama = h('input', { type: 'text', placeholder: 'mis. Try-out N4 Moji-Goi #3' });
    const tsel = h('select', null, tpls.map(t => h('option', { value: t.id }, t.nama)));
    const lulus = h('input', { type: 'number', min: 0, max: 100, value: 60 });
    mount(root, h('a', { class: 'back', href: '#/sesi/baru', onclick: e => { e.preventDefault(); step1(); } }, '‹ Kembali'),
      h('h1', null, 'Sesi baru'), langkah(2), h('p', { class: 'muted' }, `Kelas: ${st.kelas.nama}`),
      paket.length ? [h('h2', null, 'Pakai paket yang ada'),
        h('div', { class: 'stack' }, paket.map(p => h('button', { class: 'btn btn-block cand', onclick: () => { st.paket = structuredClone(p); st.paketBaru = false; step3(); } },
          h('span', null, p.nama), h('span', { class: 'muted small' }, `${Object.values(p.kunci).filter(v => v != null).length}/${Object.keys(p.kunci).length} kunci`))))] : null,
      h('h2', null, 'Atau buat paket baru'),
      h('div', { class: 'card' },
        h('label', { class: 'field' }, h('span', null, 'Nama paket'), nama),
        h('label', { class: 'field' }, h('span', null, 'Lembar jawaban'), tsel),
        h('label', { class: 'field' }, h('span', null, 'Batas lulus (%)'), lulus),
        h('button', { class: 'btn btn-primary btn-block', onclick: async () => {
          if (!nama.value.trim()) return toast('Nama paket wajib diisi', 'bad');
          const t = tpls.find(x => x.id === tsel.value);
          st.paket = await M.paketBaru({ nama: nama.value.trim(), template: t, batasLulus: clampPct(lulus.value, 60) });
          st.paketBaru = true; step3();
        } }, 'Lanjut ke kunci')));
  };

  const step3 = async () => {
    const tpl = await M.getTemplate(st.paket.templateId);
    const ed = editorKunci({ template: tpl, kunci: st.paket.kunci, bobot: st.paket.bobot });
    const tgl = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
    const kePaket = h('input', { type: 'checkbox', checked: true });
    mount(root, h('a', { class: 'back', href: '#/sesi/baru', onclick: e => { e.preventDefault(); step2(); } }, '‹ Kembali'),
      h('h1', null, 'Sesi baru'), langkah(3),
      h('p', { class: 'muted' }, `${st.kelas.nama} · ${st.paket.nama}`),
      h('label', { class: 'field' }, h('span', null, 'Tanggal try-out'), tgl),
      ed.el,
      !st.paketBaru && h('label', { class: 'row small' }, kePaket, 'Simpan perubahan kunci ke paket juga'),
      h('button', { class: 'btn btn-primary btn-big btn-block', onclick: async () => {
        const kosong = ed.kosong();
        if (kosong.length && !(await konfirmasi('Ada soal tanpa kunci', `${kosong.length} soal belum berkunci (${kosong.join(', ')}). Soal itu tidak dinilai. Tetap mulai sesi?`, 'Mulai sesi'))) return;
        const { kunci, bobot } = ed.get();
        const p = { ...st.paket, kunci, bobot };
        if (st.paketBaru || kePaket.checked) await M.simpanPaket(p);
        const s = await M.sesiBaru({ paket: p, kelas: st.kelas, tanggal: tgl.value });
        toast('Sesi aktif. Kunci tersimpan di sesi.', 'ok');
        location.hash = `#/sesi/${s.id}/pindai`;
      } }, 'Simpan kunci dan mulai pindai'));
  };

  step1();
}
