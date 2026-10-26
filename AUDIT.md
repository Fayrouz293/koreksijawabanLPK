# Laporan audit akhir: Koreksi Try-out LPK JOSG

Tanggal: 26 Oktober 2026. Kode yang diaudit: commit `a3e57fe` (branch `ccr-c93cd8f1-7p3yu0`).
Deploy: Vercel, proyek `koreksi-lpk-josg`, status **READY** menurut API Vercel; alamat produksi
`https://koreksi-lpk-josg.vercel.app`.

Label yang dipakai: **[Fakta]** = terukur atau terlihat langsung; **[Interpretasi]** = kesimpulan dari fakta;
**[Belum terbukti]** = asumsi yang belum diuji.

## 1. Ringkasan untuk pengambil keputusan

| Aspek | Status | Dasar |
|---|---|---|
| Fungsi aplikasi (alur lengkap) | Lolos uji | [Fakta] tes unit 47/47, tes e2e 26/26 di Chromium layar HP |
| Akurasi bulatan | **Belum memenuhi target 98%** | [Fakta] data sintetis: 95,51% (normal), 87,03% (sulit) otomatis; 0 salah tanpa tanda dari 4.410 soal |
| Akurasi di lembar asli | **Belum diukur** | Tidak ada lembar isian asli + jawaban sebenarnya |
| Pembacaan kunci & nama oleh Claude | **Belum diuji dengan API sungguhan** | Tidak ada API key; diuji dengan respons tiruan |
| Keamanan API key | Diperbaiki pada audit ini | KODE_AKSES / hanya localhost; key tidak ada di bundle (diuji) |
| Privasi data siswa | Memadai untuk MVP, ada risiko hukum yang perlu ditindaklanjuti | Lihat bagian 5 |
| Siap dipakai untuk nilai resmi | **Belum** | Perlu uji lapangan dulu (bagian 8) |

[Interpretasi] Aplikasi layak untuk **uji coba terbatas** dengan guru tetap memeriksa tiap lembar di layar tinjau.
Belum layak dipakai sebagai satu-satunya dasar nilai resmi sebelum akurasinya diukur pada lembar asli.

## 2. Ruang lingkup dan metode

1. **Tinjauan kode otomatis**: skill `code-review` pada perubahan audit (server, fungsi Vercel, CSV, pengaturan).
   Hasilnya 17 temuan; yang valid diperbaiki (bagian 4).
2. **Tinjauan manual seluruh kode**: OMR, penilaian, pencocokan nama, penyimpanan, cadangan, UI, service worker.
3. **Pengujian**: unit (`node:test`), akurasi sintetis OMR & nama, e2e Playwright (Chromium, viewport 390x844).
4. **Tinjauan metodologi**: validitas angka akurasi, bias data uji, asumsi yang belum terbukti.
5. **Tinjauan operasional**: deploy, biaya, ketergantungan layanan, risiko kehilangan data, aspek hukum.

Tidak dilakukan: uji penetrasi, uji di HP fisik (Android/iPhone), uji beban, audit aksesibilitas dengan pembaca layar.

## 3. Hasil pengujian

| Uji | Hasil |
|---|---|
| Unit: penilaian (bobot, batas lulus, soal tanpa kunci, fungsi murni) | lolos |
| Unit: status bulatan (jelas/kosong/ganda/tidak yakin, kepercayaan 0-1) | lolos |
| Unit: pencocokan nama, impor CSV/TSV, template | lolos |
| Unit: akses server (tanpa key, localhost, KODE_AKSES salah/benar/terlalu pendek, header rusak) | lolos |
| Unit: validasi cadangan (file rusak ditolak sebelum mengganti data) | lolos |
| Unit: ekspor aman dari formula injection | lolos |
| E2E: mode manual, impor kelas, kunci dari lembar (35/35 benar), pindai beruntun, konfirmasi nama, cek siswa ganda, tinjau, simpan, rekap, CSV, salin Sheets, riwayat, cadangan, tutup/buka browser, offline, impor cadangan di profil baru, mode Claude (tiruan), API key tidak bocor | 26/26 lolos |
| Akurasi OMR sintetis | lihat AKURASI.md |

Total: **47/47 unit**, **26/26 e2e**.

## 4. Temuan dan tindak lanjut

Tingkat: **Tinggi** = bisa merugikan uang/data/nilai siswa; **Sedang** = salah fungsi pada kondisi tertentu;
**Rendah** = kualitas/pemeliharaan.

### Sudah diperbaiki dalam audit ini

