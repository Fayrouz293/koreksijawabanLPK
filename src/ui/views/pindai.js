// Layar pindai beruntun: kamera/unggah -> OMR lokal -> nama -> tinjau -> simpan -> lembar berikutnya.
import { h, mount, toast, konfirmasi, back } from '../dom.js';
import * as M from '../../lib/model.js';
import { bacaLembar } from '../../omr-client.js';
import { fileToImage, bitmapToImage, imageToCanvas, imageToBlob } from '../../lib/images.js';
import { panelTinjau } from './tinjau.js';
import { panelNama } from './nama.js';

export async function viewPindai(root, sesiId) {
  const sesi = await M.getSesi(sesiId);
  if (!sesi) { location.hash = '#/'; return; }
  const [kelas, tpl] = await Promise.all([M.getKelas(sesi.kelasId), M.getTemplate(sesi.templateId)]);
  if (!kelas || !tpl) { mount(root, h('div', { class: 'banner bad' }, 'Kelas atau template sesi ini tidak ditemukan.')); return; }

  let stream = null;
  const antrian = [];
  const head = h('div');
  const body = h('div');

  const updateHead = async () => {
    const n = (await M.hasilSesi(sesi.id)).length;
    mount(head, back(`#/sesi/${sesi.id}`, 'Rekap sesi'),
      h('h1', null, 'Pindai lembar'),
      h('div', { class: 'small muted' }, `${sesi.namaPaket} · ${sesi.namaKelas} · `, h('b', null, `${n}/${kelas.siswa.length} lembar tersimpan`),
        antrian.length ? ` · ${antrian.length} foto menunggu` : ''),
      sesi.status !== 'aktif' && h('div', { class: 'banner warn small' }, 'Sesi ini sudah ditandai selesai. Lembar baru tetap bisa ditambahkan.'));
  };

  const stopKamera = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; };
  const bisaKamera = !!(navigator.mediaDevices?.getUserMedia && window.isSecureContext);

  const layarKamera = async () => {
    await updateHead();
    if (antrian.length) return proses(antrian.shift());
    const video = h('video', { playsinline: true, muted: true, autoplay: true });
    const pesan = h('div');
    const unggah = h('button', { class: 'btn btn-block', onclick: async () => {
      const inp = h('input', { type: 'file', accept: 'image/*', multiple: true, style: { display: 'none' } });
      inp.addEventListener('change', () => { antrian.push(...inp.files); inp.remove(); if (antrian.length) proses(antrian.shift()); });
      document.body.append(inp); inp.click();
    } }, 'Unggah foto (bisa beberapa)');
    const fotoHP = h('button', { class: 'btn btn-primary btn-big btn-block', onclick: async () => {
      const inp = h('input', { type: 'file', accept: 'image/*', capture: 'environment', style: { display: 'none' } });
      inp.addEventListener('change', () => { const f = inp.files?.[0]; inp.remove(); if (f) proses(f); });
      document.body.append(inp); inp.click();
    } }, 'Foto lembar');
    if (bisaKamera) {
      mount(body,
        h('div', { class: 'camera' }, video, h('div', { class: 'guide' }), h('div', { class: 'guide-text' }, 'Lembar mendatar. Seluruh tabel soal dan kotak nama masuk bingkai. Hindari bayangan.')),
        h('div', { class: 'stack', style: { marginTop: '10px' } },
          h('button', { class: 'btn btn-primary btn-big btn-block', id: 'ambil', onclick: async () => {
            if (!video.videoWidth) return toast('Kamera belum siap', 'bad');
            const img = bitmapToImage(video, 2600);
            proses(img);
          } }, 'Ambil foto'),
          unggah, pesan));
      try {
        stream ??= await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 3264 }, height: { ideal: 2448 } }, audio: false });
        video.srcObject = stream;
      } catch (e) {
        mount(pesan, h('div', { class: 'banner warn small' }, `Kamera langsung tidak bisa dibuka (${e.message}). Pakai "Foto lembar".`), fotoHP);
      }
    } else {
      mount(body, h('div', { class: 'stack' },
        h('div', { class: 'card small' }, h('b', null, 'Panduan foto: '), 'lembar mendatar di alas gelap/polos, seluruh tabel soal dan kotak nama masuk, cahaya rata tanpa bayangan tangan, HP sejajar kertas.'),
        fotoHP, unggah,
        h('div', { class: 'small muted' }, 'Kamera langsung di dalam aplikasi butuh HTTPS atau localhost; tombol di atas membuka kamera HP.')));
    }
  };

  const proses = async (sumber) => {
    stopKamera();
    mount(body, h('div', { class: 'card busy' }, h('div', { class: 'spinner' }), 'Membaca bulatan di perangkat (tidak ada data yang dikirim)...'));
    let r;
    try {
      const img = sumber instanceof Blob ? await fileToImage(sumber) : sumber;
      r = await bacaLembar(img, tpl);
    } catch (e) {
      r = { ok: false, petunjuk: `Gagal memproses foto: ${e.message}` };
    }
    if (!r.ok) {
      mount(body, h('div', { class: 'banner bad' }, h('b', null, 'Foto ditolak. '), r.petunjuk),
        r.kualitas && h('div', { class: 'small muted' }, `Kecerahan ${r.kualitas.kecerahan}, ketajaman ${r.kualitas.ketajaman}`),
        h('button', { class: 'btn btn-primary btn-big btn-block', onclick: layarKamera }, antrian.length ? 'Foto berikutnya' : 'Foto ulang'));
      return;
    }
    tinjau(r);
  };

  const tinjau = (r) => {
    const foto = imageToCanvas(r.gambarLurus);
    let nama = null;
    const simpanBtn = h('button', { class: 'btn btn-primary btn-big btn-block' }, 'Simpan dan lembar berikutnya');
    const alasan = h('div', { class: 'small muted' });
    const pn = panelNama({ kelas, sesi, kotakNama: r.kotakNama, namaTerpotong: r.namaTerpotong, onUbah: v => { nama = v; cek(); } });
    const pt = panelTinjau({ sesi, template: tpl, bacaan: r.jawaban, foto, overlay: r.overlay, onChange: () => cek() });
    const cek = () => {
      const { belum } = pt.get();
      const msg = [];
      if (!nama) msg.push('konfirmasi nama siswa');
      if (belum.length) msg.push(`tinjau soal ${belum.join(', ')}`);
      simpanBtn.disabled = msg.length > 0;
      alasan.textContent = msg.length ? `Sebelum menyimpan: ${msg.join('; ')}.` : '';
    };
    simpanBtn.onclick = async () => {
      const t = pt.get();
      if (!nama || t.belum.length) return cek();
      simpanBtn.disabled = true;
      try {
        const saved = await M.simpanHasil(sesi, {
          id: nama.timpaId || undefined,
          siswaId: nama.siswa.id, namaSiswa: nama.siswa.nama, namaDikonfirmasi: true, namaTerbaca: nama.namaTerbaca || null,
          bacaan: r.jawaban, koreksi: t.koreksi, jawaban: t.jawaban,
          foto: await imageToBlob(r.gambarLurus, 0.75), fotoUkuran: [r.gambarLurus.width, r.gambarLurus.height],
          overlay: r.overlay, kualitas: r.kualitas, rotasi: r.rotation,
        });
        toast(`Tersimpan: ${saved.namaSiswa}, ${saved.nilai.persen}%`, 'ok');
        layarKamera();
      } catch (e) { toast(e.message, 'bad', 6000); simpanBtn.disabled = false; }
    };
    mount(body,
      r.kualitas.rotasi ? h('div', { class: 'small muted' }, `Foto diputar ${r.kualitas.rotasi} derajat secara otomatis.`) : null,
      pn.el, pt.el,
      h('div', { class: 'card stack' }, simpanBtn, alasan,
        h('button', { class: 'btn btn-danger btn-block', onclick: async () => { if (await konfirmasi('Buang lembar ini?', 'Hasil bacaan tidak disimpan.', 'Buang', true)) layarKamera(); } }, 'Buang, foto ulang')));
    cek();
  };

  mount(root, head, body);
  await layarKamera();
  return stopKamera;
}
