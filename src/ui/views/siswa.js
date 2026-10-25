// Riwayat satu siswa di semua sesi.
import { h, mount, back, formatTanggal } from '../dom.js';
import * as M from '../../lib/model.js';

export async function viewSiswa(root, kelasId, siswaId) {
  const kelas = await M.getKelas(kelasId);
  const s = kelas?.siswa.find(x => x.id === siswaId);
  const hasil = await M.hasilSiswa(siswaId);
  const sesi = Object.fromEntries((await M.semuaSesi()).map(x => [x.id, x]));
  const rows = hasil.map(x => ({ x, s: sesi[x.sesiId] })).filter(r => r.s).sort((a, b) => (a.s.tanggal || '').localeCompare(b.s.tanggal || ''));
  const nama = s?.nama || rows[0]?.x.namaSiswa || 'Siswa';
  mount(root,
    back(`#/kelas/${kelasId}`, kelas?.nama || 'Kelas'),
    h('h1', null, nama),
    s && h('div', { class: 'small muted' }, [s.katakana, s.nis && `NIS ${s.nis}`].filter(Boolean).join(' · ')),
    rows.length
      ? h('div', { class: 'card tablewrap' }, h('table', { class: 'data' },
          h('tr', null, h('th', null, 'Tanggal'), h('th', null, 'Paket'), h('th', null, 'Skor'), h('th', null, '%'), h('th', null, 'Status'), h('th', { style: { width: '30%' } }, ''), h('th', null, '')),
          rows.map(({ x, s: ss }) => h('tr', null,
            h('td', null, formatTanggal(ss.tanggal)), h('td', null, ss.namaPaket), h('td', null, `${x.nilai.skor}/${x.nilai.skorMaks}`), h('td', null, x.nilai.persen),
            h('td', null, h('span', { class: 'badge ' + (x.nilai.lulus ? 'ok' : 'bad') }, x.nilai.lulus ? 'lulus' : 'tidak')),
            h('td', null, h('div', { class: 'bar' }, h('i', { style: { width: `${x.nilai.persen}%` } }))),
            h('td', null, h('a', { class: 'btn btn-sm', href: `#/hasil/${x.id}` }, 'Tinjau'))))))
      : h('p', { class: 'muted' }, 'Belum ada hasil untuk siswa ini.'));
}
