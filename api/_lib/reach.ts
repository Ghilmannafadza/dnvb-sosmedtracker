// Agent Reach (github.com/Panniantong/agent-reach) untuk DNVB Sosmed Tracker.
// Setiap sumber punya daftar jalur berurutan: jalur pertama yang tersedia dan mengembalikan data dipakai,
// yang gagal dicatat. Kanal utama:
//   Instagram : Apify ▸ OpenCLI ▸ Firecrawl ▸ Exa      TikTok  : Apify ▸ OpenCLI ▸ Firecrawl ▸ Exa
//   Threads   : Apify ▸ Firecrawl ▸ Exa                YouTube : Data API ▸ yt-dlp ▸ OpenCLI ▸ Firecrawl ▸ Exa
//   Web/blog  : Firecrawl ▸ Exa                        RSS     : feed media (fast-xml-parser)
//   Firecrawl : crawl media (search web+news Indonesia, media bisnis & gaya hidup, map situs prioritas)
// Kanal tambahan (opsional): X/Twitter, Facebook, Reddit, LinkedIn.
// CLI hanya ada di laptop (npm run dev) atau lewat jembatan (REACH_BRIDGE_URL) untuk deploy Vercel.
import { XMLParser } from 'fast-xml-parser';
import { SOURCE_META, type BackendStatus, type RawItem, type SourceKey, type TopicQuery } from '../../shared/types.js';
import { cliDisabled, cliJson, hasBin } from './cli.js';
import { exaMode, exaSearch, type ExaResult } from './exa.js';
import { fcMap, fcMode, fcOn, fcSearch, type FcResult } from './firecrawl.js';
import { domainOf, fetchJson, fetchText, hashId, stripHtml, toIso } from './http.js';
import { TIER1, TIER2, tierOf } from './media.js';
import { rssAll } from './rss.js';
import { norm, primaryTerms } from './query.js';
import { apify, reddit as redditJson, youtube as youtubeApi, type ApifyPlatform } from './social.js';

export interface Ctx {
  q: TopicQuery;
  from: string;
  to: string;
}

const num = (v: any) => {
  if (v == null || v === '') return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).trim().toLowerCase().replace(/,/g, '');
  const m = s.match(/^([\d.]+)\s*(k|rb|ribu|m|jt|juta|万|w)?/);
  if (!m) return undefined;
  const mult = { k: 1e3, rb: 1e3, ribu: 1e3, m: 1e6, jt: 1e6, juta: 1e6, 万: 1e4, w: 1e4 }[m[2] as string] || 1;
  const n = parseFloat(m[1]) * mult;
  return isNaN(n) ? undefined : Math.round(n);
};
const str = (v: any) => (v == null ? '' : typeof v === 'string' ? v : String(v));

