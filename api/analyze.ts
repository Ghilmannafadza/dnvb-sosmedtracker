// POST /api/analyze { topic, context, items[] (maks 25) }
// Analisis per item: relevansi, sentimen terhadap entitas, kategori isu, tokoh, organisasi, lokasi.
import { ISSUE_CATEGORIES, type AnalyzeRequest, type AnalyzeResponse, type ItemAnalysis } from '../shared/types.js';
import { geminiJson, hasGemini } from './_lib/gemini.js';
import { methodGuard, readJson, send, type Req, type Res } from './_lib/http.js';
import { lexiconAnalyze } from './_lib/lexicon.js';

export const config = { maxDuration: 60 };

const SENT = { type: 'STRING', enum: ['positive', 'neutral', 'negative'] };

const schema = {
  type: 'OBJECT',
  properties: {
    results: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          relevant: { type: 'BOOLEAN' },
          sentiment: SENT,
          score: { type: 'NUMBER' },
          reason: { type: 'STRING' },
          issue: { type: 'STRING', enum: [...ISSUE_CATEGORIES] },
          subIssue: { type: 'STRING' },
          persons: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { name: { type: 'STRING' }, role: { type: 'STRING' }, org: { type: 'STRING' }, stance: SENT, quote: { type: 'STRING' } },
              required: ['name'],
            },
          },
          organizations: { type: 'ARRAY', items: { type: 'STRING' } },
          locations: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['id', 'relevant', 'sentiment', 'score', 'issue', 'persons', 'organizations', 'locations'],
      },
    },
  },
  required: ['results'],
};

function prompt(r: AnalyzeRequest) {
  const lines = r.items
    .map((i) => {
      const body = (i.body || '').replace(/\s+/g, ' ').slice(0, 2200);
      return `### [${i.id}] ${i.channel === 'social' ? 'SOSMED' : 'MEDIA WEB'} | ${i.outlet}
TEKS/JUDUL: ${i.title}${i.snippet ? `\nCUPLIKAN: ${i.snippet.slice(0, 400)}` : ''}${body ? `\nISI: ${body}` : ''}`;
    })
    .join('\n\n');
  return `Anda analis social listening untuk brand di Indonesia (agensi DNVB Indonesia). Anda membaca percakapan warganet
(Instagram, TikTok, Threads, YouTube, termasuk komentar) dan pemberitaan media web, lalu menilai sentimennya terhadap BRAND.
BRAND: "${r.topic}"
${r.context ? 'PROFIL BRAND: ' + r.context : ''}
${r.keywords?.length ? 'KATA KUNCI BRAND: ' + r.keywords.join(', ') : ''}

Untuk SETIAP item, isi:
- relevant: true HANYA jika item membahas, menyebut, menandai (@akun / #hashtag), atau mengomentari BRAND di atas (atau produk/program resminya).
  false jika: nama sama milik pihak lain (homonim), konten umum tanpa menyebut brand, spam/judi online/promosi tidak terkait,
  halaman indeks/kumpulan berita, atau brand hanya muncul di tautan "Baca juga".
- sentiment: sentimen TERHADAP BRAND, bukan nada umum. Pahami bahasa warganet: slang ("mantul", "zonk", "worth it", "kapok"),
  sarkasme ("bagus banget ya, nunggu sebulan belum dikirim" = negative), emoji, dan campuran Indonesia-Inggris.
  Pujian, rekomendasi, testimoni puas, liputan prestasi = positive. Keluhan, kritik, kekecewaan, tuduhan, krisis = negative.
  Informasi/pertanyaan/pengumuman tanpa penilaian = neutral.
- score: -1 (sangat negatif) sampai 1 (sangat positif). reason: alasan maks 15 kata (sebut kata/kalimat pemicunya).
- issue: satu kategori yang tersedia. subIssue: label isu spesifik 2-5 kata (mis. "Respons admin lambat", "Harga kelas mahal").
- persons: tokoh (nama orang) yang disebut dan berperan: founder/CEO, kreator/influencer, narasumber, pejabat.
  * name: nama lengkap paling lengkap di teks (tanpa gelar). Username akun (@...) BOLEH dipakai bila hanya itu identitasnya.
  * role: jabatan/peran persis dari teks (mis. "Founder DNVB", "Content creator", "Host Forum Gosip").
  * org: lembaga/brand tempat tokoh bernaung. stance: sikap tokoh terhadap brand. quote: inti pernyataan (maks 25 kata) bila ada.
  JANGAN masukkan wartawan/penulis/editor, nama di tautan "Baca juga", atau nama yang tidak tertulis di teks.
- organizations: brand/perusahaan/lembaga yang disebut. locations: kota/provinsi/negara.

ITEM:
${lines}`;
}

const normTxt = (s: string) => ' ' + s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';

/** Buang tokoh hasil AI yang namanya tidak benar-benar tertulis di teks (penjaga halusinasi). */
function inText(name: string, hay: string) {
  const tokens = normTxt(name).trim().split(' ').filter((t) => t.length > 2);
  if (!tokens.length) return false;
  const found = tokens.filter((t) => hay.includes(' ' + t + ' ')).length;
  return found >= Math.min(2, tokens.length);
}

export default async function handler(req: Req, res: Res) {
  if (!methodGuard(req, res, 'POST')) return;
  let body: AnalyzeRequest;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Body JSON tidak valid' });
  }
  const items = (body.items || []).slice(0, 30);
  const lex = (i: (typeof items)[number]) => lexiconAnalyze(i.id, i.title, `${i.snippet || ''}\n${i.body || ''}`);
  const fallback = (): ItemAnalysis[] => items.map(lex);

  if (!hasGemini()) return send(res, 200, { results: fallback(), engine: 'lexicon' } satisfies AnalyzeResponse);

  try {
    const out = await geminiJson<{ results: ItemAnalysis[] }>(prompt({ ...body, items }), schema);
    const byId = new Map(out.results.map((r) => [r.id, r]));
    const results = items.map((i) => {
      const r = byId.get(i.id);
      if (!r) return lex(i);
      const hay = normTxt(`${i.title} ${i.snippet || ''} ${i.body || ''}`);
      return {
        ...r,
        score: Math.max(-1, Math.min(1, Number(r.score) || 0)),
        persons: (r.persons || [])
          .filter((p) => p.name && p.name.length > 2 && inText(p.name, hay))
          .map((p) => ({ ...p, name: p.name.replace(/^(H|Hj|Dr|Drs|Ir|Prof)\.?\s+/i, '').replace(/,\s*(S\.|M\.|SE|SH|ST|MM|MBA|SIP|Ph\.?D).*$/i, '').trim() }))
          .slice(0, 12),
        organizations: (r.organizations || []).slice(0, 8),
        locations: (r.locations || []).slice(0, 8),
        engine: 'gemini' as const,
      };
    });
    return send(res, 200, { results, engine: 'gemini' } satisfies AnalyzeResponse);
  } catch (e: any) {
    return send(res, 200, { results: fallback(), engine: 'lexicon', error: String(e?.message || e) } satisfies AnalyzeResponse);
  }
}
