# Koreksi Try-out LPK JOSG

Aplikasi web untuk mengoreksi try-out bahasa Jepang (pilihan ganda, opsi 1-4) di LPK Jaroe Oshin Gakuin, Lhokseumawe.
Dipakai guru dari HP atau laptop. Bulatan jawaban dibaca **di perangkat** (OpenCV.js, jalan offline); Claude API hanya
dipakai untuk membaca gambar kunci dan potongan kotak nama, dan keduanya opsional.

## Menjalankan

Butuh Node.js 20.6 atau lebih baru.

```bash
npm install
cp .env.example .env        # isi ANTHROPIC_API_KEY bila ingin fitur Claude (opsional)
npm start                   # build lalu jalankan server di http://localhost:8787
```

- **Di laptop**: buka `http://localhost:8787`. Kamera langsung di dalam aplikasi berfungsi (localhost dianggap aman).
- **Di HP lewat Wi-Fi yang sama**: buka `http://<IP-laptop>:8787`. Browser HP hanya mengizinkan kamera langsung di HTTPS,
  jadi di alamat http aplikasi memakai tombol **Foto lembar** yang membuka kamera bawaan HP. Hasilnya sama, biasanya malah
  lebih tajam karena memakai fokus otomatis kamera bawaan.
- **Pengembangan**: `npm run server` (terminal 1) dan `npm run dev` (terminal 2, Vite di port 5173, `/api` diteruskan ke 8787).

### Pengaman API key (KODE_AKSES)

Siapa pun yang bisa menjangkau `/api/kunci` dan `/api/nama` bisa memakai API key Anda. Karena itu:

- Tanpa `KODE_AKSES`, fitur Claude hanya melayani browser di **komputer server itu sendiri** (localhost).
  HP di Wi-Fi yang sama dan pengunjung dari internet mendapat mode manual.
- Dengan `KODE_AKSES` (minimal 12 karakter, buat acak mis. `openssl rand -hex 12`) di `.env` atau di pengaturan
  environment hosting, setiap perangkat harus mengisi kode yang sama di **Lainnya > Pengaturan > Kode akses server**.
- Endpoint tidak membatasi jumlah percobaan; keamanan bergantung pada panjang dan keacakan kode.

### Deploy ke Vercel

`vercel.json` dan `api/*.js` sudah disiapkan (aplikasi statis + 3 fungsi). Tanpa variabel lingkungan apa pun hasilnya
mode manual. Untuk mengaktifkan Claude, isi `ANTHROPIC_API_KEY` **dan** `KODE_AKSES` di Project Settings >
Environment Variables, lalu deploy ulang. Di internet publik, kamera langsung di dalam aplikasi berfungsi karena HTTPS.

Tanpa internet atau tanpa API key aplikasi tetap jalan dalam **mode manual**: kunci diketik (atau dibaca lokal dari lembar
jawaban yang diisi kunci), nama dipilih dari daftar kelas. Setelah dibuka sekali saat online, service worker menyimpan
aplikasi termasuk OpenCV.js (sekitar 15 MB) sehingga bisa dibuka lagi tanpa internet.

## Data dan privasi

| Data | Tempat | Keluar perangkat? |
|---|---|---|
| Kelas, paket, sesi, hasil, foto lembar | IndexedDB di browser | Tidak |
| Pembacaan bulatan (OMR) | Web Worker di browser | Tidak |
| Gambar kunci jawaban | dikirim saat guru menekan "Baca gambar kunci (Claude)" | Ya, ke Claude API lewat server lokal |
| Potongan kotak nama (bukan seluruh lembar) | dikirim tiap lembar bila pengaturan "Baca kotak nama dengan Claude" aktif | Ya, ke Claude API lewat server lokal |

API key hanya ada di file `.env` di server. Tes e2e memeriksa bahwa key tidak muncul di bundle browser maupun di
respons server. UI menampilkan catatan "Data keluar perangkat" setiap kali gambar akan dikirim.

**Cadangan**: Lainnya > Cadangan > Ekspor menghasilkan satu file JSON berisi seluruh data (opsional dengan foto).
Aplikasi mengingatkan bila cadangan terakhir lebih dari 14 hari. Impor mengganti seluruh data di perangkat.

## Mode utama: hanya scan