/** "3 days ago", "2 minggu lalu", "1 tahun yang lalu", "刚刚" → ISO */
export function relTime(s?: string): string | undefined {
  if (!s) return undefined;
  const t = s.toLowerCase();
  const m = t.match(/(\d+)\s*(second|detik|minute|menit|minggu|min|hour|jam|day|hari|week|month|bulan|year|tahun)/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  const unit: Record<string, number> = { second: 1, detik: 1, minute: 60, menit: 60, min: 60, hour: 3600, jam: 3600, day: 86400, hari: 86400, week: 604800, minggu: 604800, month: 2592000, bulan: 2592000, year: 31536000, tahun: 31536000 };
  return new Date(Date.now() - Number(m[1]) * unit[m[2]] * 1000).toISOString();
}

/** Tanggal dari ID video TikTok (32 bit teratas = detik Unix) */
export function tiktokDate(url: string): string | undefined {
  const id = url.match(/\/video\/(\d{15,})/)?.[1];
  if (!id) return undefined;
  try {
    const sec = Number(BigInt(id) >> 32n);
    return sec > 1.4e9 && sec < 2.2e9 ? new Date(sec * 1000).toISOString() : undefined;
  } catch {
    return undefined;
  }
}

function mk(
  source: SourceKey,
  via: string,
  r: { id?: string; url: string; text: string; title?: string; author?: string; date?: any; image?: string; likes?: any; comments?: any; shares?: any; views?: any; kind?: RawItem['kind']; outlet?: string },
): RawItem | null {
  const text = stripHtml(r.text || '');
  const title = stripHtml(r.title || '') || text.slice(0, 280);
  if (!title) return null;
  const url = r.url || '';
  const domain = domainOf(url) || source;
  const meta = SOURCE_META[source];
  return {
    id: `${source}_${hashId(via + (r.id || url || title))}`,
    source,
    channel: meta.channel,
    outlet: r.outlet || (meta.channel === 'news' ? domain : meta.label),
    domain,
    url,
    title: title.slice(0, 300),
    snippet: (r.title ? text : text.slice(280)).slice(0, 800),
    author: r.author ? str(r.author).replace(/^@/, '') : undefined,
    publishedAt: toIso(r.date),
    image: r.image,
    engagement: { likes: num(r.likes), comments: num(r.comments), shares: num(r.shares), views: num(r.views) },
    tier: meta.channel === 'news' ? tierOf(domain) : undefined,
    kind: r.kind || (meta.channel === 'news' ? 'article' : 'post'),
  };
}
const ok = (x: RawItem | null): x is RawItem => Boolean(x);
const rows = (d: any): any[] => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.results) ? d.results : Array.isArray(d?.data) ? d.data : []);

/* ---------------------------------- normalisasi ---------------------------------- */

export function fromTwitterCli(data: any): RawItem[] {
  return rows(data)
    .map((t) => {
      const sn = t.author?.screenName || t.author?.screen_name || '';
      return mk('x', 'twitter-cli', {
        id: t.id,
        url: t.url || (sn && t.id ? `https://x.com/${sn}/status/${t.id}` : ''),
        text: t.articleText ? `${t.articleTitle || ''} ${t.articleText}` : t.text,
        author: sn || t.author?.name,
        date: t.createdAtISO || t.createdAt,
        image: t.media?.[0]?.url,
        likes: t.metrics?.likes,
        comments: t.metrics?.replies,
        shares: t.metrics?.retweets,
        views: t.metrics?.views,
      });
    })
    .filter(ok);
}

/** Baris OpenCLI (-f json) per situs; kolom mengikuti cli-manifest OpenCLI 2.x */
export function fromOpencli(source: SourceKey, site: string, data: any, extra: { username?: string } = {}): RawItem[] {
  const via = 'opencli';
  return rows(data)
    .map((r) => {
      switch (site) {
        case 'twitter':
          return mk(source, via, { id: r.id, url: r.url, text: r.text, author: r.author, date: r.created_at, image: Array.isArray(r.media_urls) ? r.media_urls[0] : undefined, likes: r.likes, views: r.views, comments: r.replies, shares: r.retweets });
        case 'reddit':
          return mk(source, via, {
            id: r.id,
            url: r.url?.includes('/comments/') || !r.id ? r.url : `https://www.reddit.com/comments/${r.id}`,
            title: r.title,
            text: r.selftext || '',
            author: r.author,
            date: r.created_utc,
            likes: r.score,
            comments: r.comments,
            outlet: r.subreddit ? `Reddit r/${String(r.subreddit).replace(/^r\//, '')}` : undefined,
          });
        case 'facebook':
          return mk(source, via, { url: r.url, title: r.title && r.text ? r.title : undefined, text: r.text || r.title, date: r.date || r.time });
        case 'instagram':
          return mk(source, via, { url: r.url || (extra.username ? `https://www.instagram.com/${extra.username}/` : ''), id: `${extra.username}_${r.index}_${str(r.caption).slice(0, 40)}`, text: r.caption, author: extra.username, date: r.date, likes: r.likes, comments: r.comments });
        case 'tiktok':
          return mk(source, via, { url: r.url, text: r.desc, author: r.author, date: tiktokDate(str(r.url)), views: r.plays, likes: r.likes, comments: r.comments, shares: r.shares, kind: 'video' });
        case 'youtube':
          return mk(source, via, { id: r.video_id, url: r.url || (r.video_id ? `https://www.youtube.com/watch?v=${r.video_id}` : ''), title: r.title, text: r.description || '', author: r.channel, date: relTime(r.published), views: r.views, kind: 'video' });
        default:
          return mk(source, via, { url: r.url || '', title: r.title, text: r.text || r.desc || r.description || '', author: r.author });
      }
    })
    .filter(ok);
}

