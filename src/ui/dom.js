// Helper DOM kecil (tanpa framework).

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function mount(root, ...children) { root.replaceChildren(); append(root, children); }

export function toast(pesan, jenis = 'info', ms = 3500) {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(box); }
  const t = h('div', { class: `toast toast-${jenis}` }, pesan);
  box.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Dialog modal; mengembalikan nilai tombol yang ditekan. */
export function dialog({ judul, isi, tombol = [{ label: 'OK', nilai: true, utama: true }] }) {
  return new Promise(resolve => {
    const close = v => { bg.remove(); resolve(v); };
    const bg = h('div', { class: 'modal-bg', onclick: e => { if (e.target === bg) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        judul && h('h2', null, judul),
        typeof isi === 'string' ? h('p', null, isi) : isi,
        h('div', { class: 'modal-actions' },
          tombol.map(t => h('button', { class: t.utama ? 'btn btn-primary' : t.bahaya ? 'btn btn-danger' : 'btn', onclick: () => close(t.nilai) }, t.label)))));
    document.body.append(bg);
    bg.querySelector('.btn-primary, .btn')?.focus();
  });
}

export const konfirmasi = (judul, isi, ya = 'Ya', bahaya = false) =>
  dialog({ judul, isi, tombol: [{ label: 'Batal', nilai: false }, { label: ya, nilai: true, utama: !bahaya, bahaya }] });

export function formatTanggal(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function unduh(namaFile, isi, tipe) {
  const blob = isi instanceof Blob ? isi : new Blob([isi], { type: tipe });
  const a = h('a', { href: URL.createObjectURL(blob), download: namaFile });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function pilihFile(accept, opts = {}) {
  return new Promise(resolve => {
    const inp = h('input', { type: 'file', accept, capture: opts.capture || null, style: { display: 'none' } });
    inp.addEventListener('change', () => { resolve(inp.files?.[0] || null); inp.remove(); });
    document.body.append(inp);
    inp.click();
  });
}

export function back(href, label = 'Kembali') { return h('a', { class: 'back', href }, '‹ ', label); }
