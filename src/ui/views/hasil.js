// Ubah hasil yang sudah tersimpan (koreksi jawaban atau ganti nama).
import { h, mount, toast, konfirmasi, back } from '../dom.js';
import * as M from '../../lib/model.js';
import { panelTinjau } from './tinjau.js';
import { panelNama } from './nama.js';

export async function viewHasil(root, id) {
  const hs = await M.getHasil(id);
  if (!hs) { location.hash = '#/sesi'; return; }
  const sesi = await M.getSesi(hs.sesiId);
  const [kelas, tpl] = await Promise.all([M.getKelas(sesi.kelasId), M.getTemplate(sesi.templateId)]);
  const foto = hs.foto ? await createImageBitmap(hs.foto) : null;
  let nama = { siswa: { id: hs.siswaId, nama: hs.namaSiswa }, timpaId: null };
  const pn = panelNama({ kelas: kelas || { siswa: [] }, sesi, kotakNama: null, fotoNama: hs.fotoNama instanceof Blob ? hs.fotoNama : null, terpilih: { siswaId: hs.siswaId, nama: hs.namaSiswa }, kecualiHasilId: hs.id, onUbah: v => { nama = v; } });
  const pt = panelTinjau({ sesi, template: tpl, bacaan: hs.bacaan, koreksi: hs.koreksi, foto, overlay: hs.overlay });
  mount(root,
    back(`#/sesi/${sesi.id}`, 'Rekap sesi'),
    h('h1', null, `Hasil: ${hs.namaSiswa}`),
    pn.el, pt.el,
    h('div', { class: 'card stack' },
      h('button', { class: 'btn btn-primary btn-big btn-block', onclick: async () => {
        const t = pt.get();
        if (!nama) return toast('Konfirmasi nama siswa dulu', 'bad');
        if (t.belum.length) return toast(`Tinjau soal ${t.belum.join(', ')} dulu`, 'bad');
        if (nama.timpaId) await M.hapusHasil(nama.timpaId);
        await M.simpanHasil(sesi, { ...hs, siswaId: nama.siswa.id, namaSiswa: nama.siswa.nama, namaDikonfirmasi: true, koreksi: t.koreksi, jawaban: t.jawaban });
        toast('Perubahan tersimpan', 'ok');
        location.hash = `#/sesi/${sesi.id}`;
      } }, 'Simpan perubahan'),
      h('button', { class: 'btn btn-danger btn-block', onclick: async () => {
        if (!(await konfirmasi('Hapus hasil ini?', `Hasil ${hs.namaSiswa} di sesi ini dihapus permanen.`, 'Hapus', true))) return;
        await M.hapusHasil(hs.id); location.hash = `#/sesi/${sesi.id}`;
      } }, 'Hapus hasil')));
}
