// POST /api/ask { topic, context, question, stats, headlines[] }
// Tanya-jawab atas data pantauan. Jawaban hanya boleh bersumber dari data yang dikirim.
import { geminiJson, hasGemini } from './_lib/gemini.js';
import { methodGuard, readJson, send, type Req, type Res } from './_lib/http.js';

export const config = { maxDuration: 60 };

interface AskBody {
  topic: string;
  context?: string;
  question: string;
  stats: unknown;
  headlines: { n: number; title: string; outlet: string; date: string; sentiment: string; issue: string }[];
}

export default async function handler(req: Req, res: Res) {
  if (!methodGuard(req, res, 'POST')) return;
  let b: AskBody;
  try {
    b = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Body JSON tidak valid' });
  }
  const q = String(b.question || '').trim().slice(0, 500);
  if (!q) return send(res, 400, { error: 'Pertanyaan kosong' });
  if (!hasGemini()) return send(res, 200, { answer: null, error: 'Pertanyaan bebas membutuhkan GEMINI_API_KEY di server.' });

  const prompt = `Anda analis social listening DNVB Indonesia. Jawab pertanyaan pengguna HANYA berdasarkan data di bawah (jangan menambah fakta dari luar).
Gunakan Bahasa Indonesia ringkas (maks 120 kata). Rujuk berita dengan nomor dalam kurung siku, mis. [3]. Jangan gunakan karakter em dash.
Jika data tidak cukup untuk menjawab, katakan apa yang kurang.

Brand: ${b.topic}
${b.context ? 'Konteks: ' + b.context : ''}
Statistik: ${JSON.stringify(b.stats).slice(0, 4000)}
Unggahan/berita:
${(b.headlines || []).slice(0, 80).map((h) => `[${h.n}] ${h.date} | ${h.sentiment} | ${h.issue} | ${h.title} (${h.outlet})`).join('\n')}

Pertanyaan: ${q}`;
  try {
    const out = await geminiJson<{ answer: string; refs: number[] }>(
      prompt,
      { type: 'OBJECT', properties: { answer: { type: 'STRING' }, refs: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['answer', 'refs'] },
      { temperature: 0.2, timeoutMs: 40000 },
    );
    return send(res, 200, { answer: out.answer, refs: out.refs || [] });
  } catch (e: any) {
    return send(res, 200, { answer: null, error: String(e?.message || e) });
  }
}
