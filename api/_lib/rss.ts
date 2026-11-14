// RSS maksimal: bukan daftar feed tetap, tetapi PENEMUAN feed.
// 1. Halaman direktori RSS (mis. https://www.antaranews.com/rss dan semua situs Antara daerah)
//    diurai dan SEMUA feed di dalamnya diambil (tautan .xml / /rss / /feed + <link rel="alternate">).
// 2. Feed langsung (RSS 2.0, Atom, RDF) dari media nasional, bisnis/marketing/startup, gaya hidup, dan kreator.
// 3. Feed pencarian WordPress (?s=kata&feed=rss2) dari media bisnis & gaya hidup: mengembalikan artikel lama yang
//    cocok kata kunci, bukan hanya artikel terbaru.
// Feed dibaca bertahap (batch) oleh browser lewat /api/rss agar ratusan feed tetap muat dalam
// batas waktu fungsi serverless.
import type { RawItem, TopicQuery } from '../../shared/types.js';
import { guardrailReason } from '../../shared/guardrails.js';
import { fetchText } from './http.js';
import { matchesQuery, pool, primaryTerms } from './query.js';
import { fromFeed } from './reach.js';
import { ANTARA_REGIONS, KNOWN_FEEDS, SITES } from './media-catalog.js';
import { TIER1, TIER2 } from './media.js';

/** Halaman direktori RSS khusus (selain beranda tiap situs di katalog) */
export const DEFAULT_DIRECTORIES = [
  'https://www.antaranews.com/rss',
  ...ANTARA_REGIONS.map((r) => `https://${r}.antaranews.com/rss`),
  'https://rss.detik.com/',
  'https://www.tribunnews.com/rss',
  'https://www.republika.co.id/rss',
  'https://www.suara.com/rss',
  'https://www.sindonews.com/rss',
  'https://www.kompas.com/rss',
  'https://www.liputan6.com/rss',
  'https://www.bisnis.com/rss',
  'https://www.kontan.co.id/rss',
  'https://www.okezone.com/rss',
  'https://www.inews.id/rss',
  'https://www.idntimes.com/rss',
  'https://www.beritasatu.com/rss',
  'https://www.mediaindonesia.com/rss',
  'https://www.thejakartapost.com/rss',
  'https://rri.co.id/rss',
  'https://www.voaindonesia.com/rssfeeds',
];

/** Feed langsung: katalog feed pasti (pola jaringan media) */
export const DEFAULT_FEEDS = KNOWN_FEEDS;

/** Feed pencarian WordPress: {q} diganti kata kunci → arsip artikel yang cocok, bukan hanya terbaru */
export const DEFAULT_SEARCH_FEEDS = [
  'https://www.marketeers.com/?s={q}&feed=rss2',
  'https://swa.co.id/?s={q}&feed=rss2',
  'https://mix.co.id/?s={q}&feed=rss2',
  'https://dailysocial.id/?s={q}&feed=rss2',
  'https://www.hipwee.com/?s={q}&feed=rss2',
  'https://www.whiteboardjournal.com/?s={q}&feed=rss2',
  'https://manual.co.id/?s={q}&feed=rss2',
  'https://infobrand.id/?s={q}&feed=rss2',
  'https://www.goodnewsfromindonesia.id/?s={q}&feed=rss2',
  'https://creativedisc.com/?s={q}&feed=rss2',
];

const list = (env?: string) => (env || '').split(/[,\s]+/).filter((x) => /^https?:\/\//.test(x));
const useDefaults = () => process.env.RSS_DEFAULTS !== '0';
export const rssDirectories = () => [...new Set([...list(process.env.RSS_DIRECTORIES), ...(useDefaults() ? DEFAULT_DIRECTORIES : [])])];
export const rssFeedsConfigured = () => [...new Set([...list(process.env.RSS_FEEDS), ...(useDefaults() ? DEFAULT_FEEDS : [])])];
/** Domain media untuk penemuan feed otomatis: katalog + daftar tier media + RSS_SITES */
export const rssSites = () =>
  [...new Set([...(process.env.RSS_SITES || '').split(/[,\s]+/).filter(Boolean), ...(useDefaults() ? [...SITES, ...TIER1, ...TIER2] : [])].map((d) => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '').toLowerCase()))].filter((d) => /\./.test(d));
export const rssSearchFeeds = () => [...new Set([...list(process.env.RSS_SEARCH_FEEDS).filter((x) => x.includes('{q}')), ...(useDefaults() ? DEFAULT_SEARCH_FEEDS : [])])];

/* --------------------------------- penemuan feed --------------------------------- */

export const looksLikeFeed = (body: string) => /^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<(rss|feed|rdf:RDF)[\s>]/i.test(body.slice(0, 2000));

const siteOf = (u: string) => {
  try {
    const h = new URL(u).hostname.replace(/^www\./, '');
    return h.split('.').slice(-2).join('.');
  } catch {
    return '';
  }
};

