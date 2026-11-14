// POST /api/collect  { source, query, from, to, deep? }
//      /api/collect  { source: 'tiktok' | 'instagram', comments: [{ url, title }] }  → komentar unggahan (Apify)
// Mengumpulkan sebutan dari satu sumber. Frontend memanggil endpoint ini paralel per sumber
// agar setiap sumber punya batas waktu sendiri dan progresnya bisa ditampilkan.
import { ALL_SOURCE_KEYS, type CollectResponse, type RawItem, type SourceKey, type TopicQuery } from '../shared/types.js';
import { methodGuard, readJson, send, type Req, type Res } from './_lib/http.js';
import { bingNews, gdelt, googleNews } from './_lib/news.js';
import { guardrailReason } from '../shared/guardrails.js';
import { dedupe, matchesQuery } from './_lib/query.js';
import { runSource } from './_lib/reach.js';
import { apifyComments } from './_lib/social.js';

export const config = { maxDuration: 60 };

const VALID: SourceKey[] = ALL_SOURCE_KEYS;

export default async function handler(req: Req, res: Res) {
  if (!methodGuard(req, res, 'POST')) return;
  const t0 = Date.now();
  let body: { source: SourceKey; query: TopicQuery; from: string; to: string; deep?: boolean; comments?: { url: string; title: string }[] };
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Body JSON tidak valid' });
  }
  const { source, query } = body;
  if (!VALID.includes(source)) return send(res, 400, { error: 'Sumber tidak dikenal' });
  if (Array.isArray(body.comments)) {
    if (source !== 'tiktok' && source !== 'instagram') return send(res, 400, { error: 'Komentar hanya untuk TikTok dan Instagram' });
    try {
      const items = (await apifyComments(source, body.comments)).filter((i) => !guardrailReason(i.title, '', ''));
      return send(res, 200, { source, items, ok: true, via: 'Apify (komentar)', tookMs: Date.now() - t0 } satisfies CollectResponse);
    } catch (e: any) {
      return send(res, 200, { source, items: [], ok: false, error: String(e?.message || e), tookMs: Date.now() - t0 } satisfies CollectResponse);
    }
  }
  if (!query?.keywords?.filter(Boolean).length) return send(res, 400, { error: 'Minimal satu kata kunci' });
  const to = body.to ? new Date(body.to) : new Date();
  to.setHours(23, 59, 59, 999);
  const from = body.from ? new Date(body.from) : new Date(Date.now() - 30 * 86400000);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  let via: string | undefined;
  let gnNote: string | undefined;
  let tried: string[] | undefined;
  try {
    let items: RawItem[] = [];
    switch (source) {
      case 'googlenews': {
        const g = await googleNews(query, fromIso, toIso, { deadline: t0 + 52000 });
        items = g.items;
        gnNote = `${g.stats.requests} permintaan, ${g.stats.queries} kata kunci × 3 edisi, ${g.stats.split} jendela jenuh dipecah${g.stats.failed ? `, ${g.stats.failed} gagal` : ''}`;
        break;
      }
      case 'bingnews':
        items = await bingNews(query);
        break;
      case 'gdelt':
        items = await gdelt(query, fromIso, toIso);
        break;
      default: {
        // Media sosial & sumber Agent Reach: jalur berurutan, yang pertama berhasil dipakai
        const r = await runSource(source, { q: query, from: fromIso, to: toIso }, { deadline: t0 + 55000 });
        items = r.items;
        via = r.via;
        tried = r.tried;
      }
    }

    const f = from.getTime();
    const tt = to.getTime();
    let blocked = 0;
    items = dedupe(items).filter((i) => {
      const d = new Date(i.publishedAt).getTime();
      if (d < f || d > tt) return false;
      // Pagar pembatas: iklan properti, lowongan, marketplace, spam
      if (guardrailReason(i.title, i.snippet, i.url)) {
        blocked++;
        return false;
      }
      // Komentar YouTube sudah pasti berada di video yang relevan
      if (i.kind === 'comment') return true;
      // Google News: judul sering tidak memuat kata kunci; relevansi dinilai ulang dari isi artikel di /api/enrich
      if (source === 'googlenews' || source === 'gdelt') return true;
      return matchesQuery(i, query, source !== 'bingnews');
    });

    const out: CollectResponse = { source, items, ok: true, tookMs: Date.now() - t0, blocked, via, tried };
    if (source === 'gdelt' && from.getTime() < Date.now() - 88 * 86400000)
      out.note = 'GDELT hanya mencakup ±3 bulan terakhir';
    if (source === 'bingnews') out.note = 'Bing News hanya mengembalikan berita terbaru (tanpa filter tanggal di sumber)';
    if (via) out.note = `lewat ${via}`;
    if (gnNote) out.note = `Google News: ${gnNote}`;
    return send(res, 200, out);
  } catch (e: any) {
    const out: CollectResponse = { source, items: [], ok: false, error: String(e?.message || e), tookMs: Date.now() - t0 };
    return send(res, 200, out);
  }
}
