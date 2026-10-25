# Laporan akurasi

**Penting: semua angka OMR di bawah berasal dari data SINTETIS**, bukan lembar isian siswa sungguhan. Lembar isian nyata
beserta jawaban sebenarnya (ground truth), gambar kunci, dan daftar kelas belum diterima. Yang tersedia hanya tiga foto
lembar KOSONG (`samples/blank/`). Tanda pensil digambar program di atas foto kosong itu (`tests/accuracy/synth.mjs`).

Reproduksi: `npm run test:akurasi` (hasil lengkap di `tests/accuracy/laporan-*.json`).

## Data uji

- 3 foto dasar: `mojigoi-a` (foto yang juga dipakai kalibrasi), `mojigoi-b` (foto lain, tidak dipakai kalibrasi),
  `bunpou-dokkai-a` (foto kalibrasi template ぶんぽう・どっかい).
- 3 pola jawaban acak per foto x 7 variasi foto = 63 lembar = **2.205 soal per skenario**.
- Jenis tanda per soal (acak): normal 66%, tipis 8%, dihapus tidak bersih + tanda baru 10%, kosong 6%, ganda 5%,
  coretan sebagian 5%.
- Variasi foto: lurus, miring 6-10 derajat + perspektif, terbalik 180, diputar 90, bayangan tambahan 45%,
  miring + bayangan, buram ringan.
- Skenario **normal**: tanda pas di bulatan, gelap 0,50-0,85. Skenario **sulit**: tanda meleset sampai 35% lebar
  bulatan, ukuran 60-120%, gelap 0,35-0,70.

## Definisi

- **benar otomatis**: status `jelas`/`kosong`/`ganda` dan sama dengan jawaban sebenarnya; guru tidak perlu menyentuh.
- **tinjau, saran benar**: ditandai wajib ditinjau (tidak bisa disimpan tanpa keputusan guru), saran bacaan benar.
- **tinjau, saran salah**: ditandai wajib ditinjau, saran bacaan salah (guru harus mengoreksi).
- **salah tanpa tanda**: dibaca `jelas`/`kosong` tetapi salah. Ini satu-satunya kesalahan yang bisa lolos ke nilai.

## Hasil OMR (sintetis)

| Skenario | Soal | Benar otomatis | Tinjau, saran benar | Tinjau, saran salah | Salah tanpa tanda |
|---|---|---|---|---|---|
| normal | 2.205 | 95,51% | 4,49% | 0,00% | **0,00% (0 soal)** |
| sulit | 2.205 | 87,03% | 12,34% | 0,63% | **0,00% (0 soal)** |

Per variasi (benar otomatis, normal / sulit): lurus 94,92% / 86,03%; miring 95,87% / 86,67%; terbalik 94,92% / 86,03%;
diputar 90 94,92% / 86,03%; bayangan 94,29% / 86,35%; miring+bayangan 95,87% / 86,35%; buram ringan 97,78% / 91,75%.
Tidak ada lembar dari variasi ini yang ditolak gerbang kualitas.

Per jenis tanda (normal / sulit), benar otomatis:

| Jenis | normal | sulit | Sisanya |
|---|---|---|---|
| normal | 100,00% | 91,60% | ditinjau |
| tipis | 44,64% | 29,76% | ditinjau |
| coretan sebagian | 96,10% | 72,45% | ditinjau |
| dihapus tidak bersih | 100,00% | 100,00% | - |
| kosong | 100,00% | 100,00% | - |
| ganda | 100,00% | 87,50% | ditinjau (saran salah 12,50%) |

Per foto dasar (normal): mojigoi-a 91,29%, mojigoi-b 98,37%, bunpou-dokkai-a 96,87%; salah tanpa tanda 0% di ketiganya.

Gerbang kualitas: buram berat (sigma 9 px), gelap (22% cahaya), dan foto terpotong 35% bawah ditolak di ketiga foto
dasar, masing-masing dengan alasan `terlalu_buram`, `terlalu_gelap`, `tabel_tidak_lengkap`. Lembar kosong asli dibaca
35/35 `kosong` di ketiga foto (tidak ada alarm palsu dari angka cetak di dalam bulatan).

## Terhadap target 98%

- Target "98% per soal" **belum terbukti**. Bila diartikan sebagai *benar otomatis tanpa ditinjau*, hasilnya
  95,51% (normal) dan 87,03% (sulit), **di bawah target**.
- Bila diartikan sebagai *nilai akhir benar setelah guru meninjau soal yang ditandai*, tidak ada kesalahan yang lolos
  (0 dari 4.410 soal). Itu karena desainnya konservatif: tanda tipis dan meragukan selalu dilempar ke guru.
- Penyebab utama tidak otomatis: tanda tipis (pensil ringan), coretan sebagian, dan tanda yang meleset dari bulatan.
  Ambang `tanda` (0,16) sengaja tidak diturunkan karena sisa hapusan yang tidak bersih mencapai kegelapan serupa.
- Angka sintetis cenderung optimistis: posisi tanda diambil dari detektor yang sama (meski digeser acak), tekstur grafit
  buatan, dan dua dari tiga foto dasar juga foto kalibrasi.

## Pencocokan nama (sintetis)

Daftar 30 nama fiktif, tiap variasi 90 percobaan (katakana 15). Ini mengukur pencocokan saja; pembacaan tulisan tangan
oleh Claude **belum diukur** (butuh API key dan foto kotak nama asli).

| Variasi bacaan | Top-1 benar | Masuk 3 teratas | Status kuat | Kuat tapi orang salah |
|---|---|---|---|---|
| persis | 100,00% | 100,00% | 100,00% | 0 |
| salah 1 huruf | 100,00% | 100,00% | 97,78% | 0 |
| salah 2 huruf | 100,00% | 100,00% | 85,56% | 0 |
| satu huruf hilang | 100,00% | 100,00% | 100,00% | 0 |
| urutan kata terbalik | 100,00% | 100,00% | 100,00% | 0 |
| inisial ("M. Rizki") | 100,00% | 100,00% | 100,00% | 0 |
| huruf besar semua | 100,00% | 100,00% | 100,00% | 0 |
| nama depan saja | 76,67% | 100,00% | 30,00% | 0 |
| katakana | 100,00% | 100,00% | 100,00% | 0 |

Apa pun statusnya, nama tetap wajib dikonfirmasi satu ketukan oleh guru.

## Yang dibutuhkan untuk angka nyata, dan usulan perbaikan

1. **Lembar isian nyata + jawaban sebenarnya** (minimal 10-20 lembar dari beberapa siswa, berbagai kondisi foto).
   Lalu jalankan pengukuran yang sama pada foto asli dan setel `template.ambang` dari data itu, bukan dari data sintetis.
2. **Foto kunci jawaban asli** dan **daftar kelas asli** untuk menguji pembacaan kunci dan nama oleh Claude.
3. Bila akurasi nyata di bawah target, urutan perbaikan paling murah:
   - **Alas gelap** di bawah kertas: tepi kertas terdeteksi, pelurusan lebih stabil, bayangan berkurang.
   - **Panduan bingkai** saat memotret (sudah ada di kamera langsung), lampu ruangan dari atas, HP sejajar kertas.
   - **Penanda sudut** (kotak hitam kecil di 4 sudut) bila lembar dicetak ulang sendiri: pelurusan jadi jauh lebih tepat.
   - Instruksi siswa: hitamkan penuh dengan pensil 2B, hapus bersih.