| # | Tingkat | Temuan | Perbaikan |
|---|---|---|---|
| 1 | Tinggi | Endpoint Claude terbuka: bila server di Wi-Fi LPK atau di internet memegang API key, siapa pun bisa memakainya dan tagihan masuk ke akun LPK | Tanpa `KODE_AKSES` Claude hanya melayani localhost; dengan `KODE_AKSES` (min. 12 karakter) setiap permintaan wajib membawa kode; permintaan lewat tunnel tidak dianggap lokal |
| 2 | Tinggi | Kode akses pendek bisa ditebak berulang (tidak ada batas percobaan) | Kode < 12 karakter ditolak; disarankan kode acak `openssl rand -hex 12` |
| 3 | Sedang | Formula injection: nama yang diawali `=`, `+`, `-`, `@` (termasuk spasi di depan dan huruf lebar penuh) di CSV/TSV bisa dijalankan sebagai formula di Excel/Sheets | Sel diawali `'`; CR di dalam sel tidak lagi memecah baris |
| 4 | Sedang | Tanggal default memakai UTC: sesi yang dibuat pukul 00.00-07.00 WIB tercatat tanggal kemarin | Pakai tanggal lokal perangkat |
| 5 | Sedang | Impor cadangan yang rusak sebagian bisa membuat halaman crash setelah seluruh data lama terhapus | Isi cadangan divalidasi per catatan sebelum mengganti data |
| 6 | Sedang | Browser (terutama Safari/iPhone) bisa menghapus IndexedDB saat penyimpanan penuh atau lama tidak dipakai | Minta `navigator.storage.persist()`; status penyimpanan & kuota tampil di Pengaturan |
| 7 | Sedang | Batas waktu fungsi Vercel lebih pendek dari total waktu tunggu SDK (timeout x retry) | SDK 110 dtk x 2 percobaan, `maxDuration` 300 dtk |
| 8 | Sedang | Kode akses dengan karakter non-ASCII atau spasi di env membuat akses selalu gagal dengan pesan menyesatkan | Kode di-encode di klien, di-decode & di-trim di server |
| 9 | Rendah | Body rusak/terlalu besar menghasilkan HTML berisi jejak tumpukan | Semua galat API dalam bentuk JSON tanpa jejak |
| 10 | Rendah | Perilaku Express dan Vercel berbeda (404 vs 405) dan kode adaptor diduplikasi 4 kali | Satu fungsi `jalankan()` untuk keduanya |
| 11 | Rendah | Template kustom tidak bisa dikalibrasi ulang atau dihapus; aturan ID hanya di satu formulir | Kalibrasi ulang dengan konfirmasi, tombol hapus, aturan ID di `validateTemplate` |
| 12 | Rendah | Tampilan "NaN MB" bila browser tidak memberi kuota; panggilan berurutan memperlambat halaman | Dijaga & dijalankan paralel |

### Masih terbuka (tidak bisa ditutup tanpa data/keputusan Anda)

| # | Tingkat | Temuan | Dampak | Rekomendasi |
|---|---|---|---|---|
| A | **Tinggi** | Akurasi OMR hanya diukur pada data sintetis | Angka 95,51% bisa lebih tinggi atau lebih rendah di lapangan | Uji 10-20 lembar asli + jawaban sebenarnya; setel `template.ambang` dari data itu |
| B | **Tinggi** | Target 98% otomatis belum tercapai (sintetis: 95,51% normal, 87,03% sulit) | Guru perlu meninjau rata-rata 1-5 soal per lembar (normal) | Alas gelap, pencahayaan dari atas, pensil 2B, penanda sudut bila lembar dicetak sendiri |
| C | **Tinggi** | Pembacaan kunci & nama oleh Claude belum pernah diuji dengan API sungguhan | Bisa gagal format/parameter di dunia nyata (mis. parameter `fallbacks`) | Isi API key + KODE_AKSES, uji dengan 1 gambar kunci & 5 lembar; ada percobaan ulang tanpa `fallbacks` bila ditolak |
| D | Sedang | Belum diuji di HP fisik | Waktu proses per lembar di HP kelas menengah belum diketahui (Node: 1,3-1,5 dtk); unduhan pertama sekitar 3,9 MB (gzip) | Uji di 1 Android & 1 iPhone yang dipakai guru |
| E | Sedang | Kalibrasi dari foto HP (miring, berbayangan), bukan scan datar | Posisi bulatan bisa sedikit bergeser untuk cetakan lain | Kalibrasi ulang dari scan datar/PDF lembar asli bila tersedia |
| F | Sedang | Foto `mojigoi-a` dan `mojigoi-b` mungkin lembar fisik yang sama | Generalisasi ke cetakan lain belum terbukti | Uji dengan lembar dari batch cetak berbeda |
| G | Sedang | Cadangan dengan foto dibuat seluruhnya di memori | Untuk data besar (puluhan sesi x 30 siswa) bisa gagal di HP | Ekspor tanpa foto, atau cadangan per periode |
| H | Sedang | Data hanya di satu perangkat (belum ada sinkron) | HP hilang/rusak tanpa cadangan berarti data hilang | Disiplin cadangan (pengingat 14 hari sudah ada); sinkron di versi 2 |
| I | Rendah | Fungsi Vercel berjalan di region `iad1` (AS) | Panggilan Claude dari Aceh sedikit lebih lambat; halaman statis tetap lewat CDN | Opsional: pindah region ke Singapura (`sin1`) |
| J | Rendah | Belum ada audit aksesibilitas dengan pembaca layar | Pengguna tunanetra belum dipertimbangkan | Bukan prioritas untuk pengguna saat ini (guru) |

