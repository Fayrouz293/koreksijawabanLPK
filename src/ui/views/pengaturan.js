import { h, mount, toast, konfirmasi, unduh, pilihFile, formatTanggal } from '../dom.js';
import { buildBackup, restoreBackup, markBackedUp, daysSinceBackup, validateBackup } from '../../lib/backup.js';
import { setMeta, getMeta, put, del } from '../../lib/db.js';
import { describe, validateTemplate } from '../../lib/template.js';
import { kalibrasiTemplate } from '../../omr-client.js';
import { fileToImage } from '../../lib/images.js';
import * as M from '../../lib/model.js';
import { app } from '../../main.js';
import { getKodeAkses, setKodeAkses } from '../../lib/api.js';

export async function viewPengaturan(root) {
  const [hari, terakhir, tpls, persisten, kuota] = await Promise.all([
    daysSinceBackup(), getMeta('cadanganTerakhir'), M.semuaTemplate(),
    Promise.resolve(navigator.storage?.persisted?.()).catch(() => null),
    Promise.resolve(navigator.storage?.estimate?.()).catch(() => null),
  ]);
  const denganFoto = h('input', { type: 'checkbox', checked: true });
  const kode = h('input', { type: 'text', value: getKodeAkses(), placeholder: 'kosongkan bila server tidak memakai kode', autocomplete: 'off' });
  const pakaiNama = h('input', { type: 'checkbox', checked: app.pakaiClaudeNama, disabled: !app.status.claude, onchange: async e => { await setMeta('pakaiClaudeNama', e.target.checked); app.pakaiClaudeNama = e.target.checked; } });

  mount(root,
    h('h1', null, 'Pengaturan'),
    h('h2', null, 'Claude API dan privasi'),
    h('div', { class: 'card stack small' },
      h('div', null, 'Status: ', h('b', null, app.status.claude ? `aktif (model ${app.status.model})` : `tidak tersedia: ${app.status.alasan || 'API key tidak ada'}`)),
      h('div', null, 'Data yang keluar dari perangkat hanya dua jenis, dan hanya saat Anda memakainya:'),
      h('ul', null,
        h('li', null, 'Gambar kunci jawaban, saat menekan "Baca gambar kunci (Claude)".'),
        h('li', null, 'Potongan kotak nama tiap lembar (bukan seluruh lembar), bila pembacaan nama di bawah aktif.')),
      h('div', null, 'Keduanya dikirim ke server lokal aplikasi, lalu ke Claude API (Anthropic). Pembacaan bulatan, nilai, foto lembar, dan daftar kelas tidak pernah dikirim.'),
      h('label', { class: 'row' }, pakaiNama, 'Baca kotak nama dengan Claude'),
      h('label', { class: 'field' }, h('span', null, 'Kode akses server (bila diminta)'), kode),
      h('button', { class: 'btn btn-sm', onclick: async () => { setKodeAkses(kode.value.trim()); await app.refreshStatus(); viewPengaturan(root); } }, 'Simpan kode dan periksa ulang koneksi')),

    h('h2', null, 'Penyimpanan di perangkat'),
    h('div', { class: 'card small stack' },
      h('div', null, persisten ? 'Browser menandai data aplikasi sebagai persisten (tidak dihapus otomatis).' : 'Browser BELUM menjamin data tidak dihapus otomatis saat penyimpanan penuh atau lama tidak dipakai (terutama Safari/iPhone). Pasang aplikasi ke layar utama dan rutin buat cadangan.'),
      Number.isFinite(kuota?.usage) && Number.isFinite(kuota?.quota) && h('div', { class: 'muted' }, `Terpakai ${(kuota.usage / 1e6).toFixed(1)} MB dari kuota sekitar ${(kuota.quota / 1e6).toFixed(0)} MB.`)),

    h('h2', null, 'Cadangan'),
    h('div', { class: 'card stack' },
      h('div', { class: hari == null || hari > 14 ? 'banner warn small' : 'small muted' }, terakhir ? `Cadangan terakhir: ${formatTanggal(terakhir)} (${hari} hari lalu).` : 'Belum pernah membuat cadangan.'),
      h('label', { class: 'row small' }, denganFoto, 'Sertakan foto lembar (file lebih besar)'),
      h('button', { class: 'btn btn-primary btn-block', onclick: async () => {
        const b = await buildBackup({ denganFoto: denganFoto.checked });
        unduh(`cadangan-koreksi-${M.hariIni()}.json`, JSON.stringify(b), 'application/json');
        await markBackedUp(); toast('File cadangan diunduh. Simpan di Google Drive atau komputer.', 'ok', 5000); viewPengaturan(root);
      } }, 'Ekspor cadangan (JSON)'),
      h('button', { class: 'btn btn-block', onclick: async () => {
        const f = await pilihFile('.json,application/json');
        if (!f) return;
        let obj;
        try { obj = JSON.parse(await f.text()); } catch { return toast('File bukan JSON yang sah', 'bad'); }
        const errs = validateBackup(obj);
        if (errs.length) return toast(errs.join('; '), 'bad', 6000);
        if (!(await konfirmasi('Pulihkan cadangan?', `Semua data di perangkat ini diganti dengan isi cadangan tanggal ${formatTanggal(obj.dibuat)}. Lanjutkan?`, 'Ganti semua data', true))) return;
        try {
          const n = await restoreBackup(obj);
          toast(`Dipulihkan: ${n.kelas} kelas, ${n.paket} paket, ${n.sesi} sesi, ${n.hasil} hasil`, 'ok', 6000);
          location.hash = '#/';
        } catch (e) { toast(`Gagal memulihkan: ${e.message}`, 'bad', 6000); }
      } }, 'Impor cadangan')),

    h('h2', null, 'Template lembar jawaban'),
    h('ul', { class: 'list card' }, tpls.map(t => {
      const d = describe(t);
      return h('li', null, h('div', { class: 'grow' }, h('b', null, t.nama), h('div', { class: 'small muted' },
        `${d.jumlahSoal} soal · mondai ${d.mondai.map(m => `${m.no} (${m.dari}-${m.sampai})`).join(', ')} · ${t.bawaan ? 'bawaan' : 'kalibrasi sendiri'}`)),
        !t.bawaan && h('button', { class: 'btn btn-sm btn-danger', onclick: async () => {
          if (!(await konfirmasi('Hapus template?', `Template "${t.nama}" dihapus. Paket dan sesi yang memakainya tidak bisa memindai lagi sampai template dengan ID yang sama dibuat ulang.`, 'Hapus', true))) return;
          await del('templat', t.id); viewPengaturan(root);
        } }, 'Hapus'));
    })),
    formKalibrasi(root, tpls));
}