1. Beranda > **Mulai scan**.
2. Scan **lembar kunci**: lembar jawaban kosong yang Anda hitamkan sesuai kunci. Jenis lembar (もじ・ごい atau
   ぶんぽう・どっかい) dikenali otomatis; paket dan sesi dibuat sendiri. Nomor yang bulatannya tidak jelas tidak dinilai
   dan ditampilkan.
3. Scan **lembar siswa** satu per satu. Tidak ada yang perlu diketik atau diketuk:
   - kamera (alamat HTTPS) mengambil foto sendiri saat lembar terbaca stabil, lalu bergetar/berbunyi;
   - atau unggah banyak foto sekaligus, atau **PDF** dari aplikasi scanner (CamScanner, Adobe Scan, scanner kantor);
   - lembar yang sama tidak tersimpan dua kali.
4. Hasil dinilai dan **disimpan otomatis**. Nama dibaca Claude (bila aktif) dan dicocokkan ke daftar; nama baru masuk
   kelas "Siswa (scan otomatis)". Tanpa Claude, lembar diberi nama "Lembar 1, 2, ..." dan foto kotak namanya disimpan.
5. Soal ragu (ganda / tidak yakin) dan nama yang tidak pasti diberi tanda **perlu cek** di rekap. Pemeriksaan opsional.

Konsekuensi: berbeda dengan alur manual, mode ini tidak mewajibkan konfirmasi guru. Soal "tidak yakin" dinilai
memakai saran OMR, soal "ganda" dihitung salah. Periksa baris bertanda bila nilai dipakai untuk keputusan penting.

## Alur manual (opsional)

1. **Kelas**: tempel daftar dari Google Sheets atau unggah CSV (kolom Nama, Katakana opsional, NIS opsional).
2. **Sesi baru**: pilih kelas, pilih paket lama atau buat paket baru (template lembar + batas lulus), isi kunci:
   gambar kunci (Claude), lembar jawaban yang dihitamkan sesuai kunci (dibaca lokal), atau ketuk manual.
   Nomor yang tidak terbaca dibiarkan kosong dan ditandai. Kunci disalin ke sesi.
3. **Pindai beruntun**: foto atau unggah (bisa beberapa sekaligus). Tiap lembar dibaca, dinilai terhadap kunci sesi,
   lalu ditinjau. Nama dicocokkan ke daftar kelas; hasil tidak bisa disimpan sebelum nama dikonfirmasi dan semua soal
   berstatus *ganda* / *tidak yakin* diputuskan guru. Siswa yang sudah dipindai di sesi yang sama memicu peringatan
   (timpa atau batal).
4. **Rekap**: skor, persen, lulus, skor per mondai, soal salah, rata-rata/tertinggi/terendah, soal paling sering salah,
   ekspor CSV, salin tabel untuk Sheets. Riwayat per siswa antarsesi ada di halaman kelas.

## Struktur kode

```
src/lib/template.js   struktur template (jumlah soal & mondai diturunkan dari data, tidak ada di kode)
src/lib/omr.js        OMR: normalisasi cahaya, deteksi tabel, orientasi 0/90/180/270, pelurusan, gerbang kualitas, baca bulatan
src/lib/grading.js    penilaian (fungsi murni, dites)
src/lib/namematch.js  pencocokan nama fuzzy (Jaro-Winkler, urutan kata, inisial, katakana)
src/lib/csv.js        impor daftar kelas, ekspor CSV/TSV
src/lib/db.js         IndexedDB
src/lib/backup.js     ekspor/impor cadangan JSON
src/lib/api.js        panggilan ke server lokal
src/omr.worker.js     Web Worker OpenCV.js
src/ui/views/*        tampilan (vanilla JS, tanpa framework)
server/               Express: /api/status, /api/kunci, /api/nama (Claude API), menyajikan dist/
templates/            *.struktur.json (diketik) dan *.json (hasil kalibrasi)
scripts/calibrate.mjs kalibrasi template dari foto lembar kosong
tests/                unit, akurasi sintetis, e2e
```

### Template lembar

Template = **struktur** (diketik) + **kalibrasi** (diukur dari foto lembar kosong). Contoh struktur もじ・ごい:

```json
{ "id": "n4-mojigoi", "nama": "N4 げんごちしき (もじ・ごい)", "opsi": 4,
  "struktur": [ { "id": "T1", "baris": ["M1", "1-9", "M2", "10-15", "M3", "16-25"] },
                { "id": "T2", "baris": ["M4", "26-30", "M5", "31-35"] } ] }
```

`M<n>` = baris judul mondai, `a-b` = baris soal. Kalibrasi mencari kotak tabel yang jumlah garis barisnya sesuai,
mengukur posisi garis baris, kolom bulatan, radius, baseline tinta tiap bulatan kosong (angka cetak di dalam bulatan),
serta kotak nama dan nomor peserta relatif terhadap tabel. Template baru bisa ditambahkan dari aplikasi
(Lainnya > Tambah template dari lembar kosong) atau dari baris perintah:

```bash
npm run kalibrasi -- templates/n4-mojigoi.struktur.json samples/blank/mojigoi-a.jpg
```

Dua template bawaan: N4 もじ・ごい (35 soal, mondai 1-9/10-15/16-25/26-30/31-35) dan N4 ぶんぽう・どっかい
(35 soal, mondai 1-15/16-20/21-25/26-29/30-33/34-35), dikalibrasi dari foto di `samples/blank/`.

### Cara pembacaan bulatan

1. Gambar diperkecil ke 2000 px, cahaya dinormalisasi (gambar dibagi latar kertas yang dikaburkan) untuk meredam bayangan.
2. Segi empat besar dicari pada 4 rotasi; tiap calon diluruskan dan pola garis barisnya dicocokkan dengan template.
   Rotasi dan kombinasi tabel dengan skor tertinggi dipakai (sekaligus deteksi orientasi otomatis).
3. Gerbang kualitas: tabel harus lengkap, kecerahan dan ketajaman cukup, tabel cukup besar di foto. Bila gagal,
   foto ditolak dengan petunjuk spesifik.
4. Tiap tabel diluruskan; batas baris dirapatkan ke garis yang benar-benar terdeteksi.
5. Kegelapan tiap bulatan dikurangi baseline lembar kosong (diskalakan per lembar), lalu dikurangi "lantai" baris
   (bayangan yang menggelapkan keempat bulatan secara merata).
6. Status per soal: `jelas`, `kosong`, `ganda`, `tidak_yakin`, dengan kepercayaan 0-1. Ambang ada di `template.ambang`.

## Dependensi

| Paket | Jenis | Alasan |
|---|---|---|
| `express` | produksi | server lokal kecil: menyimpan API key di sisi server, meneruskan 2 jenis permintaan, menyajikan aplikasi |
| `@anthropic-ai/sdk` | produksi | SDK resmi Claude API (penanganan galat bertipe, retry) |
| `vite` | pengembangan | build aplikasi browser dan Web Worker |
| `@techstark/opencv-js` | pengembangan (ikut dibundel) | OpenCV.js untuk OMR di browser dan di tes Node |
| `jpeg-js` | pengembangan | membaca/menulis JPEG di skrip kalibrasi & tes akurasi Node |

Tes memakai `node:test` bawaan Node dan Playwright (Chromium) yang sudah terpasang di lingkungan pengembangan;
tidak ada framework UI.

## Tes

```bash
npm test                 # unit: penilaian, pencocokan nama, CSV, template
npm run test:akurasi     # akurasi OMR & nama pada data sintetis (beberapa menit)
npm run build && npm run test:e2e   # alur lengkap di Chromium layar HP
```

Lihat [AKURASI.md](AKURASI.md) untuk angka terukur dan keterbatasannya.

## Versi 2 (belum dikerjakan; desain tidak menghalangi)

- Sinkron antarperangkat: butuh backend. Semua objek sudah ber-ID UUID dan bertanda waktu `diubah`, jadi bisa digabung.
- Kode paket di lembar agar kunci terpilih otomatis: template bisa diberi area kode (sama seperti kotak nama).
- Template lembar bagian lain: sudah bisa lewat kalibrasi; perlu foto lembar kosong choukai dll.
- Longgarkan konfirmasi untuk kepercayaan tinggi: status & kepercayaan per soal dan skor pencocokan nama sudah tersimpan
  di tiap hasil, sehingga keputusan ini bisa diambil setelah akurasi di lapangan terbukti.