## 5. Privasi, hukum, dan biaya

- **[Fakta]** Data yang keluar perangkat hanya gambar kunci (bila guru memilih) dan potongan kotak nama (bisa dimatikan).
  Nilai, foto lembar, dan daftar kelas tetap di browser. E2E memastikan yang dikirim untuk nama hanya potongan sekitar 9 KB.
- **[Interpretasi, perlu dicek ahli hukum]** Nama siswa adalah data pribadi menurut UU No. 27 Tahun 2022 tentang
  Pelindungan Data Pribadi. Mengirim potongan tulisan nama ke pemroses di luar negeri (Anthropic) sebaiknya didasari
  pemberitahuan dan persetujuan siswa/wali, atau pembacaan nama dengan Claude dimatikan (Pengaturan) sehingga nama dipilih manual.
- **[Belum terbukti oleh saya]** Ketentuan penyimpanan dan pemakaian data oleh Anthropic untuk API: periksa dokumen resmi
  Anthropic (Commercial Terms dan kebijakan privasi) yang berlaku saat ini sebelum mengaktifkan fitur Claude.
- **[Fakta]** Akun Vercel yang dipakai berpaket **Hobby**. [Interpretasi] Ketentuan Vercel membatasi Hobby untuk
  pemakaian pribadi non-komersial; bila aplikasi dipakai operasional oleh LPK (lembaga berbayar), pertimbangkan paket Pro
  atau hosting lain. Periksa ketentuan Vercel terbaru.
- **[Interpretasi]** Biaya Claude bergantung jumlah lembar: 1 panggilan per lembar (nama) + 1 per paket (kunci).
  Untuk menekan biaya, nama bisa dipilih manual (gratis) dan kunci dibaca lokal dari lembar berisi kunci (gratis).

## 6. Arsitektur dan kualitas kode

- [Fakta] Modul terpisah sesuai permintaan: `template`, `omr`, pembacaan kunci (`server/claude.js` + `kunci.js`),
  pembacaan nama (`nama.js`), pencocokan nama (`namematch.js`), penilaian (`grading.js`, fungsi murni), penyimpanan
  (`db.js`, `backup.js`).
- [Fakta] Tidak ada jumlah soal atau koordinat di kode; semuanya dari `templates/*.json`.
- [Fakta] Dependensi produksi 2 (`express`, `@anthropic-ai/sdk`), pengembangan 3 (`vite`, `@techstark/opencv-js`, `jpeg-js`).
- [Interpretasi] Kelemahan pemeliharaan: tidak ada linter/formatter otomatis dan tidak ada CI. Rekomendasi: GitHub
  Actions yang menjalankan `npm test` pada setiap push.

## 7. Skenario

| Skenario | Kondisi | Hasil yang diperkirakan [Interpretasi] |
|---|---|---|
| Terbaik | Foto rata & terang, pensil 2B penuh, lembar dari cetakan yang sama | Mendekati angka sintetis normal (sekitar 95% otomatis); guru meninjau 1-2 soal per lembar; 0 salah lolos |
| Normal | Foto HP biasa, sebagian siswa memakai pensil ringan | Di antara skenario normal & sulit (87-95%); tinjau 2-5 soal per lembar |
| Terburuk | Cahaya buruk, kertas terlipat, cetakan berbeda dari template, tanda di luar bulatan | Banyak foto ditolak gerbang kualitas atau banyak soal ditinjau; risiko salah lolos belum terukur karena belum ada data asli |

## 8. Langkah berikut yang direkomendasikan (urut prioritas)

1. Buka `https://koreksi-lpk-josg.vercel.app` di HP guru dan pastikan halaman terbuka tanpa login Vercel.
2. Uji lapangan: 10-20 lembar asli + daftar jawaban sebenarnya + 1 gambar kunci + daftar kelas, lalu ukur ulang dengan
   skrip yang sama.
3. Putuskan pemakaian Claude (persetujuan data nama, biaya); bila ya, isi `ANTHROPIC_API_KEY` dan `KODE_AKSES` di
   Vercel > Settings > Environment Variables, lalu deploy ulang.
4. Tetapkan SOP foto: alas gelap, cahaya dari atas, seluruh tabel & kotak nama masuk bingkai, pensil 2B.
5. Tetapkan SOP cadangan mingguan (simpan file cadangan di Google Drive LPK).