/** Semua URL feed di halaman direktori (situs yang sama atau subdomainnya) */
export function discoverFeeds(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const site = siteOf(baseUrl);
  const abs = (h: string) => {
    try {
      return new URL(h.replace(/&amp;/g, '&'), baseUrl).toString();
    } catch {
      return '';
    }
  };
  for (const m of html.matchAll(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
    const href = m[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (href) out.add(abs(href));
  }
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([^<]{0,60})?/gi)) {
    const u = abs(m[1]);
    const label = (m[2] || '').trim();
    if (!u || siteOf(u) !== site) continue;
    const path = (() => {
      try {
        const x = new URL(u);
        return x.pathname + x.search;
      } catch {
        return '';
      }
    })();
    if (
      /\.(xml|rss|atom)(\?|$)/i.test(path) ||
      /\/(rss|feeds?|rssfeeds?)([-_][\w-]*)?(\/[\w\-./]+)?\/?(\?|$)/i.test(path) ||
      /[?&](feed|format|mib)=(rss2?|atom|xml)/i.test(path) ||
      (/^(rss|rss feed|feed rss|atom)$/i.test(label) && !/\/(berita|read|news)\//i.test(path))
    )
      out.add(u);
  }
  out.delete(baseUrl);
  out.delete(baseUrl.replace(/\/$/, ''));
  return [...out].filter((u) => !/\/(comments\/feed|wp-json|oembed)/i.test(u));
}

export interface DiscoverStats {
  sites: number;
  directories: number;
  checked: number;
  reachable: number;
  discovered: number;
  configured: number;
  searchTemplates: number;
}

/** Entri penemuan: halaman direktori (URL) dan domain situs */
export const discoveryEntries = () => [...rssDirectories(), ...rssSites()];
export const PART_SIZE = 12;
export const discoveryParts = () => Math.ceil(discoveryEntries().length / PART_SIZE);

const isDirLike = (u: string) => {
  try {
    const p = new URL(u).pathname;
    return !/\.(xml|rss|atom)$/i.test(p) && /\/(rss|feeds?|rss-feed|rssfeeds|sindikasi)\/?$/i.test(p);
  } catch {
    return false;
  }
};

async function fetchMaybe(u: string, ms = 8000) {
  try {
    return await fetchText(u, { timeoutMs: ms, headers: { Accept: 'text/html,application/rss+xml,application/xml;q=0.9,*/*;q=0.5' } });
  } catch {
    return null;
  }
}

/**
 * Temukan semua feed satu entri. Entri berupa URL direktori, atau domain: beranda, /rss, /feed
 * diperiksa, tautan feed diambil, halaman direktori RSS di dalamnya ditelusuri satu tingkat lagi.
 * Bila tidak ada sama sekali, pola umum (/rss.xml, /feed.xml, /index.xml, ?feed=rss2) dicoba.
 */
export async function discoverEntry(entry: string): Promise<{ feeds: string[]; reachable: boolean }> {
  const isUrl = /^https?:\/\//.test(entry);
  const base = isUrl ? '' : `https://${entry}`;
  const start = isUrl ? [entry] : [`${base}/`, `${base}/rss`, `${base}/feed`];
  const feeds = new Set<string>();
  const dirs = new Set<string>();
  let reachable = false;
  const visit = async (u: string) => {
    const body = await fetchMaybe(u);
    if (body == null) return;
    reachable = true;
    if (looksLikeFeed(body)) {
      feeds.add(u);
      return;
    }
    // Feed yang dideklarasikan <link rel="alternate"> selalu dipercaya
    for (const m of body.matchAll(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)) {
      const href = m[0].match(/href=["']([^"']+)["']/i)?.[1];
      if (href)
        try {
          feeds.add(new URL(href.replace(/&amp;/g, '&'), u).toString());
        } catch {
          /* abaikan */
        }
    }
    for (const f of discoverFeeds(body, u)) if (!feeds.has(f)) (isDirLike(f) && !start.includes(f) ? dirs.add(f) : feeds.add(f));
  };
  await Promise.all(start.map(visit));
  // satu tingkat direktori lagi (mis. tautan "RSS" di footer menuju halaman daftar feed)
  await Promise.all([...dirs].filter((d) => !feeds.has(d)).slice(0, 4).map(visit));
  if (!feeds.size && base && reachable) {
    const tries = ['/rss.xml', '/feed.xml', '/index.xml', '/?feed=rss2', '/atom.xml', '/feeds/posts/default'];
    const ok = await Promise.all(tries.map(async (p) => {
      const body = await fetchMaybe(base + p, 6000);
      return body && looksLikeFeed(body) ? base + p : null;
    }));
    const first = ok.find(Boolean);
    if (first) feeds.add(first);
  }
  return { feeds: [...feeds].slice(0, 120), reachable };
}

/** Satu bagian penemuan (dipanggil paralel dari browser) */
export async function discoverPart(i: number, deadline = Date.now() + 50000) {
  const entries = discoveryEntries().slice(i * PART_SIZE, (i + 1) * PART_SIZE);
  let reachable = 0;
  const found = await pool(entries, 6, async (e) => {
    if (Date.now() > deadline) return [] as string[];
    const r = await discoverEntry(e);
    if (r.reachable) reachable++;
    return r.feeds;
  });
  return { feeds: [...new Set(found.flat())], checked: entries.length, reachable };
}

export function discoveryInfo() {
  return {
    parts: discoveryParts(),
    sites: rssSites().length,
    directories: rssDirectories().length,
    known: rssFeedsConfigured(),
    searchTemplates: rssSearchFeeds().length,
  };
}

let discoverCache: { at: number; feeds: string[]; stats: DiscoverStats } | null = null;

/** Daftar lengkap feed dalam satu proses (dipakai /api/collect & jembatan; cache 6 jam). */
export async function resolveFeeds(opts: { force?: boolean; deadline?: number } = {}) {
  if (!opts.force && discoverCache && Date.now() - discoverCache.at < 6 * 3600000) return discoverCache;
  const parts = discoveryParts();
  let checked = 0;
  let reachable = 0;
  const found: string[] = [];
  await pool(Array.from({ length: parts }, (_, i) => i), 4, async (i) => {
    if (opts.deadline && Date.now() > opts.deadline) return;
    const r = await discoverPart(i, opts.deadline);
    checked += r.checked;
    reachable += r.reachable;
    found.push(...r.feeds);
  });
  const discovered = [...new Set(found)];
  const feeds = [...new Set([...rssFeedsConfigured(), ...discovered])];
  const stats: DiscoverStats = { sites: rssSites().length, directories: rssDirectories().length, checked, reachable, discovered: discovered.length, configured: rssFeedsConfigured().length, searchTemplates: rssSearchFeeds().length };
  discoverCache = { at: Date.now(), feeds, stats };
  return discoverCache;
}

/* --------------------------------- membaca feed --------------------------------- */

const feedCache = new Map<string, { at: number; items: RawItem[] }>();

async function readFeed(url: string): Promise<RawItem[] | null> {
  const hit = feedCache.get(url);
  if (hit && Date.now() - hit.at < 10 * 60000) return hit.items;
  try {
    const body = await fetchText(url, { timeoutMs: 9000, headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5' } });
    if (!looksLikeFeed(body)) return null;
    const items = fromFeed(body, url);
    feedCache.set(url, { at: Date.now(), items });
    if (feedCache.size > 2000) feedCache.delete(feedCache.keys().next().value!);
    return items;
  } catch {
    return null;
  }
}

/** Feed pencarian untuk kata kunci topik */
export function searchFeedUrls(queries: TopicQuery[]) {
  const terms = [...new Set(queries.flatMap((q) => primaryTerms(q, 3)))];
  return rssSearchFeeds().flatMap((t) => terms.map((term) => t.replace('{q}', encodeURIComponent(term))));
}

export interface ReadStats {
  feeds: number;
  read: number;
  failed: number;
  scanned: number;
  matched: number;
  blocked: number;
}

/** Baca sekumpulan feed dan kembalikan sebutan yang cocok dengan salah satu query topik. */
export async function readFeeds(feeds: string[], queries: TopicQuery[], from: string, to: string, deadline = Date.now() + 50000) {
  const stats: ReadStats = { feeds: feeds.length, read: 0, failed: 0, scanned: 0, matched: 0, blocked: 0 };
  const f = new Date(from).getTime();
  const t = new Date(to).getTime() + 86400000;
  const seen = new Set<string>();
  const out: RawItem[] = [];
  await pool(feeds, 16, async (u) => {
    if (Date.now() > deadline) {
      stats.failed++;
      return;
    }
    const items = await readFeed(u);
    if (!items) {
      stats.failed++;
      return;
    }
    stats.read++;
    for (const it of items) {
      stats.scanned++;
      const key = it.url || it.title;
      if (seen.has(key)) continue;
      seen.add(key);
      const d = new Date(it.publishedAt).getTime();
      if (d < f || d > t) continue;
      if (guardrailReason(it.title, it.snippet, it.url)) {
        stats.blocked++;
        continue;
      }
      if (!queries.some((q) => matchesQuery(it, q, true))) continue;
      out.push(it);
    }
  });
  stats.matched = out.length;
  return { items: out, stats };
}

/** Satu panggilan penuh (dipakai /api/collect & jembatan): temukan feed lalu baca semua dalam batas waktu */
export async function rssAll(q: TopicQuery, from: string, to: string, deadline = Date.now() + 52000) {
  const { feeds } = await resolveFeeds({ deadline: deadline - 25000 });
  return readFeeds([...searchFeedUrls([q]), ...feeds], [q], from, to, deadline);
}
