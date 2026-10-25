// Panggilan Claude API. Hanya dua kegunaan: membaca gambar kunci jawaban dan membaca
// potongan kotak nama. Model & format permintaan mengikuti dokumentasi Anthropic
// (Messages API, structured outputs via output_config.format, fallbacks server-side).
import Anthropic from '@anthropic-ai/sdk';

export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const BETA_FALLBACK = 'server-side-fallback-2026-07-01';

let client = null;
export function hasKey() { return Boolean(process.env.ANTHROPIC_API_KEY); }
function getClient() {
  if (!hasKey()) throw Object.assign(new Error('API key belum diatur'), { status: 503, kode: 'tanpa_key' });
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return client;
}

const SKEMA_KUNCI = {
  type: 'object',
  properties: {
    jawaban: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          no: { type: 'integer' },
          pilihan: { type: 'integer', description: '1..opsi; 0 bila tidak terbaca atau tidak ada' },
          catatan: { type: 'string' },
        },
        required: ['no', 'pilihan', 'catatan'],
        additionalProperties: false,
      },
    },
    ringkasan: { type: 'string' },
  },
  required: ['jawaban', 'ringkasan'],
  additionalProperties: false,
};

const SKEMA_NAMA = {
  type: 'object',
  properties: {
    terbaca: { type: 'boolean' },
    teks_asli: { type: 'string', description: 'tulisan persis seperti di gambar' },
    aksara: { type: 'string', enum: ['latin', 'katakana', 'hiragana', 'campuran', 'tidak_terbaca'] },
    latin: { type: 'string', description: 'nama dalam huruf latin (transliterasi bila tulisan kana); kosong bila tidak terbaca' },
    kana: { type: 'string', description: 'nama dalam kana bila tertulis kana; kosong bila tidak' },
    ragu: { type: 'array', items: { type: 'string' }, description: 'bagian tulisan yang tidak yakin' },
  },
  required: ['terbaca', 'teks_asli', 'aksara', 'latin', 'kana', 'ragu'],
  additionalProperties: false,
};

/** Bentuk body permintaan kunci (dipisah agar bisa dites tanpa jaringan). */
export function buildKunciRequest({ base64, mediaType, nomor, opsi }) {
  const daftar = `${Math.min(...nomor)}-${Math.max(...nomor)}`;
  return {
    model: MODEL,
    max_tokens: 16000,
    betas: [BETA_FALLBACK],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SKEMA_KUNCI } },
    system: 'Anda membaca kunci jawaban tes pilihan ganda dari sebuah gambar untuk guru. Jangan menebak: bila sebuah nomor tidak terlihat jelas, beri pilihan 0 dan jelaskan di catatan.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        {
          type: 'text',
          text: `Gambar ini berisi kunci jawaban untuk soal nomor ${daftar} (${nomor.length} soal), pilihan 1 sampai ${opsi}. ` +
            'Bentuk kunci bisa berupa tabel nomor-jawaban, daftar tulisan tangan, atau lembar jawaban yang bulatannya dihitamkan. ' +
            `Kembalikan satu entri untuk setiap nomor ${daftar}. Jawaban berupa huruf (a/b/c/d) atau angka lingkaran (①②③④) ubah ke angka 1-${opsi}. ` +
            'Bila nomor tidak ada atau tidak terbaca, pilihan = 0. Ringkasan: satu kalimat tentang bentuk kunci dan masalah yang ditemui.',
        },
      ],
    }],
  };
}

export function buildNamaRequest({ base64, mediaType }) {
  return {
    model: MODEL,
    max_tokens: 4000,
    betas: [BETA_FALLBACK],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SKEMA_NAMA } },
    system: 'Anda membaca tulisan tangan nama siswa dari potongan kotak "なまえ / Name" pada lembar jawaban tes bahasa Jepang di sebuah LPK di Aceh, Indonesia. Nama bisa ditulis dalam huruf latin, katakana, atau hiragana. Jangan menebak nama yang tidak tertulis.',
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'Baca nama yang ditulis di kotak ini. Abaikan label cetak "なまえ" dan "Name". Bila kosong atau tidak terbaca, terbaca = false.' },
      ],
    }],
  };
}

async function call(body) {
  const c = getClient();
  let res;
  try {
    res = await c.beta.messages.create(body);
  } catch (e) {
    // Bila akun/endpoint menolak parameter fallbacks, ulangi tanpa parameter itu.
    if (e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) {
      const { betas, fallbacks, ...rest } = body; void betas; void fallbacks;
      res = await c.messages.create(rest);
    } else throw e;
  }
  if (res.stop_reason === 'refusal') throw Object.assign(new Error('Permintaan ditolak oleh model'), { status: 422, kode: 'ditolak' });
  if (res.stop_reason === 'max_tokens') throw Object.assign(new Error('Jawaban model terpotong'), { status: 502, kode: 'terpotong' });
  const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { data: JSON.parse(text), model: res.model, usage: res.usage };
}

export async function bacaKunci(args) {
  const r = await call(buildKunciRequest(args));
  const valid = new Set(args.nomor);
  const jawaban = {};
  const catatan = {};
  for (const j of r.data.jawaban) {
    if (!valid.has(j.no)) continue;
    jawaban[j.no] = j.pilihan >= 1 && j.pilihan <= args.opsi ? j.pilihan : null;
    if (j.catatan) catatan[j.no] = j.catatan;
  }
  for (const no of args.nomor) if (!(no in jawaban)) jawaban[no] = null;
  return { jawaban, catatan, ringkasan: r.data.ringkasan, model: r.model };
}

export async function bacaNama(args) {
  const r = await call(buildNamaRequest(args));
  return { ...r.data, model: r.model };
}

export function errorInfo(e) {
  if (e.kode) return { status: e.status, kode: e.kode, pesan: e.message };
  if (e instanceof Anthropic.AuthenticationError) return { status: 401, kode: 'key_salah', pesan: 'API key ditolak. Periksa ANTHROPIC_API_KEY di file .env.' };
  if (e instanceof Anthropic.RateLimitError) return { status: 429, kode: 'batas', pesan: 'Terlalu banyak permintaan. Coba lagi sebentar.' };
  if (e instanceof Anthropic.APIConnectionError) return { status: 503, kode: 'offline', pesan: 'Tidak bisa menghubungi Claude API (internet?).' };
  if (e instanceof Anthropic.APIError) return { status: 502, kode: 'api', pesan: `Claude API galat ${e.status}` };
  if (e instanceof SyntaxError) return { status: 502, kode: 'format', pesan: 'Jawaban model tidak berformat JSON yang benar' };
  return { status: 500, kode: 'server', pesan: e.message };
}
