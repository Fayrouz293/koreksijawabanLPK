import './ui/styles.css';
import { h, mount } from './ui/dom.js';
import { statusServer } from './lib/api.js';
import { siapkanOmr } from './omr-client.js';
import { getMeta } from './lib/db.js';
import { viewBeranda } from './ui/views/beranda.js';
import { viewDaftarKelas, viewKelas, viewKelasBaru } from './ui/views/kelas.js';
import { viewDaftarPaket, viewPaket } from './ui/views/paket.js';
import { viewSesiBaru } from './ui/views/sesiBaru.js';
import { viewSesi, viewDaftarSesi, viewUbahKunciSesi } from './ui/views/sesi.js';
import { viewPindai } from './ui/views/pindai.js';
import { viewHasil } from './ui/views/hasil.js';
import { viewSiswa } from './ui/views/siswa.js';
import { viewPengaturan } from './ui/views/pengaturan.js';

/** Status bersama aplikasi. */
export const app = {
  status: { claude: false, alasan: 'Memeriksa...' },
  pakaiClaudeNama: true,
  omrSiap: false,
  async refreshStatus() {
    this.status = await statusServer();
    this.pakaiClaudeNama = await getMeta('pakaiClaudeNama', true);
    document.dispatchEvent(new CustomEvent('status'));
  },
};

const routes = [
  [/^\/?$/, viewBeranda, 'beranda'],
  [/^\/kelas$/, viewDaftarKelas, 'kelas'],
  [/^\/kelas\/baru$/, viewKelasBaru, 'kelas'],
  [/^\/kelas\/([^/]+)$/, viewKelas, 'kelas'],
  [/^\/kelas\/([^/]+)\/siswa\/([^/]+)$/, viewSiswa, 'kelas'],
  [/^\/paket$/, viewDaftarPaket, 'paket'],
  [/^\/paket\/([^/]+)$/, viewPaket, 'paket'],
  [/^\/sesi$/, viewDaftarSesi, 'sesi'],
  [/^\/sesi\/baru$/, viewSesiBaru, 'sesi'],
  [/^\/sesi\/([^/]+)$/, viewSesi, 'sesi'],
  [/^\/sesi\/([^/]+)\/kunci$/, viewUbahKunciSesi, 'sesi'],
  [/^\/sesi\/([^/]+)\/pindai$/, viewPindai, 'sesi'],
  [/^\/hasil\/([^/]+)$/, viewHasil, 'sesi'],
  [/^\/pengaturan$/, viewPengaturan, 'pengaturan'],
];

const root = document.getElementById('app');
let cleanup = null;

function shell(tab) {
  const statusEl = h('span', { id: 'status-mode', class: 'badge' });
  const upd = () => {
    statusEl.className = 'badge ' + (app.status.claude ? 'ok' : 'warn');
    statusEl.textContent = app.status.claude ? 'Claude aktif' : 'Mode manual';
    statusEl.title = app.status.claude ? `Model ${app.status.model}` : (app.status.alasan || 'Claude API tidak tersedia');
  };
  upd();
  document.addEventListener('status', upd);
  const content = h('main', { id: 'content' });
  const tabs = [['#/', 'Beranda', 'beranda'], ['#/sesi', 'Sesi', 'sesi'], ['#/kelas', 'Kelas', 'kelas'], ['#/paket', 'Paket', 'paket'], ['#/pengaturan', 'Lainnya', 'pengaturan']];
  mount(root,
    h('header', { class: 'top' }, h('a', { class: 'brand', href: '#/' }, 'Koreksi Try-out LPK JOSG'), statusEl),
    content,
    h('nav', { class: 'tabs' }, tabs.map(([href, label, key]) => h('a', { href, class: key === tab ? 'active' : null }, label))));
  return { content, dispose: () => document.removeEventListener('status', upd) };
}

let shellRef = null;
async function render() {
  const path = location.hash.replace(/^#/, '') || '/';
  if (cleanup) { try { await cleanup(); } catch { /* abaikan */ } cleanup = null; }
  for (const [re, view, tab] of routes) {
    const m = path.match(re);
    if (!m) continue;
    shellRef?.dispose();
    shellRef = shell(tab);
    try {
      const c = await view(shellRef.content, ...m.slice(1).map(decodeURIComponent));
      if (typeof c === 'function') cleanup = c;
    } catch (e) {
      console.error(e);
      mount(shellRef.content, h('div', { class: 'banner bad' }, `Terjadi galat: ${e.message}`), h('a', { class: 'btn', href: '#/' }, 'Ke beranda'));
    }
    window.scrollTo(0, 0);
    return;
  }
  location.hash = '#/';
}

window.addEventListener('hashchange', render);
window.addEventListener('online', () => app.refreshStatus());
window.addEventListener('offline', () => app.refreshStatus());

app.refreshStatus();
render();
// muat OpenCV di latar belakang agar pindai pertama cepat
siapkanOmr().then(() => { app.omrSiap = true; }).catch(e => console.error('OMR gagal dimuat', e));

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW gagal', e));
}
