import { h, mount, toast, konfirmasi, back, formatTanggal, unduh } from '../dom.js';
import * as M from '../../lib/model.js';
import { rekapSesi } from '../../lib/grading.js';
import { toCSV, toTSV } from '../../lib/csv.js';
import { editorKunci } from './kunci.js';
import { clampPct } from './paket.js';

export async function viewDaftarSesi(root) {
  const sesi = await M.semuaSesi();
  const n = await Promise.all(sesi.map(async s => (await M.hasilSesi(s.id)).length));
  mount(root,
    h('h1', null, 'Sesi'),
    h('a', { class: 'btn btn-primary btn-block', href: '#/sesi/baru' }, 'Sesi baru'),
    sesi.length
      ? h('ul', { class: 'list card' }, sesi.map((s, i) => h('li', null,
          h('div', { class: 'grow' }, h('b', null, s.namaPaket), ' ', h('span', { class: 'badge ' + (s.status === 'aktif' ? 'ok' : '') }, s.status),
            h('div', { class: 'small muted' }, `${s.namaKelas} · ${formatTanggal(s.tanggal)} · ${n[i]} lembar`)),
          h('a', { class: 'btn btn-sm', href: `#/sesi/${s.id}` }, 'Buka'))))
      : h('p', { class: 'muted' }, 'Belum ada sesi.'));
}

/** Baris tabel rekap (dipakai tampilan, CSV, dan salin ke Sheets). */
export function barisRekap(sesi, hasil, kelas) {
  const nis = Object.fromEntries((kelas?.siswa || []).map(s => [s.id, s.nis || '']));
  const nomor = Object.keys(sesi.kunci).map(Number).sort((a, b) => a - b);
  const head = ['Nama', 'NIS', 'Skor', 'Maks', 'Persen', 'Lulus', ...sesi.mondai.map(m => `Mondai ${m.no}`), 'Soal salah', ...nomor.map(n => `J${n}`)];
  const rows = hasil.map(x => [x.namaSiswa, nis[x.siswaId] || '', x.nilai.skor, x.nilai.skorMaks, x.nilai.persen, x.nilai.lulus ? 'Lulus' : 'Tidak',
    ...x.nilai.perMondai.map(m => `${m.skor}/${m.maks}`), x.nilai.salah.join(' '), ...nomor.map(n => x.jawaban[n] ?? '')]);
  return [head, ...rows];
}

