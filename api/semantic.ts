// POST /api/semantic { topic, context, keywords, excludes, items[{id,text}] (maks 60) }
// Saringan makna (embedding, model default gemini/gemini-embedding-001 lewat SumoPod).
// Tiap sebutan dibandingkan dengan profil brand DAN dengan beberapa "profil tandingan"
// (iklan properti, lowongan, homonim nama tempat, dst.). Sebutan yang lebih mirip profil
// tandingan, atau terlalu jauh dari profil brand, ditandai tidak relevan. Perbandingan relatif
// ini tidak bergantung pada kalibrasi angka absolut model embedding.
import { cosine, embed, hasEmbeddings, sumoEmbedModel } from './_lib/gemini.js';
import { methodGuard, readJson, send, type Req, type Res } from './_lib/http.js';

export const config = { maxDuration: 60 };

const ANTI = [
  'Iklan sewa rumah, kontrakan, kos-kosan, ruko, apartemen, properti dijual, lokasi strategis, hubungi WA',
  'Spam judi online, slot gacor, togel, maxwin, link alternatif, deposit pulsa',
  'Lowongan kerja umum dari perusahaan lain, info loker, cara melamar, syarat pendaftaran',
  'Berita olahraga, sepak bola, pertandingan, klub, skor',
  'Berita kriminal dan politik yang tidak menyebut brand',
];

interface Body {
  topic: string;
  context?: string;
  keywords?: string[];
  excludes?: string[];
  items: { id: string; text: string }[];
}

export default async function handler(req: Req, res: Res) {
  if (!methodGuard(req, res, 'POST')) return;
  if (!hasEmbeddings()) return send(res, 200, { enabled: false, results: [] });
  let b: Body;
  try {
    b = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Body JSON tidak valid' });
  }
  const items = (b.items || []).filter((i) => i.text?.trim()).slice(0, 60);
  if (!items.length) return send(res, 200, { enabled: true, results: [] });
  const profile = `${b.topic}. ${b.context || ''} Kata kunci: ${(b.keywords || []).join(', ')}.`;
  const anti = [...ANTI];
  if (b.excludes?.length) anti.push(`Hal yang bukan ${b.topic}: ${b.excludes.join(', ')}`);
  try {
    const vecs = await embed([profile, ...anti, ...items.map((i) => i.text.slice(0, 1800))]);
    const p = vecs[0];
    const antiV = vecs.slice(1, 1 + anti.length);
    const min = Number(process.env.SEMANTIC_MIN || 0.4);
    const margin = Number(process.env.SEMANTIC_MARGIN || 0.03);
    const results = items.map((it, k) => {
      const v = vecs[1 + anti.length + k];
      const sim = cosine(v, p);
      const antiMax = Math.max(...antiV.map((a) => cosine(v, a)));
      const relevant = sim >= min && sim + margin >= antiMax;
      return { id: it.id, sim: Number(sim.toFixed(3)), anti: Number(antiMax.toFixed(3)), relevant };
    });
    send(res, 200, { enabled: true, model: sumoEmbedModel(), results });
  } catch (e: any) {
    // Saringan makna bersifat tambahan: bila gagal, jangan buang data
    send(res, 200, { enabled: true, error: String(e?.message || e), results: [] });
  }
}
