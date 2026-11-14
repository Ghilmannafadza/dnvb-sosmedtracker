// Klien AI terpadu.
// Prioritas: SumoPod (gateway OpenAI-compatible, SUMOPOD_API_KEY) lalu Google Gemini langsung
// (GEMINI_API_KEY). Tanpa keduanya, aplikasi memakai mesin leksikon.
// Nama fungsi lama (geminiJson, hasGemini) dipertahankan agar endpoint lain tidak berubah.

const SUMO_BASE = () => (process.env.SUMOPOD_BASE_URL || 'https://ai.sumopod.com/v1').replace(/\/$/, '');
export const sumoChatModel = () => process.env.SUMOPOD_CHAT_MODEL || 'gemini/gemini-3.1-flash-lite';
export const sumoEmbedModel = () => process.env.SUMOPOD_EMBED_MODEL || 'gemini/gemini-embedding-001';
const hasSumo = () => Boolean(process.env.SUMOPOD_API_KEY);

export const aiProvider = (): 'sumopod' | 'gemini' | 'lexicon' => (hasSumo() ? 'sumopod' : process.env.GEMINI_API_KEY ? 'gemini' : 'lexicon');
export const geminiModel = () => (hasSumo() ? sumoChatModel() : process.env.GEMINI_MODEL || 'gemini-2.5-flash');
export const hasGemini = () => aiProvider() !== 'lexicon';
export const hasEmbeddings = () => hasSumo();

/** Pedoman gaya produk: tanpa em dash pada teks yang tampil di UI */
const noEmDash = (t: string) => t.replace(/\s*—\s*/g, ', ');

/** Ubah skema gaya Gemini (type: 'OBJECT') menjadi JSON Schema biasa untuk ditulis di prompt. */
function toJsonSchema(s: any): any {
  if (Array.isArray(s)) return s.map(toJsonSchema);
  if (!s || typeof s !== 'object') return s;
  const out: any = {};
  for (const [k, v] of Object.entries(s)) out[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : toJsonSchema(v);
  return out;
}

function parseJsonLoose<T>(text: string): T {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t) as T;
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1)) as T;
    throw new Error('Respon AI bukan JSON');
  }
}

async function sumoChatJson<T>(prompt: string, schema: object, temperature: number, timeoutMs: number): Promise<T> {
  const body = {
    model: sumoChatModel(),
    temperature,
    max_tokens: 8000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Kamu adalah mesin analisis yang SELALU membalas dengan satu objek JSON valid tanpa teks lain, sesuai JSON Schema yang diberikan.' },
      { role: 'user', content: `${prompt}\n\nBalas HANYA dengan JSON yang sesuai JSON Schema berikut:\n${JSON.stringify(toJsonSchema(schema))}` },
    ],
  };
  const r = await fetch(`${SUMO_BASE()}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUMOPOD_API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SumoPod ${r.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 160)}`);
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('SumoPod tidak mengembalikan konten');
  return parseJsonLoose<T>(noEmDash(text));
}

async function geminiDirectJson<T>(prompt: string, schema: object, temperature: number, timeoutMs: number): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent?key=${key}`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, responseMimeType: 'application/json', responseSchema: schema },
    }),
  });
  const data: any = await r.json();
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${data?.error?.message || 'error'}`);
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini tidak mengembalikan konten');
  return parseJsonLoose<T>(noEmDash(text));
}

export async function geminiJson<T>(prompt: string, schema: object, opts: { temperature?: number; timeoutMs?: number } = {}): Promise<T> {
  const temperature = opts.temperature ?? 0.2;
  const timeoutMs = opts.timeoutMs ?? 50000;
  const p = aiProvider();
  if (p === 'sumopod') return sumoChatJson<T>(prompt, schema, temperature, timeoutMs);
  if (p === 'gemini') return geminiDirectJson<T>(prompt, schema, temperature, timeoutMs);
  throw new Error('Kunci AI belum diisi (SUMOPOD_API_KEY atau GEMINI_API_KEY)');
}

/* --------------------------------- Vision --------------------------------- */

export const hasVision = () => aiProvider() !== 'lexicon' && process.env.PHOTO_VISION !== '0';

/** Tanya model multimodal tentang satu gambar (data URL), balasan JSON. */
export async function visionJson<T>(prompt: string, dataUrl: string, schema: object, timeoutMs = 20000): Promise<T> {
  const p = aiProvider();
  const full = `${prompt}\n\nBalas HANYA dengan JSON yang sesuai JSON Schema berikut:\n${JSON.stringify(toJsonSchema(schema))}`;
  if (p === 'sumopod') {
    const r = await fetch(`${SUMO_BASE()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUMOPOD_API_KEY}` },
      body: JSON.stringify({
        model: sumoChatModel(),
        temperature: 0,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: [{ type: 'text', text: full }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`SumoPod vision ${r.status}: ${data?.error?.message || ''}`);
    return parseJsonLoose<T>(data?.choices?.[0]?.message?.content || '');
  }
  if (p === 'gemini') {
    const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!m) throw new Error('Gambar bukan data URL');
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel()}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: full }, { inlineData: { mimeType: m[1], data: m[2] } }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      }),
    });
    const data: any = await r.json();
    if (!r.ok) throw new Error(`Gemini vision ${r.status}`);
    return parseJsonLoose<T>(data?.candidates?.[0]?.content?.parts?.map((x: any) => x.text || '').join('') || '');
  }
  throw new Error('AI tidak aktif');
}

/* -------------------------------- Embeddings -------------------------------- */

export async function embed(texts: string[], timeoutMs = 30000): Promise<number[][]> {
  if (!hasSumo()) throw new Error('SUMOPOD_API_KEY belum diisi');
  const r = await fetch(`${SUMO_BASE()}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUMOPOD_API_KEY}` },
    body: JSON.stringify({ model: sumoEmbedModel(), input: texts }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Embedding ${r.status}: ${data?.error?.message || JSON.stringify(data).slice(0, 160)}`);
  const rows: any[] = data?.data || [];
  return rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding as number[]);
}

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