export async function viewSesi(root, id) {
  const sesi = await M.getSesi(id);
  if (!sesi) { location.hash = '#/sesi'; return; }
  const kelas = await M.getKelas(sesi.kelasId);
  const hasil = (await M.hasilSesi(id)).sort((a, b) => a.namaSiswa.localeCompare(b.namaSiswa));
  const rk = rekapSesi(hasil.map(x => ({ nama: x.namaSiswa, nilai: x.nilai })));
  const sudah = new Set(hasil.map(x => x.siswaId));
  const belum = sesi.otomatis ? [] : (kelas?.siswa || []).filter(s => !sudah.has(s.id));
  const perluCek = hasil.filter(x => x.status === 'otomatis' && (x.perluCek?.length || ['cocok_lemah', 'tanpa_nama', 'ganda_di_sesi'].includes(x.namaStatus)));
  const urlFoto = [];
  const tabel = barisRekap(sesi, hasil, kelas);
  const namaFile = `${sesi.namaPaket}-${sesi.namaKelas}-${sesi.tanggal}`.replace(/[^\w.-]+/g, '_');
  const tanpaKunci = Object.values(sesi.kunci).filter(v => v == null).length;

  mount(root,
    back('#/sesi', 'Daftar sesi'),
    h('h1', null, sesi.namaPaket),
    h('div', { class: 'small muted' }, `${sesi.namaKelas} · ${formatTanggal(sesi.tanggal)} · batas lulus ${sesi.batasLulus}% · `, h('span', { class: 'badge ' + (sesi.status === 'aktif' ? 'ok' : '') }, sesi.status)),
    perluCek.length ? h('div', { class: 'banner warn small' }, `${perluCek.length} lembar disimpan otomatis dengan tanda "perlu cek" (soal ragu atau nama tidak pasti). Pemeriksaan opsional: ketuk Tinjau pada baris bertanda.`) : null,
    tanpaKunci ? h('div', { class: 'banner warn small' }, `${tanpaKunci} soal tanpa kunci (tidak dinilai). `, h('a', { href: `#/sesi/${id}/kunci` }, 'Lengkapi kunci')) : null,
    h('div', { class: 'row', style: { margin: '10px 0' } },
      h('a', { class: 'btn btn-primary grow', href: sesi.otomatis ? `#/scan/${id}` : `#/sesi/${id}/pindai` }, sesi.status === 'aktif' ? 'Lanjut scan' : 'Scan lagi'),
      h('a', { class: 'btn', href: `#/sesi/${id}/kunci` }, 'Ubah kunci'),
      h('button', { class: 'btn', onclick: async () => {
        sesi.status = sesi.status === 'aktif' ? 'selesai' : 'aktif'; await M.simpanSesi(sesi); viewSesi(root, id);
      } }, sesi.status === 'aktif' ? 'Tandai selesai' : 'Aktifkan lagi')),
    h('h2', null, 'Ringkasan'),
    h('div', { class: 'stats' },
      stat('Lembar', sesi.otomatis ? `${rk.jumlah}` : `${rk.jumlah}/${kelas?.siswa.length ?? '?'}`),
      stat('Rata-rata', rk.rataRata != null ? `${rk.rataRata}%` : '-'),
      stat('Tertinggi', rk.tertinggi ? `${rk.tertinggi.persen}%` : '-', rk.tertinggi?.nama.join(', ')),
      stat('Terendah', rk.terendah ? `${rk.terendah.persen}%` : '-', rk.terendah?.nama.join(', ')),
      stat('Lulus', `${rk.lulus}/${rk.jumlah}`)),
    rk.soalSeringSalah.length ? [h('h2', null, 'Soal paling sering salah'),
      h('div', { class: 'card' }, h('table', { class: 'data' }, h('tr', null, h('th', null, 'Soal'), h('th', null, 'Salah'), h('th', null, 'Kunci'), h('th', { style: { width: '40%' } }, '')),
        rk.soalSeringSalah.slice(0, 10).map(s => h('tr', null, h('td', null, s.no), h('td', null, `${s.jumlah} (${s.persen}%)`), h('td', null, sesi.kunci[s.no] ?? '-'), h('td', null, h('div', { class: 'bar' }, h('i', { style: { width: `${s.persen}%` } })))))))] : null,
    h('div', { class: 'row', style: { marginTop: '14px' } }, h('h2', { class: 'grow' }, 'Hasil siswa'),
      h('button', { class: 'btn btn-sm', disabled: !hasil.length, onclick: () => { unduh(`${namaFile}.csv`, toCSV(tabel), 'text/csv;charset=utf-8'); } }, 'Ekspor CSV'),
      h('button', { class: 'btn btn-sm', disabled: !hasil.length, onclick: async () => {
        try { await navigator.clipboard.writeText(toTSV(tabel)); toast('Tabel tersalin. Tempel di Google Sheets.', 'ok'); }
        catch { toast('Gagal menyalin; gunakan Ekspor CSV', 'bad'); }
      } }, 'Salin untuk Sheets')),
    hasil.length
      ? h('div', { class: 'card tablewrap' }, h('table', { class: 'data', id: 'tabel-rekap' },
          h('tr', null, h('th', null, 'Nama'), h('th', null, 'Skor'), h('th', null, '%'), h('th', null, 'Status'), sesi.mondai.map(m => h('th', null, `M${m.no}`)), h('th', null, 'Soal salah'), h('th', null, '')),
          hasil.map(x => h('tr', null,
            h('td', null, h('a', { href: kelas ? `#/kelas/${kelas.id}/siswa/${x.siswaId}` : '#' }, x.namaSiswa),
              x.fotoNama instanceof Blob && ['tanpa_nama', 'cocok_lemah', 'membaca', 'ganda_di_sesi'].includes(x.namaStatus) ? h('img', { class: 'namecrop', alt: 'Kotak nama', src: (urlFoto.push(URL.createObjectURL(x.fotoNama)), urlFoto.at(-1)), style: { maxHeight: '40px', marginTop: '4px' } }) : null,
              x.status === 'otomatis' && (x.perluCek?.length || ['cocok_lemah', 'tanpa_nama', 'ganda_di_sesi'].includes(x.namaStatus)) ? h('div', null, h('span', { class: 'badge warn' }, 'perlu cek')) : null),
            h('td', null, `${x.nilai.skor}/${x.nilai.skorMaks}`), h('td', null, x.nilai.persen),
            h('td', null, h('span', { class: 'badge ' + (x.nilai.lulus ? 'ok' : 'bad') }, x.nilai.lulus ? 'lulus' : 'tidak')),
            x.nilai.perMondai.map(m => h('td', null, `${m.skor}/${m.maks}`)),
            h('td', { class: 'small' }, x.nilai.salah.join(', ') || '-'),
            h('td', null, h('a', { class: 'btn btn-sm', href: `#/hasil/${x.id}` }, 'Tinjau'))))))
      : h('p', { class: 'muted' }, 'Belum ada lembar tersimpan.'),
    belum.length ? [h('h2', null, `Belum dipindai (${belum.length})`), h('p', { class: 'small' }, belum.map(s => s.nama).join(', '))] : null,
    h('h2', null, 'Zona bahaya'),
    h('button', { class: 'btn btn-danger', onclick: async () => {
      if (!(await konfirmasi('Hapus sesi?', `Sesi dan ${hasil.length} hasilnya dihapus permanen.`, 'Hapus sesi', true))) return;
      await M.hapusSesi(id); location.hash = '#/sesi';
    } }, 'Hapus sesi'));
  return () => urlFoto.forEach(u => URL.revokeObjectURL(u));
}

