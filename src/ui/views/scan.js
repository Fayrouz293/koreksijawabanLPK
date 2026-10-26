// Mode scan otomatis: guru hanya memindai.
//  1. Lembar pertama = lembar KUNCI (lembar jawaban yang dihitamkan guru sesuai kunci).
//     Jenis lembar dikenali otomatis; paket & sesi dibuat tanpa ketikan.
//  2. Lembar berikutnya = lembar siswa: dibaca, dinilai, dan disimpan otomatis.
//     Nama dibaca Claude (bila aktif) di latar belakang; soal ragu & nama ragu ditandai "perlu cek".
// Kamera menangkap sendiri saat lembar terbaca stabil (dua bacaan berturut-turut sama).
import { h, mount, toast, back } from '../dom.js';
import * as M from '../../lib/model.js';
import { bacaLembar, bacaLembarOtomatis } from '../../omr-client.js';
import { fileToImage, bitmapToImage, imageToBlob, blobToBase64 } from '../../lib/images.js';
import { jawabanOtomatis, sidikJawaban } from '../../lib/grading.js';
import { putuskanNama } from '../../lib/otomatis.js';
import { halamanPdf, isPdf } from '../../lib/pdf.js';
import { bacaNamaClaude } from '../../lib/api.js';
import { app } from '../../main.js';

const JEDA_KAMERA_MS = 350;

