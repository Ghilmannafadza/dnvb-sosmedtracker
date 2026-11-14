import { XMLParser } from 'fast-xml-parser';
import type { RawItem, TopicQuery } from '../../shared/types.js';
import { domainOf, fetchJson, fetchText, hashId, stripHtml, toIso } from './http.js';
import { tierOf } from './media.js';
import { gdeltQuery, pool, splitWindows, webQuery, ymd } from './query.js';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });

const txt = (v: any): string => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? '') : String(v));
const asArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export function parseGoogleNewsRss(xml: string): RawItem[] {
  const doc = parser.parse(xml);
  const items = asArray<any>(doc?.rss?.channel?.item);
  return items.map((it) => {
    const outlet = txt(it.source) || 'Google News';
    const siteUrl = typeof it.source === 'object' ? it.source['@_url'] || '' : '';
    let title = stripHtml(txt(it.title));
    const suffix = ' - ' + outlet;
    if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
    const domain = domainOf(siteUrl);
    const link = txt(it.link);
    return {
      id: 'gn_' + hashId(txt(it.guid) || link),
      source: 'googlenews',
      channel: 'news',
      outlet,
      domain,
      url: link,
      title,
      snippet: '',
      publishedAt: toIso(txt(it.pubDate)),
      tier: tierOf(domain),
      kind: 'article',
    } satisfies RawItem;
  });
}

export interface GnStats {
  requests: number;
  split: number;
  saturated: number;
  failed: number;
  queries: number;
}

/** Batas jumlah hasil Google News RSS per permintaan; jendela yang mendekati ini dianggap jenuh */
export const GN_CAP = 100;
const SATURATED = 85;
const DAY = 86400000;

/**
 * Google News maksimal:
 * - setiap kata kunci dicari terpisah (OR panjang cepat jenuh di batas ±100 hasil);
 * - rentang dipecah per minggu, dan jendela yang jenuh (≥85 hasil) dipecah lagi sampai per hari;
 * - edisi Indonesia (dipecah adaptif) + edisi Inggris-Indonesia dan Inggris global (per bulan);
 * - anggaran permintaan & batas waktu agar muat di fungsi serverless 60 detik.
 */
export async function googleNews(q: TopicQuery, from: string, to: string, opts: { budget?: number; deadline?: number } = {}): Promise<{ items: RawItem[]; stats: GnStats }> {
  const budget = opts.budget ?? Number(process.env.GN_MAX_REQUESTS || 160);
  const deadline = opts.deadline ?? Date.now() + 50000;
  const kws = (q.keywords || []).filter(Boolean);
  const subs: TopicQuery[] = kws.length > 1 ? kws.map((k) => ({ ...q, keywords: [k] })) : [q];
  const editions = [
    { hl: 'id', gl: 'ID', ceid: 'ID:id', adaptive: true, step: 7 },
    { hl: 'en-ID', gl: 'ID', ceid: 'ID:en', adaptive: false, step: 30 },
    { hl: 'en-US', gl: 'US', ceid: 'US:en', adaptive: false, step: 45 },
  ];
  const f0 = new Date(from).getTime();
  const t0 = new Date(to).getTime();
  type Job = { q: string; e: (typeof editions)[number]; from: number; to: number };
  const queue: Job[] = [];
  for (const sq of subs) {
    const base = webQuery(sq);
    for (const e of editions) {
      const step = e.step * DAY;
      for (let s = f0; s < t0; s += step) queue.push({ q: base, e, from: s, to: Math.min(t0, s + step) });
      if (t0 <= f0) queue.push({ q: base, e, from: f0, to: f0 + DAY });
    }
  }
  // Edisi Indonesia didahulukan
  queue.sort((a, b) => Number(b.e.adaptive) - Number(a.e.adaptive));
  const stats: GnStats = { requests: 0, split: 0, saturated: 0, failed: 0, queries: subs.length };
  const byId = new Map<string, RawItem>();
  const worker = async () => {
    while (queue.length && stats.requests < budget && Date.now() < deadline) {
      const j = queue.shift()!;
      stats.requests++;
      const query = `${j.q} after:${ymd(new Date(j.from))} before:${ymd(new Date(j.to + DAY))}`;
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${j.e.hl}&gl=${j.e.gl}&ceid=${j.e.ceid}`;
      let items: RawItem[] = [];
      try {
        items = parseGoogleNewsRss(await fetchText(url, { timeoutMs: 12000 }));
      } catch {
        stats.failed++;
        continue;
      }
      for (const it of items) if (!byId.has(it.id)) byId.set(it.id, it);
      if (items.length >= SATURATED) {
        stats.saturated++;
        if (j.e.adaptive && j.to - j.from > DAY * 1.5) {
          // Jendela jenuh: pecah dua, kerjakan lebih dulu
          const mid = j.from + Math.max(1, Math.floor((j.to - j.from) / 2 / DAY)) * DAY;
          queue.unshift({ ...j, from: j.from, to: mid }, { ...j, from: mid, to: j.to });
          stats.split++;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: 5 }, worker));
  if (!byId.size && stats.failed && stats.failed === stats.requests) throw new Error('Google News tidak bisa diakses (semua permintaan gagal)');
  return { items: [...byId.values()], stats };
}

export function parseBingRss(xml: string): RawItem[] {
  const doc = parser.parse(xml);
  const items = asArray<any>(doc?.rss?.channel?.item);
  return items.map((it) => {
    let link = txt(it.link);
    try {
      const u = new URL(link);
      const real = u.searchParams.get('url');
      if (real) link = real;
    } catch {
      /* biarkan */
    }
    const domain = domainOf(link);
    const img = txt(it['News:Image']) || txt(it['news:image']);
    return {
      id: 'bn_' + hashId(link),
      source: 'bingnews',
      channel: 'news',
      outlet: txt(it['News:Source']) || txt(it['news:source']) || domain,
      domain,
      url: link,
      title: stripHtml(txt(it.title)),
      snippet: stripHtml(txt(it.description)),
      publishedAt: toIso(txt(it.pubDate)),
      image: img || undefined,
      tier: tierOf(domain),
      kind: 'article',
    } satisfies RawItem;
  });
}

export async function bingNews(q: TopicQuery): Promise<RawItem[]> {
  const query = webQuery(q);
  const pages = [1, 11, 21, 31, 41];
  const res = await pool(pages, 3, async (first) => {
    const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss&setlang=id-ID&cc=ID&first=${first}`;
    try {
      return parseBingRss(await fetchText(url, { timeoutMs: 12000 }));
    } catch (e) {
      if (first === 1) throw e;
      return [];
    }
  });
  return res.flat();
}