/** Posting Reddit gaya API (listing mentah rdt-cli / reddit JSON) */
export function fromRedditListing(data: any): RawItem[] {
  const list: any[] = data?.data?.children ? data.data.children.map((c: any) => c.data) : rows(data);
  return list
    .filter(Boolean)
    .map((d) =>
      mk('reddit', 'rdt', {
        id: d.id,
        url: d.permalink ? (String(d.permalink).startsWith('http') ? d.permalink : 'https://www.reddit.com' + d.permalink) : d.url,
        title: d.title,
        text: d.selftext || '',
        author: d.author,
        date: d.created_utc,
        likes: d.ups ?? d.score,
        comments: d.num_comments,
        outlet: d.subreddit ? `Reddit r/${d.subreddit}` : undefined,
      }),
    )
    .filter(ok);
}

export function fromYtDlp(data: any): RawItem[] {
  return (Array.isArray(data) ? data : rows(data))
    .map((v) =>
      mk('youtube', 'yt-dlp', {
        id: v.id,
        url: v.webpage_url || (String(v.url || '').startsWith('http') ? v.url : `https://www.youtube.com/watch?v=${v.id}`),
        title: v.title,
        text: v.description || '',
        author: v.channel || v.uploader,
        date: v.timestamp || v.release_timestamp || (v.upload_date ? `${v.upload_date.slice(0, 4)}-${v.upload_date.slice(4, 6)}-${v.upload_date.slice(6, 8)}` : undefined),
        views: v.view_count,
        likes: v.like_count,
        comments: v.comment_count,
        image: v.thumbnails?.[0]?.url,
        kind: 'video',
      }),
    )
    .filter(ok);
}

export function fromExa(source: SourceKey, results: ExaResult[]): RawItem[] {
  return results
    .map((r) => {
      const host = domainOf(r.url);
      const it = mk(source, 'exa', {
        url: r.url,
        title: SOURCE_META[source].channel === 'social' ? undefined : r.title,
        text: SOURCE_META[source].channel === 'social' ? `${r.title ? r.title + '. ' : ''}${r.text || ''}` : r.text || '',
        author: r.author,
        date: r.publishedDate,
        image: r.image,
        outlet: SOURCE_META[source].channel === 'news' ? host : undefined,
      });
      if (it && SOURCE_META[source].channel === 'news' && r.text && r.text.length > 300) it.body = r.text;
      return it;
    })
    .filter(ok);
}

