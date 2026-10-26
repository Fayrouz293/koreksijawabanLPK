// Panel nama: baca kotak nama (Claude, opsional), cocokkan ke daftar kelas, konfirmasi guru.
import { h, mount, dialog, toast } from '../dom.js';
import { matchName, hasKana } from '../../lib/namematch.js';
import { bacaNamaClaude } from '../../lib/api.js';
import { imageToCanvas, imageToBlob, blobToBase64 } from '../../lib/images.js';
import * as M from '../../lib/model.js';
import { app } from '../../main.js';

/**
 * @param p.kelas   objek kelas (daftar siswa)
 * @param p.sesi
 * @param p.kotakNama ImageData potongan kotak nama | null
 * @param p.terpilih  {siswaId} bila mengubah hasil lama
 * @param p.kecualiHasilId id hasil yang sedang diubah (abaikan saat cek ganda)
 * @param p.onUbah  dipanggil dengan {siswa, timpaId} atau null
 */
export function panelNama({ kelas, sesi, kotakNama, fotoNama, namaTerpotong, terpilih, kecualiHasilId, onUbah }) {
  const st = { siswa: terpilih ? kelas.siswa.find(s => s.id === terpilih.siswaId) || { id: terpilih.siswaId, nama: terpilih.nama } : null, timpaId: null, bacaan: null, cocok: null, sedang: false, galat: null };
  const box = h('div', { class: 'card stack' });

  const konfirmasiSiswa = async (s) => {
    const lama = await M.cariHasilSiswaDiSesi(sesi.id, s.id, kecualiHasilId);
    let timpaId = null;
    if (lama) {
      const ok = await dialog({ judul: 'Siswa sudah dipindai', isi: `${s.nama} sudah punya hasil di sesi ini (${lama.nilai?.persen ?? '?'}%). Timpa hasil lama dengan lembar ini?`,
        tombol: [{ label: 'Batal', nilai: false }, { label: 'Timpa', nilai: true, bahaya: true }] });
      if (!ok) return;
      timpaId = lama.id;
    }
    st.siswa = s; st.timpaId = timpaId;
    onUbah?.({ siswa: s, timpaId, namaTerbaca: st.bacaan });
    render();
  };

  const tambahBaru = async (saran) => {
    const inp = h('input', { type: 'text', value: saran || '' });
    const ok = await dialog({ judul: 'Tambah siswa baru ke kelas', isi: h('label', { class: 'field' }, h('span', null, 'Nama'), inp), tombol: [{ label: 'Batal', nilai: false }, { label: 'Tambah', nilai: true, utama: true }] });
    if (!ok || !inp.value.trim()) return;
    const nm = inp.value.trim();
    const baru = { id: M.db.uid(), nama: nm, katakana: hasKana(nm) ? nm : '', nis: '' };
    kelas.siswa.push(baru);
    await M.simpanKelas(kelas);
    toast(`${nm} ditambahkan ke ${kelas.nama}`, 'ok');
    await konfirmasiSiswa(baru);
  };

  const daftarManual = () => {
    const cari = h('input', { type: 'search', placeholder: 'Cari nama siswa...' });
    const list = h('div', { class: 'cands' });
    const isi = () => {
      const q = cari.value.toLowerCase();
      mount(list, [...kelas.siswa].sort((a, b) => a.nama.localeCompare(b.nama))
        .filter(s => !q || s.nama.toLowerCase().includes(q) || (s.katakana || '').includes(cari.value))
        .slice(0, 50).map(s => h('button', { class: 'btn btn-sm cand', onclick: () => konfirmasiSiswa(s) }, s.nama, s.katakana ? h('span', { class: 'muted small' }, s.katakana) : '')));
    };
    cari.addEventListener('input', isi); isi();
    return h('details', { open: !st.cocok || st.cocok.status === 'tidak_cocok' }, h('summary', null, 'Pilih dari daftar kelas'), cari, list,
      h('button', { class: 'btn btn-sm', onclick: () => tambahBaru(st.bacaan?.latin || st.bacaan?.teks_asli) }, 'Tambah siswa baru'));
  };

  const render = () => {
    const crop = kotakNama ? imageToCanvas(kotakNama) : fotoNama ? h('img', { src: URL.createObjectURL(fotoNama), alt: 'Kotak nama' }) : null;
    if (crop) crop.className = 'namecrop';
    if (st.siswa) {
      mount(box, h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', { class: 'small muted' }, 'Nama siswa (dikonfirmasi)'), h('b', { style: { fontSize: '1.15rem' } }, st.siswa.nama),
        st.timpaId && h('div', { class: 'badge warn' }, 'Akan menimpa hasil lama')),
        h('button', { class: 'btn btn-sm', onclick: () => { st.siswa = null; st.timpaId = null; onUbah?.(null); render(); } }, 'Ganti')), crop);
      return;
    }
    const isi = [h('b', null, 'Nama siswa: belum dikonfirmasi'), crop || h('div', { class: 'small muted' }, 'Potongan kotak nama tidak tersedia.'),
      namaTerpotong && h('div', { class: 'small muted' }, 'Kotak nama terpotong di foto; sebagian tulisan mungkin tidak terbaca.')];
    if (st.sedang) isi.push(h('div', { class: 'busy' }, h('div', { class: 'spinner' }), 'Claude membaca kotak nama...'), h('div', { class: 'datakeluar' }, 'Data keluar perangkat: hanya potongan kotak nama dikirim ke Claude API.'));
    if (st.galat) isi.push(h('div', { class: 'banner warn small' }, `Nama tidak terbaca otomatis: ${st.galat}. Pilih manual.`));
    if (st.bacaan) isi.push(h('div', { class: 'small' }, 'Terbaca: ', h('b', null, st.bacaan.teks_asli || '-'), st.bacaan.latin && st.bacaan.latin !== st.bacaan.teks_asli ? ` (${st.bacaan.latin})` : ''));
    if (st.cocok) {
      const c = st.cocok;
      if (c.status === 'kuat') {
        const s = kelas.siswa.find(x => x.id === c.kandidat[0].id);
        isi.push(h('button', { class: 'btn btn-primary btn-big btn-block', onclick: () => konfirmasiSiswa(s) }, `Benar: ${s.nama}`),
          h('div', { class: 'small muted' }, `Kecocokan ${Math.round(c.kandidat[0].skor * 100)}%. Ketuk untuk konfirmasi, atau pilih nama lain di bawah.`));
      } else if (c.status === 'lemah') {
        isi.push(h('div', { class: 'small' }, 'Beberapa kemungkinan; pilih yang benar:'),
          h('div', { class: 'cands' }, c.kandidat.map(k => h('button', { class: 'btn cand', onclick: () => konfirmasiSiswa(kelas.siswa.find(x => x.id === k.id)) }, k.nama, h('span', { class: 'muted small' }, `${Math.round(k.skor * 100)}%`)))));
      } else {
        isi.push(h('div', { class: 'banner warn small' }, 'Tidak ada nama yang cocok di daftar kelas.'),
          h('button', { class: 'btn btn-block', onclick: () => tambahBaru(st.bacaan?.latin || st.bacaan?.teks_asli) }, 'Tambah sebagai siswa baru'));
      }
    }
    isi.push(daftarManual());
    mount(box, isi);
  };

  const baca = async () => {
    if (!kotakNama || !app.status.claude || !app.pakaiClaudeNama || st.siswa) return;
    st.sedang = true; render();
    try {
      const r = await bacaNamaClaude(await blobToBase64(await imageToBlob(kotakNama, 0.85)), 'image/jpeg');
      st.bacaan = r;
      if (!r.terbaca) st.galat = 'kotak nama kosong atau tidak terbaca';
      else st.cocok = matchName({ latin: r.latin, kana: r.kana || (hasKana(r.teks_asli) ? r.teks_asli : '') }, kelas.siswa);
    } catch (e) { st.galat = e.message; }
    st.sedang = false; render();
  };

  render();
  baca();
  return { el: box, get: () => ({ siswa: st.siswa, timpaId: st.timpaId, namaTerbaca: st.bacaan }) };
}
