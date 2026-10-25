// Penyimpanan lokal (IndexedDB). Semua data tinggal di perangkat.
// Store: kelas, paket, sesi, hasil, templat (template tambahan hasil kalibrasi), meta.

const NAMA_DB = 'koreksi-lpk-josg';
const VERSI = 1;
export const STORES = ['kelas', 'paket', 'sesi', 'hasil', 'templat', 'meta'];

let dbp = null;

export function openDB(idb = globalThis.indexedDB) {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = idb.open(NAMA_DB, VERSI);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kelas')) db.createObjectStore('kelas', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('paket')) db.createObjectStore('paket', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sesi')) {
        const s = db.createObjectStore('sesi', { keyPath: 'id' });
        s.createIndex('kelasId', 'kelasId');
      }
      if (!db.objectStoreNames.contains('hasil')) {
        const s = db.createObjectStore('hasil', { keyPath: 'id' });
        s.createIndex('sesiId', 'sesiId');
        s.createIndex('siswaId', 'siswaId');
      }
      if (!db.objectStoreNames.contains('templat')) db.createObjectStore('templat', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function wrap(req) {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

async function tx(store, mode, fn) {
  const db = await openDB();
  const t = db.transaction(store, mode);
  const res = fn(t.objectStore(store));
  await new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); });
  return res instanceof IDBRequest ? res.result : res;
}

export const get = (store, id) => tx(store, 'readonly', s => s.get(id));
export const all = (store) => tx(store, 'readonly', s => s.getAll());
export const put = (store, obj) => tx(store, 'readwrite', s => s.put(obj)).then(() => obj);
export const del = (store, id) => tx(store, 'readwrite', s => s.delete(id));
export const byIndex = (store, index, value) => tx(store, 'readonly', s => s.index(index).getAll(value));

export async function getMeta(key, def = null) { const r = await get('meta', key); return r ? r.value : def; }
export async function setMeta(key, value) { return put('meta', { key, value }); }

/** Ganti seluruh isi database secara atomik (dipakai impor cadangan). */
export async function replaceAll(data) {
  const db = await openDB();
  const t = db.transaction(STORES, 'readwrite');
  for (const st of STORES) {
    const s = t.objectStore(st);
    s.clear();
    for (const obj of data[st] || []) s.put(obj);
  }
  await new Promise((resolve, reject) => { t.oncomplete = resolve; t.onerror = () => reject(t.error); t.onabort = () => reject(t.error); });
}

export async function dumpAll() {
  const out = {};
  for (const st of STORES) out[st] = await all(st);
  return out;
}

export function uid() {
  return (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
}