export function parseGdelt(json: any): RawItem[] {
  return asArray<any>(json?.articles).map((a) => {
    const domain = (a.domain || domainOf(a.url) || '').replace(/^www\./, '');
    return {
      id: 'gd_' + hashId(a.url),
      source: 'gdelt',
      channel: 'news',
      outlet: domain,
      domain,
      url: a.url,
      title: stripHtml(a.title || ''),
      snippet: '',
      publishedAt: toIso(a.seendate),
      image: a.socialimage || undefined,
      tier: tierOf(domain),
      kind: 'article',
    } satisfies RawItem;
  });
}

const gdeltDate = (d: Date) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);

export async function gdelt(q: TopicQuery, from: string, to: string): Promise<RawItem[]> {
  // DOC API GDELT hanya mencakup ±3 bulan terakhir
  const min = Date.now() - 88 * 86400000;
  const f = new Date(Math.max(new Date(from).getTime(), min));
  const t = new Date(to);
  if (f >= t) return [];
  const url =
    'https://api.gdeltproject.org/api/v2/doc/doc?mode=ArtList&format=json&maxrecords=250&sort=DateDesc' +
    `&startdatetime=${gdeltDate(f)}&enddatetime=${gdeltDate(t)}&query=${encodeURIComponent(gdeltQuery(q))}`;
  const text = await fetchText(url, { timeoutMs: 20000 });
  if (!text.trim().startsWith('{')) throw new Error('GDELT: ' + text.slice(0, 140));
  return parseGdelt(JSON.parse(text));
}

/** Ambil meta description artikel untuk memperkaya analisis (opsional, best-effort). */
export async function enrichSnippets(items: RawItem[], max = 25) {
  const targets = items.filter((i) => !i.snippet && i.url && !i.url.includes('news.google.com')).slice(0, max);
  await pool(targets, 6, async (it) => {
    try {
      const html = await fetchText(it.url, { timeoutMs: 6000 });
      const m =
        html.match(/<meta[^>]+(?:name|property)=["'](?:og:description|description)["'][^>]+content=["']([^"']+)/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:og:description|description)/i);
      if (m) it.snippet = stripHtml(m[1]).slice(0, 400);
    } catch {
      /* abaikan */
    }
  });
  return items;
}

export { fetchJson };
