// PDF hasil aplikasi scanner (CamScanner, Adobe Scan, scanner kantor) -> gambar per halaman.
// pdf.js dimuat hanya saat dibutuhkan agar tidak memperberat pembukaan aplikasi.

export async function* halamanPdf(file, maxSide = 2600) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const v1 = page.getViewport({ scale: 1 });
      const scale = maxSide / Math.max(v1.width, v1.height);
      const vp = page.getViewport({ scale });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const id = ctx.getImageData(0, 0, c.width, c.height);
      page.cleanup();
      yield { halaman: i, jumlah: doc.numPages, img: { width: c.width, height: c.height, data: id.data } };
    }
  } finally { doc.destroy(); }
}

export const isPdf = f => f && (f.type === 'application/pdf' || /\.pdf$/i.test(f.name || ''));
