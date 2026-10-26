import { h, mount, formatTanggal } from '../dom.js';
import * as M from '../../lib/model.js';
import { daysSinceBackup, HARI_PENGINGAT } from '../../lib/backup.js';
import { app } from '../../main.js';

export async function bannerCadangan() {
  const [hari, kelas, sesi] = await Promise.all([daysSinceBackup(), M.semuaKelas(), M.semuaSesi()]);
  const adaData = kelas.length || sesi.length;
  if (!adaData) return null;
  if (hari == null || hari > HARI_PENGINGAT) {
    return h('div', { class: 'banner warn' },
      h('b', null, hari == null ? 'Data belum pernah dicadangkan. ' : `Cadangan terakhir ${hari} hari lalu. `),
      'Data hanya tersimpan di perangkat ini; bila browser dibersihkan atau HP hilang, data ikut hilang. ',
      h('a', { href: '#/pengaturan' }, 'Buat cadangan sekarang'));
  }
  return null;
}

export async function viewBeranda(root) {
  const [sesi, kelas] = await Promise.all([M.semuaSesi(), M.semuaKelas()]);
  const aktif = sesi.filter(s => s.status === 'aktif');
  const hitung = await Promise.all(aktif.map(async s => (await M.hasilSesi(s.id)).length));
  const jml = Object.fromEntries(kelas.map(k => [k.id, k.siswa.length]));
  mount(root,
    await bannerCadangan(),
    !app.status.claude && h('div', { class: 'banner info small' },
      h('b', null, 'Mode manual. '), 'Claude API tidak tersedia (', app.status.alasan || 'tanpa API key', '). ',
      'Bulatan tetap dibaca otomatis di perangkat; nama siswa tidak dibaca, lembar diberi nomor dan foto kotak namanya disimpan.'),
    h('h1', null, 'Koreksi try-out'),
    h('a', { class: 'btn btn-primary btn-big btn-block', href: '#/scan', id: 'mulai-scan' }, 'Mulai scan'),
    h('p', { class: 'small muted' }, 'Scan lembar kunci Anda dulu, lalu lembar siswa. Semua dinilai dan disimpan otomatis.'),
    h('a', { class: 'btn btn-block', href: '#/sesi/baru' }, 'Sesi baru dengan kelas & kunci manual'),
    h('h2', null, 'Sesi aktif'),
    aktif.length
      ? h('ul', { class: 'list card' }, aktif.map((s, i) => h('li', null,
          h('div', { class: 'grow' }, h('b', null, s.namaPaket), h('div', { class: 'small muted' }, s.otomatis ? `${formatTanggal(s.tanggal)} · ${hitung[i]} lembar` : `${s.namaKelas} · ${formatTanggal(s.tanggal)} · ${hitung[i]}/${jml[s.kelasId] ?? '?'} lembar`)),
          h('a', { class: 'btn btn-sm', href: `#/sesi/${s.id}` }, 'Rekap'),
          h('a', { class: 'btn btn-sm btn-primary', href: s.otomatis ? `#/scan/${s.id}` : `#/sesi/${s.id}/pindai` }, 'Lanjut scan'))))
      : h('p', { class: 'muted' }, 'Belum ada sesi aktif.'),
  );
}