export async function viewScan(root, sesiId) {
  const st = { sesi: sesiId ? await M.getSesi(sesiId) : null, template: null, aktif: true, sibuk: false, sidikTerakhir: null, sidikCalon: null, stream: null, antrianNama: Promise.resolve() };
  if (sesiId && !st.sesi) { location.hash = '#/scan'; return; }
  if (st.sesi) st.template = await M.getTemplate(st.sesi.templateId);

  const judul = h('div');
  const status = h('div', { class: 'scan-status', role: 'status', 'aria-live': 'polite' });
  const daftar = h('ul', { class: 'list card', id: 'daftar-scan' });
  const video = h('video', { playsinline: true, muted: true, autoplay: true });
  const kamera = h('div', { class: 'camera' }, video, h('div', { class: 'guide' }), h('div', { class: 'guide-text' }, 'Lembar mendatar, seluruh tabel soal & kotak nama masuk bingkai. Tahan diam sebentar.'));
  const bisaKamera = !!(navigator.mediaDevices?.getUserMedia && window.isSecureContext);

  const setStatus = (teks, jenis = 'info') => mount(status, h('div', { class: `banner ${jenis} small` }, teks));
  const renderJudul = async () => {
    const n = st.sesi ? (await M.hasilSesi(st.sesi.id)).length : 0;
    mount(judul,
      back('#/'),
      h('h1', null, st.sesi ? 'Scan lembar siswa' : 'Scan lembar kunci'),
      st.sesi
        ? h('div', { class: 'small muted' }, `${st.sesi.namaPaket} · `, h('b', null, `${n} lembar tersimpan`),
            st.sesi.kunciTidakJelas?.length ? h('div', { class: 'banner warn small' }, `Kunci nomor ${st.sesi.kunciTidakJelas.join(', ')} tidak terbaca jelas; nomor itu tidak dinilai. `, h('a', { href: `#/sesi/${st.sesi.id}/kunci` }, 'Perbaiki kunci')) : null)
        : h('div', { class: 'banner info small' }, 'Langkah 1: scan lembar jawaban yang sudah Anda hitamkan sesuai KUNCI. Setelah itu langsung scan lembar siswa; semuanya tersimpan otomatis.'),
      st.sesi && !app.status.claude && h('div', { class: 'small muted' }, 'Nama tidak dibaca otomatis (Claude tidak aktif): lembar diberi nama "Lembar 1, 2, ..." dan foto kotak nama disimpan.'),
      st.sesi && app.status.claude && app.pakaiClaudeNama && h('div', { class: 'datakeluar' }, 'Data keluar perangkat: potongan kotak nama tiap lembar dikirim ke Claude API.'));
  };

  // ---------------------------------------------------------------- proses satu gambar
  /** @returns {Promise<'kunci'|'tersimpan'|'sama'|'ditolak'>} */
  const proses = async (img, { dariKamera = false } = {}) => {
    if (!st.sesi) {
      const tpls = await M.semuaTemplate();
      const r = await bacaLembarOtomatis(img, tpls);
      if (!r.ok) { if (!dariKamera) setStatus(`Lembar kunci ditolak: ${r.petunjuk}`, 'bad'); else setStatus(r.petunjuk, 'info'); return 'ditolak'; }
      const sidikK = `${r.templateId}:${sidikJawaban(r.jawaban)}`;
      if (dariKamera && sidikK !== st.sidikCalon) { st.sidikCalon = sidikK; setStatus('Lembar kunci terbaca, tahan sebentar...'); return 'ditolak'; }
      st.sidikCalon = null;
      const t = tpls.find(x => x.id === r.templateId);
      const { sesi, tidakJelas } = await M.sesiDariLembarKunci(t, r.jawaban);
      st.sesi = sesi; st.template = t; st.sidikTerakhir = sidikJawaban(r.jawaban);
      history.replaceState(null, '', `#/scan/${sesi.id}`);
      bunyi(2);
      toast(`Kunci tersimpan (${t.nama}): ${Object.keys(r.jawaban).length - tidakJelas.length}/${Object.keys(r.jawaban).length} nomor.`, tidakJelas.length ? 'info' : 'ok', 5000);
      setStatus('Kunci tersimpan. Sekarang scan lembar siswa.', 'ok');
      await renderJudul();
      return 'kunci';
    }
    const r = await bacaLembar(img, st.template);
    if (!r.ok) { setStatus(dariKamera ? r.petunjuk : `Lembar ditolak: ${r.petunjuk}`, dariKamera ? 'info' : 'bad'); return 'ditolak'; }
    const sidik = sidikJawaban(r.jawaban);
    if (sidik === st.sidikTerakhir) { setStatus('Lembar ini sudah tersimpan. Ganti ke lembar berikutnya.', 'ok'); return 'sama'; }
    if (dariKamera && sidik !== st.sidikCalon) { st.sidikCalon = sidik; setStatus('Lembar terbaca, tahan sebentar...', 'info'); return 'ditolak'; }
    st.sidikTerakhir = sidik; st.sidikCalon = null;

    const { jawaban, perluCek } = jawabanOtomatis(r.jawaban);
    const nomor = (await M.hasilSesi(st.sesi.id)).length + 1;
    const fotoNama = r.kotakNama ? await imageToBlob(r.kotakNama, 0.85) : null;
    const pakaiClaude = !!(fotoNama && app.status.claude && app.pakaiClaudeNama);
    const hasil = await M.simpanHasilOtomatis(st.sesi, {
      siswaId: `lembar-${M.db.uid()}`, namaSiswa: `Lembar ${nomor}`, nomorLembar: nomor,
      namaStatus: pakaiClaude ? 'membaca' : 'tanpa_nama',
      bacaan: r.jawaban, koreksi: {}, jawaban, perluCek,
      foto: await imageToBlob(r.gambarLurus, 0.75), fotoNama, overlay: r.overlay, kualitas: r.kualitas, rotasi: r.rotation,
    });
    bunyi(1);
    tampilkan(hasil);
    setStatus(`Tersimpan: Lembar ${nomor}, ${hasil.nilai.persen}%. Lanjut lembar berikutnya.`, 'ok');
    renderJudul();
    if (pakaiClaude) st.antrianNama = st.antrianNama.then(() => isiNama(hasil.id, fotoNama, nomor)).catch(e => console.error(e));
    return 'tersimpan';
  };

  /** Baca nama via Claude lalu perbarui hasil (berurutan agar penambahan siswa tidak bertabrakan). */
  const isiNama = async (hasilId, fotoNama, nomor) => {
    let bacaan = null;
    try { bacaan = await bacaNamaClaude(await blobToBase64(fotoNama), 'image/jpeg'); } catch (e) { console.warn('nama', e.message); }
    const keputusan = putuskanNama(bacaan, await M.semuaSiswa(), nomor);
    let siswaId = keputusan.siswaId, nama = keputusan.nama;
    if (keputusan.status === 'baru') { const s = await M.tambahSiswaOtomatis(keputusan.nama, keputusan.katakana); siswaId = s.id; nama = s.nama; }
    const hs = await M.getHasil(hasilId);
    if (!hs) return;
    let namaStatus = keputusan.status;
    if (siswaId) {
      const lain = await M.cariHasilSiswaDiSesi(st.sesi.id, siswaId, hasilId);
      if (lain) namaStatus = 'ganda_di_sesi';
    }
    const baru = { ...hs, siswaId: siswaId || hs.siswaId, namaSiswa: nama, namaStatus, namaTerbaca: bacaan, namaKandidat: keputusan.kandidat || null };
    await M.db.put('hasil', baru);
    tampilkan(baru);
  };

  const tampilkan = (hs) => {
    const ada = daftar.querySelector(`[data-id="${hs.id}"]`);
    const label = { cocok: null, baru: 'siswa baru', cocok_lemah: 'nama perlu cek', tanpa_nama: 'tanpa nama', membaca: 'membaca nama...', ganda_di_sesi: 'nama ganda di sesi' }[hs.namaStatus];
    const li = h('li', { 'data-id': hs.id },
      h('div', { class: 'grow' }, h('b', null, hs.namaSiswa), ' ',
        label && h('span', { class: 'badge ' + (hs.namaStatus === 'membaca' ? '' : 'warn') }, label),
        hs.perluCek?.length ? h('span', { class: 'badge warn' }, `cek soal ${hs.perluCek.join(', ')}`) : null),
      h('b', null, `${hs.nilai.persen}%`),
      h('a', { class: 'btn btn-sm', href: `#/hasil/${hs.id}` }, 'Lihat'));
    if (ada) ada.replaceWith(li); else daftar.prepend(li);
  };

  // ---------------------------------------------------------------- sumber gambar
  const jalankanAntrian = async (files) => {
    st.sibuk = true;
    let n = 0, tolak = 0;
    try {
      for (const f of files) {
        if (isPdf(f)) {
          for await (const p of halamanPdf(f)) {
            setStatus(`Memproses ${f.name} halaman ${p.halaman}/${p.jumlah}...`);
            const r = await proses(p.img); if (r === 'ditolak') tolak++; else n++;
          }
        } else {
          setStatus(`Memproses ${f.name}...`);
          const r = await proses(await fileToImage(f)); if (r === 'ditolak') tolak++; else n++;
        }
      }
      setStatus(`Selesai: ${n} lembar diproses${tolak ? `, ${tolak} ditolak (lihat pesan di atas)` : ''}.`, tolak ? 'warn' : 'ok');
    } catch (e) { setStatus(`Gagal memproses: ${e.message}`, 'bad'); }
    st.sibuk = false;
  };

  const pilihBanyak = (capture) => {
    const inp = h('input', { type: 'file', accept: 'image/*,application/pdf', multiple: !capture, capture: capture ? 'environment' : null, style: { display: 'none' } });
    inp.addEventListener('change', () => { const fs = [...(inp.files || [])]; inp.remove(); if (fs.length) jalankanAntrian(fs); });
    document.body.append(inp); inp.click();
  };

  const loopKamera = async () => {
    while (st.aktif && st.stream) {
      if (!st.sibuk && video.videoWidth) {
        st.sibuk = true;
        try { await proses(bitmapToImage(video, 2400), { dariKamera: true }); } catch (e) { console.error(e); }
        st.sibuk = false;
      }
      await new Promise(r => setTimeout(r, JEDA_KAMERA_MS));
    }
  };

  const mulaiKamera = async () => {
    try {
      st.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false });
      video.srcObject = st.stream;
      setStatus('Arahkan kamera ke lembar. Foto diambil otomatis.');
      loopKamera();
    } catch (e) {
      setStatus(`Kamera langsung tidak bisa dibuka (${e.message}). Pakai tombol "Foto lembar".`, 'warn');
      kamera.remove();
    }
  };

  mount(root, judul,
    bisaKamera ? kamera : h('div', { class: 'card small' }, 'Kamera otomatis butuh alamat HTTPS. Pakai "Foto lembar" atau "Unggah".'),
    status,
    h('div', { class: 'row', style: { margin: '10px 0' } },
      h('button', { class: 'btn btn-primary grow', onclick: () => pilihBanyak(true) }, 'Foto lembar'),
      h('button', { class: 'btn grow', id: 'unggah-scan', onclick: () => pilihBanyak(false) }, 'Unggah foto / PDF')),
    h('div', { class: 'row' },
      h('a', { class: 'btn btn-sm grow', href: '#/scan', onclick: e => { if (!st.sesi) e.preventDefault(); } }, 'Kunci baru'),
      h('button', { class: 'btn btn-sm grow', onclick: () => { if (st.sesi) location.hash = `#/sesi/${st.sesi.id}`; } }, 'Selesai, lihat rekap')),
    h('h2', null, 'Lembar tersimpan'),
    daftar);
  await renderJudul();
  if (st.sesi) for (const hs of (await M.hasilSesi(st.sesi.id)).sort((a, b) => (a.dibuat || '').localeCompare(b.dibuat || ''))) tampilkan(hs);
  if (bisaKamera) mulaiKamera();
  else setStatus(st.sesi ? 'Siap memindai lembar siswa.' : 'Siap memindai lembar kunci.');

  return () => { st.aktif = false; st.stream?.getTracks().forEach(t => t.stop()); st.stream = null; };
}

/** Umpan balik tanpa melihat layar: getar + bunyi pendek. */
function bunyi(kali) {
  try { navigator.vibrate?.(kali > 1 ? [120, 80, 120] : 150); } catch { /* tidak didukung */ }
  try {
    const ctx = bunyi.ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < kali; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.08;
      o.connect(g).connect(ctx.destination);
      const t0 = ctx.currentTime + i * 0.18;
      o.start(t0); o.stop(t0 + 0.1);
    }
  } catch { /* audio diblokir */ }
}
