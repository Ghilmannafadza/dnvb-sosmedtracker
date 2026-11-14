// POST /api/enrich { queries, items[] (maks 12) }
// Membaca isi artikel: dekode tautan Google News ke URL penerbit, ambil isi berita, hitung ulang
// relevansi terhadap kata kunci, dan ambil tautan artikel dari halaman tag/indeks (crawl lanjutan).
import type { EnrichRequest, EnrichResult } from '../shared/types.js';
import { decodeGoogleNews, extractArticle, googleNewsId, isListingUrl, listingLinks } from './_lib/article.js';
import { domainOf, fetchText, methodGuard, readJson, send, type Req, type Res } from './_lib/http.js';
import { blockedDomain } from '../shared/guardrails.js';
import { jinaRead } from './_lib/exa.js';
import { fcOn, fcScrape } from './_lib/firecrawl.js';

/**
 * Pembaca cadangan untuk halaman yang menolak / dirender JavaScript: Jina Reader lalu Firecrawl scrape.
 * FIRECRAWL_READ=first → Firecrawl dulu; FIRECRAWL_READ=0 → Firecrawl tidak dipakai untuk membaca artikel.
 */
async function fallbackRead(url: string, timeoutMs = 12000) {
  const fc = async () => {
    if (!fcOn() || process.env.FIRECRAWL_READ === '0') return null;
    const f = await fcScrape(url, Math.max(timeoutMs, 20000));
    return f && f.text.length >= 200 ? { ...f, via: 'firecrawl' } : null;
  };
  const jn = async () => {
    const j = await jinaRead(url, timeoutMs);
    return j && j.text.length >= 200 ? { ...j, author: undefined, publishedAt: undefined, description: undefined, via: 'jina' } : null;
  };
  const order = process.env.FIRECRAWL_READ === 'first' ? [fc, jn] : [jn, fc];
  for (const fn of order) {
    const r = await fn();
    if (r) return r;
  }
  return null;
}
import { pool, relevanceAll, RELEVANCE_MIN } from './_lib/query.js';

export const config = { maxDuration: 60 };

export default async function handler(req: Req, res: Res) {
  if (!methodGuard(req, res, 'POST')) return;
  let body: EnrichRequest;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Body JSON tidak valid' });
  }
  const queries = body.queries || [];
  const items = (body.items || []).slice(0, 12);
  const deadline = Date.now() + 50000;

  const results = await pool(items, 6, async (it): Promise<EnrichResult> => {
    const titleRel = relevanceAll(it.title, it.snippet || '', queries);
    const base: EnrichResult = { id: it.id, relevant: titleRel.score >= RELEVANCE_MIN && titleRel.inTitle, relevance: titleRel.score, read: 'title' };
    if (Date.now() > deadline) return { ...base, error: 'batas waktu' };
    try {
      let url = it.url;
      if (googleNewsId(url)) {
        const real = await decodeGoogleNews(url).catch(() => null);
        if (!real) return { ...base, error: 'tautan Google News tidak terdekode' };
        url = real;
      }
      if (blockedDomain(url)) return { ...base, originalUrl: url, relevant: false, relevance: 0, error: 'domain diblokir pagar pembatas' };
      let html = '';
      try {
        html = await fetchText(url, { timeoutMs: 8000 });
      } catch (e) {
        // Situs menolak/terlalu lambat: baca lewat Jina Reader (Agent Reach)
        const j = Date.now() < deadline - 10000 ? await fallbackRead(url) : null;
        if (!j) throw e;
        return readResult(it, url, { body: j.text.slice(0, 20000), title: j.title, image: j.image, author: j.author, publishedAt: j.publishedAt, description: j.description }, queries, j.via);
      }
      if (isListingUrl(url)) {
        const links = listingLinks(html, url, (t) => relevanceAll(t, '', queries).inTitle);
        return { ...base, originalUrl: url, domain: domainOf(url), relevant: false, relevance: 0, links };
      }
      const a = extractArticle(html.slice(0, 1_500_000), url);
      if (a.body.length < 200 && Date.now() < deadline - 10000) {
        // Halaman dirender JavaScript / dibatasi: coba Jina Reader
        const j = await fallbackRead(url);
        if (j && j.text.length > a.body.length + 200) return readResult(it, url, { body: j.text.slice(0, 20000), title: j.title || a.title, image: a.image || j.image, images: a.images, author: a.author || j.author, publishedAt: a.publishedAt || j.publishedAt, description: a.description || j.description }, queries, j.via);
      }
      const rel = relevanceAll(it.title || a.title || '', `${a.description || ''}\n${a.body}`, queries);
      return {
        id: it.id,
        originalUrl: url,
        domain: domainOf(url),
        body: a.body,
        description: a.description,
        author: a.author,
        image: a.image,
        images: a.images,
        publishedAt: a.publishedAt,
        relevant: rel.score >= RELEVANCE_MIN,
        relevance: rel.score,
        read: a.body.length > 200 ? 'ok' : 'title',
      };
    } catch (e: any) {
      return { ...base, error: String(e?.message || e).slice(0, 120) };
    }
  });
  send(res, 200, { results });
}

function readResult(
  it: { id: string; title: string; snippet?: string },
  url: string,
  a: { body: string; title?: string; image?: string; images?: EnrichResult['images']; author?: string; publishedAt?: string; description?: string },
  queries: EnrichRequest['queries'],
  via: string,
): EnrichResult & { via?: string } {
  const rel = relevanceAll(it.title || a.title || '', `${a.description || ''}\n${a.body}`, queries);
  return {
    id: it.id,
    originalUrl: url,
    domain: domainOf(url),
    body: a.body,
    description: a.description,
    author: a.author,
    image: a.image,
    images: a.images,
    publishedAt: a.publishedAt,
    relevant: rel.score >= RELEVANCE_MIN,
    relevance: rel.score,
    read: a.body.length > 200 ? 'ok' : 'title',
    via,
  };
}
