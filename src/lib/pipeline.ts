import {
  SOURCE_META,
  type AnalyzeResponse,
  type AnalyzedItem,
  type CollectResponse,
  type EnrichResult,
  type HealthResponse,
  type Insight,
  type InsightRequest,
  type RawItem,
  type SourceKey,
} from '../../shared/types';
import { aggregate } from './aggregate';
import { tierOf } from '../../api/_lib/media';
import type { Topic } from './presets';
import type { TopicResult } from './store';

async function post<T>(url: string, body: unknown, timeoutMs = 70000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Server mengembalikan respon tidak valid (${r.status})`);
    }
    if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
    return data as T;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export interface Progress {
  phase: 'collect' | 'enrich' | 'analyze' | 'insight' | 'done' | 'error';
  /** progres pembacaan isi artikel */
  read?: { done: number; total: number; ok: number; dropped: number; crawled: number; semantic?: number };
  sources: Partial<Record<SourceKey, { state: 'wait' | 'run' | 'ok' | 'err' | 'skip'; count: number; error?: string; via?: string }>>;
  analyzed: number;
  total: number;
  message?: string;
  /** RSS: jumlah feed ditemukan/dibaca */
  rss?: { feeds: number; done: number; read: number; scanned: number; discovering?: string };
  /** Google News: jumlah permintaan & jendela yang dipecah */
  gn?: { requests: number; split: number };
}

const RSS_CACHE = 'dnvb:rssFeeds:v1';
const RSS_TTL = 3 * 86400000;

export function clearRssCache() {
  try {
    localStorage.removeItem(RSS_CACHE);
  } catch {
    /* abaikan */
  }
}
export function rssCacheInfo(): { at: string; feeds: number; sites: number; reachable: number } | null {
  try {
    const c = JSON.parse(localStorage.getItem(RSS_CACHE) || 'null');
    return c ? { at: new Date(c.at).toISOString(), feeds: c.feeds.length, sites: c.sites, reachable: c.reachable } : null;
  } catch {
    return null;
  }
}

/**
 * Daftar SEMUA feed: feed pasti dari katalog + feed yang ditemukan dari ratusan situs media
 * (dikerjakan per 12 situs, 6 bagian paralel). Hasil disimpan di browser 3 hari.
 */
export async function discoverAllFeeds(onStep?: (done: number, total: number, feeds: number) => void, force = false) {
  if (!force) {
    try {
      const c = JSON.parse(localStorage.getItem(RSS_CACHE) || 'null');
      if (c && Date.now() - c.at < RSS_TTL && c.feeds?.length) return c as { at: number; feeds: string[]; sites: number; reachable: number };
    } catch {
      /* cache rusak: temukan ulang */
    }
  }
  const info = await fetch('/api/rss?info=1').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
  const found = new Set<string>(info.known || []);
  let reachable = 0;
  let done = 0;
  let next = 0;
  onStep?.(0, info.parts, found.size);
  await Promise.all(
    Array.from({ length: Math.min(6, info.parts) }, async () => {
      while (next < info.parts) {
        const i = next++;
        try {
          const r = await fetch(`/api/rss?part=${i}`).then((x) => x.json());
          (r.feeds || []).forEach((f: string) => found.add(f));
          reachable += r.reachable || 0;
        } catch {
          /* bagian gagal: dilewati */
        }
        done++;
        onStep?.(done, info.parts, found.size);
      }
    }),
  );
  const out = { at: Date.now(), feeds: [...found], sites: info.sites, reachable };
  try {
    localStorage.setItem(RSS_CACHE, JSON.stringify(out));
  } catch {
    /* penyimpanan penuh */
  }
  return out;
}

/** RSS: temukan semua feed (sekali per 3 hari), lalu baca SEMUA feed per 50, 6 batch paralel. */
async function collectRss(topic: Topic, range: { from: string; to: string }, prog: Progress, emit: () => void): Promise<CollectResponse> {
  const t0 = Date.now();
  prog.rss = { feeds: 0, done: 0, read: 0, scanned: 0 };
  const disc = await discoverAllFeeds((d, total, n) => {
    prog.rss = { feeds: n, done: 0, read: 0, scanned: 0, discovering: `${d}/${total}` };
    emit();
  });
  // Situs WordPress (feed …/feed) juga punya feed PENCARIAN: ?s=kata&feed=rss2 → arsip artikel lama
  const terms = [...new Set(topic.queries.flatMap((q) => q.keywords.map((k) => k.replace(/^"|"$/g, '').trim()).filter((k) => k.length > 2)))].slice(0, 4);
  const wpOrigins = [...new Set(disc.feeds.filter((f) => /\/feed\/?$/.test(f)).map((f) => f.replace(/\/feed\/?$/, '')))];
  const searchFeeds = wpOrigins.flatMap((o) => terms.map((t) => `${o}/?s=${encodeURIComponent(t)}&feed=rss2`));
  const feeds = [...disc.feeds, ...searchFeeds];
  const batches: { feeds: string[]; search?: boolean }[] = [{ feeds: [], search: true }];
  for (let i = 0; i < feeds.length; i += 50) batches.push({ feeds: feeds.slice(i, i + 50) });
  prog.rss = { feeds: feeds.length, done: 0, read: 0, scanned: 0 };
  emit();
  const items: RawItem[] = [];
  let bi = 0;
  let blocked = 0;
  let errors = 0;
  await Promise.all(
    Array.from({ length: Math.min(6, batches.length) }, async () => {
      while (bi < batches.length) {
        const b = batches[bi++];
        try {
          const r = await post<{ items: RawItem[]; stats: { read: number; scanned: number; feeds: number; blocked: number } }>('/api/rss', { ...b, queries: topic.queries, from: range.from, to: range.to });
          items.push(...r.items);
          blocked += r.stats.blocked;
          prog.rss!.read += r.stats.read;
          prog.rss!.scanned += r.stats.scanned;
        } catch {
          errors++;
        }
        prog.rss!.done += b.feeds.length;
        prog.sources.rss = { state: 'run', count: items.length };
        emit();
      }
    }),
  );
  return {
    source: 'rss',
    items,
    ok: errors < batches.length,
    error: errors >= batches.length ? 'Semua batch RSS gagal' : undefined,
    note: `${prog.rss.read} dari ${feeds.length} feed terbaca (${searchFeeds.length} feed pencarian arsip WordPress), dari ${disc.sites} situs media (${disc.reachable} terjangkau saat penemuan); ${prog.rss.scanned} artikel dipindai`,
    via: 'Penemuan feed RSS',
    tookMs: Date.now() - t0,
    blocked,
  };
}

const normTitle = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);

export function mergeItems(lists: RawItem[][]) {
  const map = new Map<string, RawItem>();
  for (const it of lists.flat()) {
    const key = it.channel === 'social' ? it.id : normTitle(it.title);
    const prev = map.get(key);
    if (!prev) map.set(key, it);
    else {
      // Pertahankan URL langsung (bukan news.google.com) dan snippet terlengkap
      const better = prev.url.includes('news.google.com') && !it.url.includes('news.google.com') ? it : prev;
      map.set(key, {
        ...better,
        snippet: (prev.snippet?.length || 0) > (it.snippet?.length || 0) ? prev.snippet : it.snippet,
        outlet: prev.source === 'googlenews' ? prev.outlet : better.outlet,
        tier: Math.min(prev.tier || 3, it.tier || 3) as 1 | 2 | 3,
        image: prev.image || it.image,
      });
    }
  }
  return [...map.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function runTopic(
  topic: Topic,
  range: { from: string; to: string },
  enabled: Partial<Record<SourceKey, boolean>>,
  onProgress: (p: Progress) => void,
  opts: { maxItems?: number; deep?: boolean; comments?: boolean } = {},
): Promise<TopicResult> {
  const commentsOn = opts.comments !== false;
  const sources = topic.sources.filter((s) => enabled[s] !== false);
  const prog: Progress = { phase: 'collect', sources: {}, analyzed: 0, total: 0 };
  topic.sources.forEach((s) => (prog.sources[s] = { state: sources.includes(s) ? 'wait' : 'skip', count: 0 }));
  const emit = () => onProgress(JSON.parse(JSON.stringify(prog)));
  emit();

  // 1) KUMPULKAN: paralel per sumber × per query
  const statuses: Omit<CollectResponse, 'items'>[] = [];
  const lists = await Promise.all(
    sources.map(async (source) => {
      prog.sources[source] = { state: 'run', count: 0 };
      emit();
      const results = source === 'rss'
        ? [await collectRss(topic, range, prog, emit).catch((e): CollectResponse => ({ source, items: [], ok: false, error: String(e.message || e), tookMs: 0 }))]
        : await Promise.all(
        topic.queries.map((query) =>
          post<CollectResponse>('/api/collect', { source, query, from: range.from, to: range.to, deep: opts.deep }).catch(
            (e): CollectResponse => ({ source, items: [], ok: false, error: String(e.message || e), tookMs: 0 }),
          ),
        ),
      );
      const items = results.flatMap((r) => r.items);
      const ok = results.some((r) => r.ok);
      const error = results.find((r) => !r.ok)?.error;
      const via = results.find((r) => r.via)?.via;
      statuses.push({ source, ok, via, tried: results.flatMap((r) => r.tried || []).slice(0, 8), error: ok ? undefined : error, note: results.find((r) => r.note)?.note, tookMs: Math.max(...results.map((r) => r.tookMs)), blocked: results.reduce((x, r) => x + (r.blocked || 0), 0) });
      prog.sources[source] = { state: ok ? 'ok' : 'err', count: items.length, error: ok ? undefined : error, via };
      emit();
      return items;
    }),
  );

  // 1b) KOMENTAR: TikTok & Instagram lewat Apify, dari unggahan dengan komentar terbanyak
  if (commentsOn) {
    await Promise.all(
      (['tiktok', 'instagram'] as const)
        .filter((src) => sources.includes(src))
        .map(async (src) => {
          const posts = lists.flat().filter((i) => i.source === src && i.kind !== 'comment' && /^https?:\/\//.test(i.url));
          const top = posts.sort((a, b) => (b.engagement?.comments || 0) - (a.engagement?.comments || 0)).slice(0, 6);
          if (!top.length) return;
          try {
            const r = await post<CollectResponse>('/api/collect', { source: src, comments: top.map((p) => ({ url: p.url, title: p.title })) });
            if (r.items.length) {
              lists.push(r.items);
              prog.sources[src] = { ...(prog.sources[src] || { state: 'ok', count: 0 }), count: (prog.sources[src]?.count || 0) + r.items.length };
              emit();
            }
          } catch {
            /* komentar opsional */
          }
        }),
    );
  }

  // Batas atas tinggi agar semua sebutan (RSS + Google News) ikut dianalisis, bukan sebagian
  const max = opts.maxItems ?? 3000;
  let merged = mergeItems(lists).slice(0, max);

  // 2) BACA ISI ARTIKEL: dekode Google News, ambil isi berita, nilai ulang relevansi dari isi,
  //    dan ikuti halaman tag/indeks media yang memuat kata kunci (crawl lanjutan).
  const readMax = opts.deep === false ? 0 : 600;
  const news = merged.filter((m) => m.channel === 'news').slice(0, readMax);
  prog.phase = 'enrich';
  prog.read = { done: 0, total: news.length, ok: 0, dropped: 0, crawled: 0 };
  emit();
  const enriched = new Map<string, EnrichResult>();
  const extra: RawItem[] = [];
  const runEnrich = async (list: RawItem[]) => {
    const chunks: RawItem[][] = [];
    for (let i = 0; i < list.length; i += 10) chunks.push(list.slice(i, i + 10));
    let ci = 0;
    await Promise.all(
      Array.from({ length: Math.min(6, chunks.length) }, async () => {
        while (ci < chunks.length) {
          const c = chunks[ci++];
          try {
            const r = await post<{ results: EnrichResult[] }>('/api/enrich', {
              queries: topic.queries,
              items: c.map(({ id, url, source, title, snippet }) => ({ id, url, source, title, snippet })),
            });
            for (const e of r.results) {
              enriched.set(e.id, e);
              if (e.read === 'ok') prog.read!.ok++;
              for (const l of e.links || []) {
                const id = 'cr_' + l.url.replace(/\W+/g, '').slice(-40);
                if (!enriched.has(id) && !extra.some((x) => x.id === id) && !merged.some((m) => m.url === l.url))
                  extra.push({ id, source: c.find((x) => x.id === e.id)!.source, channel: 'news', outlet: e.domain || '', domain: e.domain, url: l.url, title: l.title, publishedAt: new Date().toISOString(), kind: 'article' });
              }
            }
          } catch (err) {
            prog.message = 'Sebagian isi artikel gagal dibaca: ' + String((err as Error).message);
          }
          prog.read!.done = Math.min(prog.read!.total, prog.read!.done + c.length);
          emit();
        }
      }),
    );
  };
  await runEnrich(news);
  // Crawl lanjutan dari halaman tag/indeks (maks 60 artikel tambahan)
  if (extra.length) {
    const more = extra.slice(0, 60);
    prog.read!.crawled = more.length;
    prog.read!.total += more.length;
    emit();
    await runEnrich(more);
    merged = merged.concat(more);
  }

  // Terapkan hasil baca + buang yang tidak relevan (tidak menyebut kata kunci di judul maupun isi)
  const kept: RawItem[] = [];
  const seenUrl = new Set<string>();
  for (const m of merged) {
    const e = enriched.get(m.id);
    if (m.channel === 'news' && e) {
      if (!e.relevant) {
        prog.read!.dropped++;
        continue;
      }
      const url = e.originalUrl || m.url;
      if (seenUrl.has(url)) continue;
      seenUrl.add(url);
      const domain = e.domain || m.domain;
      kept.push({
        ...m,
        originalUrl: e.originalUrl,
        url,
        domain,
        outlet: m.source === 'googlenews' || !m.outlet ? m.outlet || domain || '' : m.outlet,
        tier: domain ? tierOf(domain) : m.tier,
        body: e.body,
        snippet: m.snippet || e.description,
        author: m.author || e.author,
        image: m.image || e.image,
        images: e.images,
        publishedAt: m.id.startsWith('cr_') && e.publishedAt ? e.publishedAt : m.publishedAt,
        read: e.read,
        relevance: e.relevance,
      });
    } else kept.push(m);
  }
  // Artikel hasil crawl lanjutan di luar periode dibuang
  const fromT = new Date(range.from).getTime();
  const toT = new Date(range.to).getTime() + 86400000;
  merged = kept.filter((m) => !m.id.startsWith('cr_') || (new Date(m.publishedAt).getTime() >= fromT && new Date(m.publishedAt).getTime() <= toT));
  emit();

  // 3) SARINGAN MAKNA (embedding, bila SUMOPOD_API_KEY ada): buang sebutan yang maknanya lebih dekat
  //    ke iklan/lowongan/homonim daripada ke profil entitas.
  const semTargets = merged.filter((m) => m.kind !== 'comment');
  const semRes = new Map<string, { sim: number; relevant: boolean }>();
  let semEnabled = true;
  for (let i = 0; i < semTargets.length && semEnabled; i += 60) {
    const chunk = semTargets.slice(i, i + 60);
    try {
      const r = await post<{ enabled: boolean; results: { id: string; sim: number; relevant: boolean }[]; error?: string }>('/api/semantic', {
        topic: topic.name,
        context: topic.context,
        keywords: topic.queries.flatMap((q) => q.keywords),
        excludes: topic.queries.flatMap((q) => q.exclude || []),
        items: chunk.map((m) => ({ id: m.id, text: `${m.title}. ${m.snippet || ''} ${(m.body || '').slice(0, 1200)}` })),
      });
      if (!r.enabled) semEnabled = false;
      for (const x of r.results) semRes.set(x.id, x);
      if (r.error) prog.message = 'Saringan makna sebagian gagal: ' + r.error;
    } catch {
      semEnabled = false;
    }
  }
  if (semRes.size) {
    const flagged = [...semRes.values()].filter((x) => !x.relevant).length;
    // Pengaman kalibrasi: bila hampir semua ditandai tidak relevan, anggap ambang tidak cocok dan jangan buang
    const apply = flagged / semRes.size <= 0.7;
    merged = merged
      .map((m) => (semRes.has(m.id) ? { ...m, semantic: semRes.get(m.id)!.sim } : m))
      .filter((m) => !apply || semRes.get(m.id)?.relevant !== false);
    prog.read!.semantic = apply ? flagged : 0;
    if (!apply) prog.message = `Saringan makna dilewati: ${flagged} dari ${semRes.size} ditandai tidak relevan (ambang perlu disesuaikan, SEMANTIC_MIN).`;
  }

  prog.phase = 'analyze';
  prog.total = merged.length;
  emit();

  // 2) ANALISIS: batch 20 item, 3 paralel
  const byId = new Map<string, AnalyzedItem>(merged.map((m) => [m.id, { ...m }]));
  const batches: RawItem[][] = [];
  for (let i = 0; i < merged.length; i += 12) batches.push(merged.slice(i, i + 12));
  const engines = new Set<string>();
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(5, batches.length) }, async () => {
      while (idx < batches.length) {
        const b = batches[idx++];
        try {
          const r = await post<AnalyzeResponse>('/api/analyze', {
            topic: topic.name,
            context: topic.context,
            keywords: topic.queries.flatMap((q) => q.keywords),
            items: b.map(({ id, title, snippet, outlet, channel, body }) => ({ id, title, snippet, outlet, channel, body: body?.slice(0, 2500) })),
          });
          engines.add(r.engine);
          r.results.forEach((a) => {
            const it = byId.get(a.id);
            if (it) it.a = a;
          });
        } catch (e) {
          prog.message = 'Sebagian batch analisis gagal: ' + String((e as Error).message);
        }
        prog.analyzed = Math.min(prog.total, prog.analyzed + b.length);
        emit();
      }
    }),
  );

  const items = [...byId.values()];
  const result: TopicResult = {
    topicId: topic.id,
    runAt: new Date().toISOString(),
    from: range.from,
    to: range.to,
    items,
    sources: statuses,
    engine: engines.size > 1 ? 'mixed' : engines.has('gemini') ? 'gemini' : 'lexicon',
  };

  // 3) INSIGHT: ringkasan eksekutif
  prog.phase = 'insight';
  emit();
  try {
    result.insight = await generateInsight(topic, result);
  } catch {
    /* insight opsional */
  }
  prog.phase = 'done';
  emit();
  return result;
}

export async function generateInsight(topic: Topic, result: TopicResult, overrides?: Parameters<typeof aggregate>[1]) {
  const ag = aggregate(result.items, overrides, { queries: topic.queries });
  const body: InsightRequest = {
    topic: topic.name,
    context: topic.context,
    period: { from: result.from, to: result.to },
    stats: {
      total: ag.total,
      news: ag.news,
      social: ag.social,
      positive: ag.sent.positive,
      neutral: ag.sent.neutral,
      negative: ag.sent.negative,
      topIssues: ag.issues.slice(0, 8).map((i) => ({ issue: i.name, count: i.total, negative: i.negative })),
      topPersons: ag.persons.slice(0, 12).map((p) => ({ name: p.name, role: p.role, count: p.total, negative: p.negative, positive: p.positive })),
      topOutlets: ag.outlets.slice(0, 10).map((o) => ({ outlet: o.name, count: o.total, negative: o.negative })),
      peakDays: [...ag.timeline].sort((a, b) => b.total - a.total).slice(0, 5).map((d) => ({ date: d.name, count: d.total, negative: d.negative })),
    },
    headlines: ag.items
      .slice()
      .sort((a, b) => Math.abs(b.a?.score || 0) - Math.abs(a.a?.score || 0))
      .slice(0, 60)
      .map((i) => ({ title: i.title, outlet: i.outlet, date: i.publishedAt.slice(0, 10), sentiment: i.sentiment, issue: i.a?.issue || 'Lainnya' })),
  };
  return post<Insight>('/api/insight', body);
}

export const sourceLabel = (s: SourceKey) => SOURCE_META[s]?.label || s;
