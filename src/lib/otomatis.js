// Keputusan nama untuk mode scan otomatis (murni, dites di tests/otomatis.test.js).
import { matchName, hasKana } from './namematch.js';

/**
 * @param bacaanNama hasil Claude {terbaca, teks_asli, latin, kana} atau null (Claude tidak aktif / gagal)
 * @param siswa daftar {id, nama, katakana, kelasId} dari semua kelas
 * @param nomorLembar urutan lembar di sesi (untuk nama sementara)
 * @returns {status: 'cocok'|'cocok_lemah'|'baru'|'tanpa_nama', siswaId?, nama, skor?, perluCek:boolean}
 */
export function putuskanNama(bacaanNama, siswa, nomorLembar) {
  const teks = bacaanNama?.terbaca ? (bacaanNama.latin || bacaanNama.teks_asli || '').trim() : '';
  if (!teks) return { status: 'tanpa_nama', nama: `Lembar ${nomorLembar}`, perluCek: true };
  const kana = bacaanNama.kana || (hasKana(bacaanNama.teks_asli) ? bacaanNama.teks_asli : '');
  const m = siswa.length ? matchName({ latin: bacaanNama.latin, kana }, siswa) : { status: 'tidak_cocok', kandidat: [] };
  const top = m.kandidat[0];
  if (m.status === 'kuat') return { status: 'cocok', siswaId: top.id, nama: top.nama, skor: top.skor, perluCek: false };
  if (m.status === 'lemah') return { status: 'cocok_lemah', siswaId: top.id, nama: top.nama, skor: top.skor, terbaca: teks, kandidat: m.kandidat, perluCek: true };
  return { status: 'baru', nama: teks, katakana: kana, perluCek: false };
}
