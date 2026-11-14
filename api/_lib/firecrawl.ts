// Firecrawl (github.com/firecrawl/firecrawl): search + scrape + map untuk crawl media dan media sosial.
// - Cloud: isi FIRECRAWL_API_KEY (fc-...) → https://api.firecrawl.dev
// - Self-host (docker compose dari repo firecrawl): isi FIRECRAWL_API_URL, mis. http://localhost:3002
//   (kunci opsional bila USE_DB_AUTHENTICATION=false).
// Endpoint v2 yang dipakai:
//   POST /v2/search  { query, sources:['web','news'], tbs, country, lang, includeDomains, limit, scrapeOptions? }
//                    → { success, data: { web: [...], news: [...] } }
//   POST /v2/scrape  { url, formats:['markdown'], onlyMainContent } → { success, data: { markdown, metadata } }
//   POST /v2/map     { url, search, limit } → { success, links: [{ url, title, description }] }

export const fcBase = () => (process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev').replace(/\/+$/, '');
export const fcMode = (): 'cloud' | 'self' | 'off' =>
  process.env.REACH_FIRECRAWL === '0' ? 'off' : process.env.FIRECRAWL_API_URL ? 'self' : process.env.FIRECRAWL_API_KEY ? 'cloud' : 'off';
export const fcOn = () => fcMode() !== 'off';

export interface FcResult {
  url: string;
  title: string;
  text: string;
  date?: string;
  image?: string;
  author?: string;
  body?: string;
  kind: 'web' | 'news';
}

async function post<T = any>(path: string, body: object, timeoutMs = 45000): Promise<T> {
  const key = process.env.FIRECRAWL_API_KEY;
  const r = await fetch(fcBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  let j: any = {};
  try {
    j = text ? JSON.parse(text) : {};
  } catch {
    /* bukan JSON */
  }
  if (!r.ok || j.success === false) {
    const msg = j.error || j.message || text.slice(0, 160) || r.statusText;
    throw new Error(`Firecrawl ${r.status}${r.status === 402 ? ' (kredit habis)' : r.status === 401 ? ' (kunci salah)' : ''}: ${msg}`);
  }
  return j as T;
}

/** Rentang tanggal gaya Google: cdr:1,cd_min:M/D/YYYY,cd_max:M/D/YYYY */
export function tbsRange(from?: string, to?: string) {
  if (!from) return undefined;
  const f = (s: string) => {
    const d = new Date(s);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
  };
  return `cdr:1,cd_min:${f(from)},cd_max:${f(to || new Date().toISOString())}`;
}

const metaDate = (m: any) =>
  m?.publishedTime || m?.['article:published_time'] || m?.publishedDate || m?.datePublished || m?.['og:published_time'] || m?.date || undefined;
const metaImage = (m: any) => {
  const v = m?.ogImage || m?.['og:image'] || m?.image;
  return Array.isArray(v) ? v[0] : v;
};

/** Ubah balasan /v2/search menjadi daftar hasil (web + news, tanpa duplikat URL) */
export function parseFcSearch(j: any): FcResult[] {
  const d = j?.data || {};
  const groups: [any[], 'web' | 'news'][] = Array.isArray(d) ? [[d, 'web']] : [[d.news || [], 'news'], [d.web || [], 'web']];
  const seen = new Set<string>();
  const out: FcResult[] = [];
  for (const [list, kind] of groups)
    for (const r of list) {
      const url = r.url || r.metadata?.sourceURL;
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const m = r.metadata || {};
      out.push({
        url,
        kind,
        title: r.title || m.title || '',
        text: r.snippet || r.description || r.highlights || m.description || '',
        date: r.date || metaDate(m),
        image: r.imageUrl || metaImage(m),
        author: m.author,
        body: r.markdown ? mdToText(r.markdown) : undefined,
      });
    }
  return out;
}

export async function fcSearch(
  query: string,
  opts: { sources?: ('web' | 'news')[]; from?: string; to?: string; domains?: string[]; limit?: number; scrape?: boolean } = {},
): Promise<FcResult[]> {
  const body: Record<string, unknown> = {
    query,
    sources: opts.sources || ['web'],
    limit: Math.min(opts.limit || 30, 100),
    country: process.env.FIRECRAWL_COUNTRY || 'ID',
    lang: process.env.FIRECRAWL_LANG || 'id',
    ignoreInvalidURLs: true,
    timeout: 30000,
  };
  const tbs = tbsRange(opts.from, opts.to);
  if (tbs) body.tbs = tbs;
  if (opts.domains?.length) body.includeDomains = opts.domains;
  if (opts.scrape) body.scrapeOptions = { formats: ['markdown'], onlyMainContent: true };
  return parseFcSearch(await post('/v2/search', body, opts.scrape ? 55000 : 35000));
}

/** Baca satu halaman → teks bersih (markdown tanpa tautan & gambar) */
export async function fcScrape(url: string, timeoutMs = 30000): Promise<{ title: string; text: string; image?: string; author?: string; publishedAt?: string; description?: string } | null> {
  if (!fcOn()) return null;
  try {
    const j = await post<any>('/v2/scrape', { url, formats: ['markdown'], onlyMainContent: true, timeout: timeoutMs - 2000 }, timeoutMs);
    const m = j.data?.metadata || {};
    const md: string = j.data?.markdown || '';
    return { title: m.title || '', text: mdToText(md), image: metaImage(m) || md.match(/!\[[^\]]*\]\((https?:[^)\s]+)\)/)?.[1], author: m.author, publishedAt: metaDate(m), description: m.description };
  } catch {
    return null;
  }
}

/** Daftar URL situs yang paling relevan dengan kata kunci (crawl ringan tanpa membaca isi) */
export async function fcMap(site: string, search: string, limit = 50) {
  const j = await post<any>('/v2/map', { url: site, search, limit }, 40000);
  return ((j.links || []) as any[]).map((l) => (typeof l === 'string' ? { url: l, title: '', description: '' } : { url: l.url, title: l.title || '', description: l.description || '' }));
}

export function mdToText(md: string) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>|]+/g, ' ')
    .replace(/^\s*[-=]{3,}\s*$/gm, '')
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 40 && !/^(baca juga|advertisement|iklan|share|bagikan|lihat juga)/i.test(l))
    .join('\n');
}
