import { h, mount, toast, konfirmasi, pilihFile, back, dialog } from '../dom.js';
import * as M from '../../lib/model.js';
import { parseClassList } from '../../lib/csv.js';

export async function viewDaftarKelas(root) {
  const kelas = await M.semuaKelas();
  mount(root,
    h('h1', null, 'Kelas'),
    h('a', { class: 'btn btn-primary btn-block', href: '#/kelas/baru' }, 'Tambah kelas'),
    kelas.length
      ? h('ul', { class: 'list card' }, kelas.map(k => h('li', null,
          h('div', { class: 'grow' }, h('b', null, k.nama), h('div', { class: 'small muted' }, `${k.siswa.length} siswa`)),
          h('a', { class: 'btn btn-sm', href: `#/kelas/${k.id}` }, 'Buka'))))
      : h('p', { class: 'muted' }, 'Belum ada kelas.'));
}

/** Formulir impor daftar siswa (CSV / tempel dari Sheets) dengan pratinjau. */
function formImpor(onHasil) {
  const ta = h('textarea', { placeholder: 'Tempel dari Google Sheets atau Excel (satu siswa per baris).\nKolom: Nama, Katakana (opsional), NIS (opsional)\nContoh:\nNurul Aini\tヌルル アイニ\t2024001' });
  const prev = h('div');
  const tampil = () => {
    const r = parseClassList(ta.value);
    onHasil(r);
    mount(prev,
      r.peringatan.length && h('div', { class: 'banner warn small' }, r.peringatan.map(p => h('div', null, p))),
      r.siswa.length && h('div', { class: 'small muted' }, `${r.siswa.length} siswa terbaca:`),
      r.siswa.length && h('div', { class: 'tablewrap' }, h('table', { class: 'data' },
        h('tr', null, h('th', null, '#'), h('th', null, 'Nama'), h('th', null, 'Katakana'), h('th', null, 'NIS')),
        r.siswa.slice(0, 60).map((s, i) => h('tr', null, h('td', null, i + 1), h('td', null, s.nama), h('td', null, s.katakana || '-'), h('td', null, s.nis || '-'))))));
  };
  ta.addEventListener('input', tampil);
  return h('div', null,
    h('label', { class: 'field' }, h('span', null, 'Daftar siswa'), ta),
    h('button', { class: 'btn', type: 'button', onclick: async () => { const f = await pilihFile('.csv,.tsv,.txt,text/csv,text/plain'); if (f) { ta.value = await f.text(); tampil(); } } }, 'Pilih file CSV'),
    prev);
}

export async function viewKelasBaru(root) {
  let hasil = { siswa: [] };
  const nama = h('input', { type: 'text', placeholder: 'mis. Kelas N4 Angkatan 12' });
  mount(root,
    back('#/kelas'),
    h('h1', null, 'Kelas baru'),
    h('div', { class: 'card' },
      h('label', { class: 'field' }, h('span', null, 'Nama kelas'), nama),
      formImpor(r => { hasil = r; }),
      h('button', {
        class: 'btn btn-primary btn-block', onclick: async () => {
          if (!nama.value.trim()) return toast('Nama kelas wajib diisi', 'bad');
          const k = await M.simpanKelas({ nama: nama.value.trim(), siswa: hasil.siswa });
          toast(`Kelas tersimpan: ${k.siswa.length} siswa`, 'ok');
          location.hash = `#/kelas/${k.id}`;
        },
      }, 'Simpan kelas')));
}

export async function viewKelas(root, id) {
  const k = await M.getKelas(id);
  if (!k) { location.hash = '#/kelas'; return; }
  const nama = h('input', { type: 'text', value: k.nama });
  const simpan = async (pesan = 'Tersimpan') => { k.nama = nama.value.trim() || k.nama; await M.simpanKelas(k); toast(pesan, 'ok'); };
  const urut = [...k.siswa].sort((a, b) => a.nama.localeCompare(b.nama));

  const edit = async (s) => {
    const fn = h('input', { type: 'text', value: s?.nama || '' });
    const fk = h('input', { type: 'text', value: s?.katakana || '', placeholder: 'opsional' });
    const fs = h('input', { type: 'text', value: s?.nis || '', placeholder: 'opsional' });
    const ok = await dialog({ judul: s ? 'Ubah siswa' : 'Tambah siswa', isi: h('div', null,
      h('label', { class: 'field' }, h('span', null, 'Nama (latin)'), fn),
      h('label', { class: 'field' }, h('span', null, 'Katakana'), fk),
      h('label', { class: 'field' }, h('span', null, 'NIS'), fs)),
      tombol: [{ label: 'Batal', nilai: false }, { label: 'Simpan', nilai: true, utama: true }] });
    if (!ok || !fn.value.trim()) return;
    if (s) Object.assign(s, { nama: fn.value.trim(), katakana: fk.value.trim(), nis: fs.value.trim() });
    else k.siswa.push({ nama: fn.value.trim(), katakana: fk.value.trim(), nis: fs.value.trim() });
    await simpan(); viewKelas(root, id);
  };

  let tambahan = { siswa: [] };
  mount(root,
    back('#/kelas'),
    h('h1', null, k.nama),
    h('div', { class: 'card' },
      h('label', { class: 'field' }, h('span', null, 'Nama kelas'), nama),
      h('button', { class: 'btn', onclick: () => simpan() }, 'Simpan nama')),
    h('div', { class: 'row' }, h('h2', { class: 'grow' }, `Siswa (${k.siswa.length})`), h('button', { class: 'btn btn-primary btn-sm', onclick: () => edit(null) }, 'Tambah siswa')),
    h('ul', { class: 'list card' }, urut.map(s => h('li', null,
      h('div', { class: 'grow' }, h('b', null, s.nama), h('div', { class: 'small muted' }, [s.katakana, s.nis && `NIS ${s.nis}`].filter(Boolean).join(' · ') || '-')),
      h('a', { class: 'btn btn-sm', href: `#/kelas/${k.id}/siswa/${s.id}` }, 'Riwayat'),
      h('button', { class: 'btn btn-sm', onclick: () => edit(s) }, 'Ubah'),
      h('button', { class: 'btn btn-sm btn-danger', onclick: async () => {
        if (!(await konfirmasi('Hapus siswa?', `${s.nama} dihapus dari daftar kelas. Hasil sesi lama tetap tersimpan.`, 'Hapus', true))) return;
        k.siswa = k.siswa.filter(x => x.id !== s.id); await simpan('Siswa dihapus'); viewKelas(root, id);
      } }, 'Hapus')))),
    h('details', { class: 'card' }, h('summary', null, h('b', null, 'Tambah banyak siswa (impor)')),
      formImpor(r => { tambahan = r; }),
      h('button', { class: 'btn btn-primary btn-block', onclick: async () => {
        const ada = new Set(k.siswa.map(s => s.nama.toLowerCase()));
        const baru = tambahan.siswa.filter(s => !ada.has(s.nama.toLowerCase()));
        k.siswa.push(...baru); await simpan(`${baru.length} siswa ditambahkan (${tambahan.siswa.length - baru.length} sudah ada)`); viewKelas(root, id);
      } }, 'Tambahkan ke kelas')),
    h('h2', null, 'Zona bahaya'),
    h('button', { class: 'btn btn-danger', onclick: async () => {
      if (!(await konfirmasi('Hapus kelas?', 'Kelas dan daftar siswanya dihapus. Sesi dan hasil lama tetap ada.', 'Hapus kelas', true))) return;
      await M.hapusKelas(id); location.hash = '#/kelas';
    } }, 'Hapus kelas'));
}