function stat(label, nilai, sub) { return h('div', { class: 'stat' }, h('span', { class: 'small muted' }, label), h('b', null, nilai), sub ? h('span', { class: 'small muted' }, sub) : null); }

export async function viewUbahKunciSesi(root, id) {
  const sesi = await M.getSesi(id);
  const tpl = await M.getTemplate(sesi.templateId);
  const ed = editorKunci({ template: tpl, kunci: sesi.kunci, bobot: sesi.bobot });
  const lulus = h('input', { type: 'number', min: 0, max: 100, value: sesi.batasLulus });
  const kePaket = h('input', { type: 'checkbox' });
  mount(root, back(`#/sesi/${id}`, 'Rekap sesi'), h('h1', null, 'Ubah kunci sesi'),
    h('div', { class: 'banner info small' }, 'Semua hasil di sesi ini dihitung ulang dengan kunci baru. Jawaban siswa tidak berubah.'),
    h('label', { class: 'field' }, h('span', null, 'Batas lulus (%)'), lulus),
    ed.el,
    h('label', { class: 'row small' }, kePaket, 'Simpan juga ke paket (untuk sesi berikutnya)'),
    h('button', { class: 'btn btn-primary btn-big btn-block', onclick: async () => {
      const { kunci, bobot } = ed.get();
      Object.assign(sesi, { kunci, bobot, batasLulus: clampPct(lulus.value, sesi.batasLulus) });
      await M.simpanSesi(sesi);
      await M.hitungUlangSesi(sesi);
      if (kePaket.checked) { const p = await M.getPaket(sesi.paketId); if (p) await M.simpanPaket({ ...p, kunci, bobot, batasLulus: sesi.batasLulus }); }
      toast('Kunci sesi diperbarui, nilai dihitung ulang', 'ok');
      location.hash = `#/sesi/${id}`;
    } }, 'Simpan dan hitung ulang'));
}
