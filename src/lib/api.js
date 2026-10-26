// Panggilan ke server lokal (yang meneruskan ke Claude API). Browser tidak pernah memegang API key.

// Kode akses server (bila server memasang KODE_AKSES). Disimpan per perangkat.
export function getKodeAkses() { try { return localStorage.getItem('kodeAkses') || ''; } catch { return ''; } }
export function setKodeAkses(v) { try { v ? localStorage.setItem('kodeAkses', v) : localStorage.removeItem('kodeAkses'); } catch { /* penyimpanan diblokir */ } }

async function req(path, body, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  // encodeURIComponent: header HTTP hanya boleh ASCII; server men-decode kembali
  const headers = { 'x-kode-akses': encodeURIComponent(getKodeAkses()) };
  if (body) headers['Content-Type'] = 'application/json';
  try {
    const r = await fetch(path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.pesan || `Server galat ${r.status}`), { kode: data.kode || 'server' });
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw Object.assign(new Error('Waktu habis menunggu server'), { kode: 'timeout' });
    if (e instanceof TypeError) throw Object.assign(new Error('Server aplikasi tidak terhubung'), { kode: 'offline' });
    throw e;
  } finally { clearTimeout(t); }
}

/** {claude: boolean, model} atau {claude:false, alasan} bila server tidak bisa dihubungi. */
export async function statusServer() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { claude: false, alasan: 'Perangkat tidak terhubung ke internet' };
  try { return await req('/api/status', null, 6000); } catch (e) { return { claude: false, alasan: e.message }; }
}

export const bacaKunciClaude = (gambar, mediaType, nomor, opsi) => req('/api/kunci', { gambar, mediaType, nomor, opsi }, 180000);
export const bacaNamaClaude = (gambar, mediaType) => req('/api/nama', { gambar, mediaType }, 90000);
