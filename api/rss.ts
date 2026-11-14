// GET  /api/rss?info=1     jumlah bagian penemuan + feed pasti dari katalog
// GET  /api/rss?part=i     temukan feed untuk satu bagian katalog (12 situs)
// GET  /api/rss            daftar lengkap feed hasil penemuan (direktori + feed tetap) dan statistiknya
// POST /api/rss { feeds[] (maks 60), search?, queries, from, to }
//      baca sekumpulan feed, kembalikan sebutan yang cocok dengan query topik.
//      search=true menambahkan feed pencarian WordPress (arsip artikel yang cocok kata kunci).
import type { TopicQuery } from '../shared/types.js';
import { readJson, send, type Req, type Res } from './_lib/http.js';
import { discoverPart, discoveryInfo, readFeeds, resolveFeeds, searchFeedUrls } from './_lib/rss.js';

export const config = { maxDuration: 60 };

export default async function handler(req: Req, res: Res) {
  const t0 = Date.now();
  if (req.method === 'GET') {
    const sp = new URL(req.url || '/', 'http://x').searchParams;
    // Penemuan bertahap dari browser: ?info=1 lalu ?part=0..N-1
    if (sp.get('info')) return send(res, 200, discoveryInfo());
    if (sp.get('part') != null) return send(res, 200, await discoverPart(Number(sp.get('part')) || 0, t0 + 50000));
    const force = sp.get('force') === '1';
    const r = await resolveFeeds({ force, deadline: t0 + 45000 });
    return send(res, 200, { feeds: r.feeds, stats: r.stats, cachedAt: new Date(r.at).toISOString() });
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Gunakan GET atau POST' });
  let b: { feeds?: string[]; search?: boolean; queries: TopicQuery[]; from: string; to: string };
  try {
    b = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Body JSON tidak valid' });
  }
  const queries = (b.queries || []).filter((q) => q?.keywords?.length);
  if (!queries.length) return send(res, 400, { error: 'Minimal satu kata kunci' });
  const feeds = [...(b.search ? searchFeedUrls(queries) : []), ...(b.feeds || []).filter((u) => /^https?:\/\//.test(u)).slice(0, 60)];
  const r = await readFeeds(feeds, queries, b.from, b.to, t0 + 52000);
  send(res, 200, { ...r, tookMs: Date.now() - t0 });
}