function formKalibrasi(root, tpls) {
  const id = h('input', { type: 'text', placeholder: 'mis. n4-choukai' });
  const nama = h('input', { type: 'text', placeholder: 'mis. N4 ちょうかい' });
  const opsi = h('input', { type: 'number', min: 2, max: 6, value: 4 });
  const struktur = h('textarea', { placeholder: 'Satu baris per tabel soal, dari kiri ke kanan. M<n> = judul mondai, a-b = soal.\nContoh:\nM1, 1-9, M2, 10-15, M3, 16-25\nM4, 26-30, M5, 31-35' });
  const out = h('div');
  return h('details', { class: 'card' }, h('summary', null, h('b', null, 'Tambah template dari lembar kosong')),
    h('p', { class: 'small muted' }, 'Untuk lembar bagian lain (bunpou, dokkai, choukai). Foto lembar kosong yang lurus dan terang; aplikasi mengukur posisi bulatan dan baseline tinta.'),
    h('label', { class: 'field' }, h('span', null, 'ID (huruf kecil, tanpa spasi)'), id),
    h('label', { class: 'field' }, h('span', null, 'Nama lembar'), nama),
    h('label', { class: 'field' }, h('span', null, 'Jumlah pilihan per soal'), opsi),
    h('label', { class: 'field' }, h('span', null, 'Struktur tabel'), struktur),
    h('button', { class: 'btn btn-primary btn-block', onclick: async () => {
      const t = { id: id.value.trim(), nama: nama.value.trim(), opsi: Number(opsi.value),
        struktur: struktur.value.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => ({ id: `T${i + 1}`, baris: l.split(/[,;]+/).map(x => x.trim()).filter(Boolean) })) };
      const errs = validateTemplate(t);
      if (M.TEMPLATE_BAWAAN.some(x => x.id === t.id)) errs.push(`ID "${t.id}" dipakai template bawaan`);
      if (errs.length) return mount(out, h('div', { class: 'banner bad small' }, errs.join('; ')));
      if (tpls.some(x => x.id === t.id) && !(await konfirmasi('Ganti template?', `Template "${t.id}" sudah ada. Kalibrasi ulang akan menggantinya; paket yang memakai ID ini ikut memakai hasil baru.`, 'Ganti'))) return;
      const f = await pilihFile('image/*');
      if (!f) return;
      mount(out, h('div', { class: 'busy' }, h('div', { class: 'spinner' }), 'Mengkalibrasi...'));
      try {
        const hasil = await kalibrasiTemplate(await fileToImage(f), t, { sumber: f.name });
        const e2 = validateTemplate(hasil);
        if (e2.length) throw new Error(e2.join('; '));
        await put('templat', hasil);
        toast('Template tersimpan', 'ok'); viewPengaturan(root);
      } catch (e) { mount(out, h('div', { class: 'banner bad small' }, `Kalibrasi gagal: ${e.message}`)); }
    } }, 'Pilih foto lembar kosong dan kalibrasi'), out);
}