export function fromFirecrawl(source: SourceKey, results: FcResult[]): RawItem[] {
  const social = SOURCE_META[source].channel === 'social';
  return results
    .map((r) => {
      const it = mk(source, 'firecrawl', {
        url: r.url,
        title: social ? undefined : r.title,
        text: social ? `${r.title ? r.title + '. ' : ''}${r.text || ''}` : r.text || '',
        author: r.author,
        date: r.date ? relTime(r.date) : undefined,
        image: r.image,
        outlet: social ? undefined : domainOf(r.url),
      });
      if (it && !social && r.body && r.body.length > 300) it.body = r.body.slice(0, 20000);
      return it;
    })
    .filter(ok);
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text' });
const txt = (v: any): string => (v == null ? '' : typeof v === 'object' ? String(v['#text'] ?? v['@_href'] ?? '') : String(v));
const arr = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** RSS 2.0 dan Atom */
export function fromFeed(xmlText: string, feedUrl: string): RawItem[] {
  const d = xml.parse(xmlText);
  const channel = d?.rss?.channel || d?.['rdf:RDF'];
  const items = channel ? arr<any>(channel.item || d?.['rdf:RDF']?.item) : arr<any>(d?.feed?.entry);
  const feedTitle = txt(channel?.title || d?.feed?.title);
  return items
    .map((it) => {
      const link = txt(it.link) || txt(arr(it.link)[0]) || txt(it.guid);
      const url = link.startsWith('http') ? link : '';
      return mk('rss', 'rss', {
        url,
        title: txt(it.title),
        text: txt(it.description || it.summary || it['content:encoded'] || it.content),
        author: txt(it['dc:creator'] || it.author?.name || it.author),
        date: txt(it.pubDate || it.published || it.updated || it['dc:date']),
        image: it.enclosure?.['@_url'] || it['media:content']?.['@_url'] || it['media:thumbnail']?.['@_url'],
        outlet: domainOf(url || feedUrl) || feedTitle,
      });
    })
    .filter(ok);
}

/* ------------------------------------ jalur ------------------------------------ */

export interface Backend {
  id: string;
  label: string;
  kind: BackendStatus['kind'];
  available: () => boolean;
  reason: string;
  setup?: string;
  run: (c: Ctx) => Promise<RawItem[]>;
}

/** Istilah pencarian: frasa kata kunci terpanjang dulu */
export const terms = (q: TopicQuery, max = 2) => primaryTerms(q, max);
const orQuery = (q: TopicQuery, max = 3) =>
  terms(q, max)
    .map((t) => (/\s/.test(t) ? `"${t}"` : t))
    .join(' OR ');

/** Jalankan per istilah (CLI tanpa operator OR), gabungkan */
async function perTerm(q: TopicQuery, fn: (t: string) => Promise<RawItem[]>, max = 2) {
  const out: RawItem[] = [];
  let lastErr: unknown;
  let okAny = false;
  for (const t of terms(q, max)) {
    try {
      out.push(...(await fn(t)));
      okAny = true;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!okAny && lastErr) throw lastErr;
  return out;
}

// OpenCLI 2.x: opencli <situs> <perintah> <arg> --opsi -f json → { ok, data: [...] }
const oc = (site: string, cmd: string, args: string[]) => cliJson('opencli', [site, cmd, ...args, '-f', 'json'], { timeoutMs: 45000 });

const CLI_SETUP = {
  opencli: 'npm install -g @jackwener/opencli, pasang ekstensi OpenCLI di Chrome, login platform di Chrome',
  twitter: 'pipx install twitter-cli, lalu isi TWITTER_AUTH_TOKEN dan TWITTER_CT0 (ekspor Cookie-Editor) di .env.local',
  rdt: "pipx install 'git+https://github.com/public-clis/rdt-cli.git', lalu rdt login",
  ytdlp: 'pipx install yt-dlp',
};

const local = (bin: string) => () => !cliDisabled() && hasBin(bin);
const exaOn = () => exaMode() !== 'off';

function exaBackend(source: SourceKey, domains: string[], hint = ''): Backend {
  return {
    id: 'exa',
    label: exaMode() === 'api' ? 'Exa API' : 'Exa (MCP publik)',
    kind: 'exa',
    available: exaOn,
    reason: 'Exa dimatikan (REACH_EXA=0)',
    setup: 'Tanpa kunci (MCP publik). Isi EXA_API_KEY agar bisa dibatasi domain & tanggal.',
    run: async (c) => {
      const res: ExaResult[] = [];
      for (const t of terms(c.q, 2)) {
        const query = `${/\s/.test(t) ? `"${t}"` : t}${hint ? ' ' + hint : ''}`;
        res.push(...(await exaSearch(query, { num: 25, domains, from: c.from, to: c.to, dateWindow: SOURCE_META[source].channel === 'news', location: 'ID' })));
      }
      return fromExa(source, res);
    },
  };
}

const fcSetup = 'Isi FIRECRAWL_API_KEY (firecrawl.dev) atau FIRECRAWL_API_URL untuk Firecrawl self-host (docker compose, port 3002)';
const fcLabel = () => (fcMode() === 'self' ? 'Firecrawl (self-host)' : 'Firecrawl');

/** Firecrawl search dibatasi domain platform (X, Facebook, ...) */
function fcBackend(source: SourceKey, domains: string[]): Backend {
  return {
    id: 'firecrawl',
    label: fcLabel(),
    kind: 'firecrawl',
    available: fcOn,
    reason: 'FIRECRAWL_API_KEY / FIRECRAWL_API_URL belum diisi',
    setup: fcSetup,
    run: (c) => perTerm(c.q, async (t) => fromFirecrawl(source, await fcSearch(/\s/.test(t) ? `"${t}"` : t, { domains, from: c.from, to: c.to, limit: 30 }))),
  };
}

const fcBudget = () => Math.max(1, Number(process.env.FIRECRAWL_MAX_REQUESTS) || 8);
const fcScrapeOn = () => process.env.FIRECRAWL_SCRAPE === '1';
/** Situs yang di-map langsung (crawl daftar URL relevan); default media bisnis, marketing & startup Indonesia */
const fcMapSites = () =>
  (process.env.FIRECRAWL_MAP_SITES || 'marketeers.com,swa.co.id,dailysocial.id,mix.co.id')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * Crawl media dengan Firecrawl, dalam batas FIRECRAWL_MAX_REQUESTS permintaan:
 * 1. search web + news per istilah (Indonesia, rentang tanggal),
 * 2. search khusus media bisnis/gaya hidup/startup (TIER2) lalu media nasional (TIER1),
 * 3. map situs prioritas (FIRECRAWL_MAP_SITES) dengan kata kunci → URL artikel yang relevan.
 * FIRECRAWL_SCRAPE=1 ikut mengambil isi artikel (markdown) di langkah 1–2 (kredit lebih banyak).
 */
export async function firecrawlMedia(c: Ctx) {
  const t0 = Date.now();
  const scrape = fcScrapeOn();
  const ts = terms(c.q, 3);
  const quoted = (t: string) => (/\s/.test(t) ? `"${t}"` : t);
  const main = quoted(ts[0] || '');
  const tasks: (() => Promise<FcResult[]>)[] = ts.map((t) => () => fcSearch(quoted(t), { sources: ['news', 'web'], from: c.from, to: c.to, limit: 50, scrape }));
  if (main) {
    tasks.push(() => fcSearch(main, { sources: ['web'], domains: TIER2.slice(0, 40), from: c.from, to: c.to, limit: 40, scrape }));
    tasks.push(() => fcSearch(main, { sources: ['web'], domains: TIER1.slice(0, 40), from: c.from, to: c.to, limit: 40, scrape }));
    for (const site of fcMapSites())
      tasks.push(async () =>
        (await fcMap(`https://${site.replace(/^https?:\/\//, '')}`, ts[0], 30))
          .filter((l) => {
            const path = (() => { try { return new URL(l.url).pathname; } catch { return ''; } })();
            return /\/\d{4}\/|\d{5,}|\/(berita|read|news|artikel)\//i.test(path) && !/\/(tag|tags|kategori|category|topik|topic|search|cari|indeks|index)(\/|$)/i.test(path);
          })
          .map((l) => ({ url: l.url, title: l.title, text: l.description, kind: 'news' as const })),
      );
  }
  const queue = tasks.slice(0, fcBudget());
  const res: FcResult[] = [];
  const errs: string[] = [];
  // 3 permintaan paralel, tidak memulai permintaan baru setelah 40 detik (batas fungsi Vercel 60 detik)
  await Promise.all(
    Array.from({ length: Math.min(3, queue.length) }, async () => {
      for (let fn = queue.shift(); fn; fn = queue.shift()) {
        if (Date.now() - t0 > 40000) break;
        try {
          res.push(...(await fn()));
        } catch (e) {
          errs.push(String((e as Error).message || e).slice(0, 140));
        }
      }
    }),
  );
  if (!res.length && errs.length) throw new Error([...new Set(errs)].join(' | '));
  const seen = new Set<string>();
  return fromFirecrawl('firecrawl', res.filter((r) => !seen.has(r.url) && seen.add(r.url)));
}

const apifyBackend = (p: ApifyPlatform): Backend => ({
  id: 'apify',
  label: 'Apify',
  kind: 'api',
  available: () => Boolean(process.env.APIFY_TOKEN),
  reason: 'APIFY_TOKEN belum diisi',
  setup: 'Isi APIFY_TOKEN (berbayar per hasil)',
  run: (c) => apify(p, c.q, c.from, c.to),
});

function bridgeBackend(source: SourceKey, cliIds: string[]): Backend {
  return {
    id: 'bridge',
    label: 'Jembatan Agent Reach',
    kind: 'bridge',
    available: () => Boolean(process.env.REACH_BRIDGE_URL) && !(BACKENDS[source] || []).some((b) => b.kind === 'cli' && cliIds.includes(b.id) && b.available()),
    reason: 'REACH_BRIDGE_URL belum diisi',
    setup: 'Di laptop: npm run reach (lalu buka lewat tunnel), isi REACH_BRIDGE_URL dan REACH_BRIDGE_TOKEN di Vercel',
    run: async (c) => {
      const r = await fetchJson<{ items: RawItem[]; via?: string; error?: string }>(process.env.REACH_BRIDGE_URL!.replace(/\/$/, '') + '/reach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.REACH_BRIDGE_TOKEN || ''}` },
        body: JSON.stringify({ source, query: c.q, from: c.from, to: c.to, cliOnly: true }),
        timeoutMs: 55000,
      });
      if (r.error && !r.items?.length) throw new Error(r.error);
      return r.items || [];
    },
  };
}

const cli = (id: string, label: string, bin: string, setup: string, run: Backend['run']): Backend => ({
  id,
  label,
  kind: 'cli',
  available: local(bin),
  reason: cliDisabled() ? 'CLI lokal tidak tersedia di server ini' : `${bin} belum terpasang`,
  setup,
  run,
});

const openCli = (source: SourceKey, site: string, run?: Backend['run']) =>
  cli('opencli', 'OpenCLI', 'opencli', CLI_SETUP.opencli, run || ((c) => perTerm(c.q, async (t) => fromOpencli(source, site, await oc(site, 'search', [t, '--limit', '25'])))));

const twitterEnv = () => ({ TWITTER_AUTH_TOKEN: process.env.TWITTER_AUTH_TOKEN || '', TWITTER_CT0: process.env.TWITTER_CT0 || '' });

export const BACKENDS: Partial<Record<SourceKey, Backend[]>> = {
  x: [
    apifyBackend('x'),
    {
      ...cli('twitter-cli', 'twitter-cli', 'twitter', CLI_SETUP.twitter, async (c) => {
        const since = c.from.slice(0, 10);
        const data = await cliJson('twitter', ['search', orQuery(c.q), '--since', since, '-n', '40', '--json'], { timeoutMs: 45000, env: twitterEnv() });
        return fromTwitterCli(data);
      }),
      available: () => local('twitter')() && Boolean(process.env.TWITTER_AUTH_TOKEN && process.env.TWITTER_CT0),
      reason: 'twitter-cli belum terpasang, atau TWITTER_AUTH_TOKEN/TWITTER_CT0 kosong',
    },
    openCli('x', 'twitter', (c) => perTerm(c.q, async (t) => fromOpencli('x', 'twitter', await oc('twitter', 'search', [t, '--filter', 'live', '--limit', '30'])))),
    fcBackend('x', ['x.com', 'twitter.com']), exaBackend('x', ['x.com', 'twitter.com']),
  ],
  reddit: [
    openCli('reddit', 'reddit', (c) => perTerm(c.q, async (t) => fromOpencli('reddit', 'reddit', await oc('reddit', 'search', [t, '--sort', 'new', '--time', 'year', '--limit', '25'])))),
    cli('rdt', 'rdt-cli', 'rdt', CLI_SETUP.rdt, (c) => perTerm(c.q, async (t) => fromRedditListing(await cliJson('rdt', ['search', t, '--sort', 'new', '--time', 'year', '--limit', '25', '--json'], { timeoutMs: 40000 })))),
    { id: 'reddit-json', label: 'JSON publik Reddit', kind: 'api', available: () => process.env.REACH_REDDIT_JSON !== '0', reason: 'dimatikan', setup: 'Tanpa kunci, sering diblokir (403) dari server', run: (c) => redditJson(c.q, c.from) },
    fcBackend('reddit', ['reddit.com']), exaBackend('reddit', ['reddit.com']),
  ],
  facebook: [apifyBackend('facebook'), openCli('facebook', 'facebook'), fcBackend('facebook', ['facebook.com']), exaBackend('facebook', ['facebook.com'])],
  instagram: [
    apifyBackend('instagram'),
    openCli('instagram', 'instagram', async (c) => {
      // OpenCLI instagram search = pencarian akun; ambil unggahan terbaru akun yang namanya cocok
      const out: RawItem[] = [];
      for (const t of terms(c.q, 2)) {
        const users = rows(await oc('instagram', 'search', [t, '--limit', '10']));
        const toks = norm(t).trim().split(' ').filter((x) => x.length > 2);
        const match = users.filter((u) => toks.some((k) => norm(`${u.username} ${u.name}`).includes(k))).slice(0, 2);
        for (const u of match) out.push(...fromOpencli('instagram', 'instagram', await oc('instagram', 'user', [u.username, '--limit', '12']), { username: u.username }));
      }
      return out;
    }),
    fcBackend('instagram', ['instagram.com']), exaBackend('instagram', ['instagram.com']),
  ],
  tiktok: [apifyBackend('tiktok'), openCli('tiktok', 'tiktok'), fcBackend('tiktok', ['tiktok.com']), exaBackend('tiktok', ['tiktok.com'])],
  threads: [apifyBackend('threads'), fcBackend('threads', ['threads.net', 'threads.com']), exaBackend('threads', ['threads.net', 'threads.com'])],
  youtube: [
    { id: 'youtube-api', label: 'YouTube Data API', kind: 'api', available: () => Boolean(process.env.YOUTUBE_API_KEY), reason: 'YOUTUBE_API_KEY belum diisi', setup: 'Isi YOUTUBE_API_KEY (gratis, Google Cloud)', run: (c) => youtubeApi(c.q, c.from, c.to) },
    cli('yt-dlp', 'yt-dlp', 'yt-dlp', CLI_SETUP.ytdlp, (c) => perTerm(c.q, async (t) => fromYtDlp(await cliJson('yt-dlp', [`ytsearchdate25:${t}`, '--dump-json', '--flat-playlist', '--no-warnings', '--skip-download'], { timeoutMs: 45000 })))),
    openCli('youtube', 'youtube', (c) => perTerm(c.q, async (t) => fromOpencli('youtube', 'youtube', await oc('youtube', 'search', [t, '--limit', '25', '--sort', 'date'])))),
    fcBackend('youtube', ['youtube.com']), exaBackend('youtube', ['youtube.com']),
  ],
  linkedin: [fcBackend('linkedin', ['linkedin.com']), exaBackend('linkedin', ['linkedin.com'])],
  web: [
    {
      id: 'firecrawl',
      label: fcLabel(),
      kind: 'firecrawl',
      available: fcOn,
      reason: 'FIRECRAWL_API_KEY / FIRECRAWL_API_URL belum diisi',
      setup: fcSetup,
      run: (c) => perTerm(c.q, async (t) => fromFirecrawl('web', await fcSearch(/\s/.test(t) ? `"${t}"` : t, { from: c.from, to: c.to, limit: 40 }))),
    },
    exaBackend('web', []),
  ],
  firecrawl: [
    {
      id: 'firecrawl-media',
      label: fcLabel(),
      kind: 'firecrawl',
      available: fcOn,
      reason: 'FIRECRAWL_API_KEY / FIRECRAWL_API_URL belum diisi',
      setup: `${fcSetup}. Batas permintaan: FIRECRAWL_MAX_REQUESTS (8); isi artikel: FIRECRAWL_SCRAPE=1; situs yang di-map: FIRECRAWL_MAP_SITES`,
      run: firecrawlMedia,
    },
  ],
  rss: [
    {
      id: 'rss',
      label: 'Penemuan feed RSS',
      kind: 'api',
      available: () => true,
      reason: '',
      setup: 'Semua feed di direktori RSS (Antara nasional + 35 daerah, media nasional, Kalimantan, energi, lingkungan) + feed pencarian WordPress. Tambah: RSS_DIRECTORIES, RSS_FEEDS, RSS_SEARCH_FEEDS',
      run: async (c) => {
        const { items, stats } = await rssAll(c.q, c.from, c.to);
        if (!stats.read) throw new Error('Tidak ada feed RSS yang terbaca');
        return items;
      },
    },
  ],
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

// Jembatan: sumber dengan jalur CLI mendapat jalur jembatan tepat sebelum Exa / jalur publik
for (const [source, list] of Object.entries(BACKENDS) as [SourceKey, Backend[]][]) {
  const cliIds = list.filter((b) => b.kind === 'cli').map((b) => b.id);
  if (!cliIds.length) continue;
  const at = list.findIndex((b, i) => i > list.findIndex((x) => x.kind === 'cli') && b.kind !== 'cli');
  list.splice(at < 0 ? list.length : at, 0, bridgeBackend(source, cliIds));
}

export const hasReach = (s: SourceKey) => Boolean(BACKENDS[s]);

export function backendStatus(s: SourceKey): BackendStatus[] {
  return (BACKENDS[s] || []).map((b) => {
    const available = b.available();
    return { id: b.id, label: b.label, kind: b.kind, available, reason: available ? undefined : b.reason, setup: b.setup };
  });
}

/**
 * Jalankan sumber: coba jalur berurutan. Jalur yang memberi data dipakai.
 * cliOnly = mode jembatan (hanya CLI lokal).
 */
export async function runSource(source: SourceKey, c: Ctx, opts: { cliOnly?: boolean; deadline?: number } = {}) {
  const list = (BACKENDS[source] || []).filter((b) => (opts.cliOnly ? b.kind === 'cli' : true));
  const tried: string[] = [];
  let firstOk: string | undefined;
  for (const b of list) {
    if (!b.available()) continue;
    if (opts.deadline && Date.now() > opts.deadline - 3000) {
      tried.push(`${b.label}: waktu habis`);
      break;
    }
    try {
      const items = await b.run(c);
      if (items.length) return { items, via: b.label, tried };
      tried.push(`${b.label}: 0 hasil`);
      firstOk = firstOk || b.label;
    } catch (e) {
      tried.push(`${b.label}: ${String((e as Error).message || e).slice(0, 160)}`);
    }
  }
  if (firstOk) return { items: [] as RawItem[], via: firstOk, tried };
  const avail = list.filter((b) => b.available());
  throw new Error(avail.length ? tried.join(' | ') : `Belum ada jalur aktif. ${list.map((b) => `${b.label}: ${b.reason}`).join('; ')}`);
}

/** Ringkasan untuk /api/health */
export function reachSummary() {
  const bins: Record<string, boolean> = {};
  for (const b of ['agent-reach', 'opencli', 'twitter', 'rdt', 'yt-dlp']) bins[b] = !cliDisabled() && hasBin(b);
  return { local: !cliDisabled(), bridge: process.env.REACH_BRIDGE_URL ? domainOf(process.env.REACH_BRIDGE_URL) || 'aktif' : undefined, bins, exa: exaMode(), firecrawl: fcMode() };
}

