// Panggilan ke server lokal (yang meneruskan ke Claude API). Browser tidak pernah memegang API key.

async function req(path, body, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal } : { signal: ctl.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.pesan || `Server galat ${r.status}`), { kode: data.kode || 'server' });
    return data;
  } catch (e) {
    if (e.name === 'AbortError') throw Object.assign(new Error('Waktu habis menunggu server'), { kode: 'timeout' });
    if (e instanceof TypeError) throw Object.assign(new Error('Server lokal tidak terhubung'), { kode: 'offline' });
    throw e;
  } finally { clearTimeout(t); }
}

/** {claude: boolean, model} atau {claude:false, alasan} bila server tidak bisa dihubungi. */
export async function statusServer() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { claude: false, alasan: 'Perangkat tidak terhubung ke internet' };
  try { return await req('/api/status', null, 4000); } catch (e) { return { claude: false, alasan: e.message }; }
}

export const bacaKunciClaude = (gambar, mediaType, nomor, opsi) => req('/api/kunci', { gambar, mediaType, nomor, opsi }, 180000);
export const bacaNamaClaude = (gambar, mediaType) => req('/api/nama', { gambar, mediaType }, 90000);
