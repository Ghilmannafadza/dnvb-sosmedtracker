// Pembacaan isi artikel: dekode tautan Google News, ambil HTML penerbit, ekstrak isi berita.
import { domainOf, fetchText, stripHtml, toIso } from './http.js';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

/* ---------------------------- Dekode Google News ---------------------------- */
// Tautan RSS Google News (news.google.com/rss/articles/<id>) bukan URL penerbit. Cara yang dipakai
// pustaka googlenewsdecoder (2024-2026): ambil tanda tangan data-n-a-sg dan stempel waktu
// data-n-a-ts dari halaman artikel Google News, lalu kirim satu POST ke endpoint batchexecute.

export function googleNewsId(url: string) {
  const m = url.match(/news\.google\.com\/(?:rss\/)?(?:articles|read)\/([^?/#]+)/);
  return m ? m[1] : null;
}

export function parseSignature(html: string) {
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1];
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1];
  return sg && ts ? { sg, ts } : null;
}

export function buildDecodePayload(id: string, ts: string, sg: string) {
  const inner = `["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"${id}",${ts},"${sg}"]`;
  return 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]]));
}

export function parseDecodeResponse(text: string): string | null {
  // Bentuk umum: )]}'\n\n[["wrb.fr","Fbv4je","[\"garturlres\",\"https://...\",1]",...]]
  try {
    const chunk = text.split('\n\n')[1] ?? text.replace(/^\)\]\}'\s*/, '');
    const outer = JSON.parse(chunk);
    const row = (outer as any[]).find((r) => Array.isArray(r) && r[1] === 'Fbv4je') || outer[0];
    const inner = JSON.parse(row[2]);
    if (typeof inner?.[1] === 'string' && inner[1].startsWith('http')) return inner[1];
  } catch {
    /* coba regex */
  }
  const m = text.match(/garturlres\\",\\"(https?:[^"\\]+)/);
  return m ? m[1] : null;
}

export async function decodeGoogleNews(url: string): Promise<string | null> {
  const id = googleNewsId(url);
  if (!id) return null;
  let sig: { sg: string; ts: string } | null = null;
  for (const page of [`https://news.google.com/articles/${id}`, `https://news.google.com/rss/articles/${id}`]) {
    try {
      sig = parseSignature(await fetchText(page, { timeoutMs: 7000 }));
      if (sig) break;
    } catch {
      /* coba bentuk berikutnya */
    }
  }
  if (!sig) return null;
  const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': UA },
    body: buildDecodePayload(id, sig.ts, sig.sg),
    signal: AbortSignal.timeout(7000),
  });
  if (!r.ok) return null;
  return parseDecodeResponse(await r.text());
}

/* ---------------------------- Ekstraksi artikel ---------------------------- */

const BOILER =
  /^(baca juga|baca:|simak juga|lihat juga|artikel ini telah tayang|advertisement|scroll to continue|editor:|penulis:|reporter:|pewarta:|copyright|ikuti kami|dapatkan update|follow|klik di sini|download aplikasi|tonton juga)/i;

const decode = (s: string) => stripHtml(s);

function metaContent(html: string, names: string[]) {
  for (const n of names) {
    const re1 = new RegExp(`<meta[^>]+(?:name|property|itemprop)=["']${n}["'][^>]*content=["']([^"']*)["']`, 'i');
    const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property|itemprop)=["']${n}["']`, 'i');
    const m = html.match(re1) || html.match(re2);
    if (m?.[1]) return decode(m[1]);
  }
  return undefined;
}

function jsonLdArticle(html: string) {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  for (const b of blocks) {
    try {
      const data = JSON.parse(b.trim());
      const list: any[] = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
      for (const d of list) {
        const t = String(d?.['@type'] || '');
        if (/Article|NewsArticle|Report|BlogPosting/i.test(t)) {
          const author = Array.isArray(d.author) ? d.author.map((a: any) => a?.name).filter(Boolean).join(', ') : d.author?.name;
          const imgs = (Array.isArray(d.image) ? d.image : d.image ? [d.image] : [])
            .map((im: any) => (typeof im === 'string' ? { src: im, caption: '' } : { src: im?.url || im?.contentUrl, caption: decode(String(im?.caption || im?.description || im?.name || '')) }))
            .filter((im: any) => im.src);
          return { body: d.articleBody ? decode(String(d.articleBody)) : undefined, published: d.datePublished, author, headline: d.headline, images: imgs as { src: string; caption: string }[] };
        }
      }
    } catch {
      /* JSON-LD rusak, abaikan */
    }
  }
  return null;
}

function paragraphs(html: string) {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form|figure)[\s\S]*?<\/\1>/gi, ' ');
  const scope = clean.match(/<article[\s\S]*?<\/article>/i)?.[0] || clean.match(/<div[^>]+(?:detail|read__content|article|content|post|entry|isi|txt)[^>]*>[\s\S]*/i)?.[0] || clean;
  return [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => decode(m[1]))
    .filter((t) => t.length > 40 && !BOILER.test(t));
}

export interface ArticleImage {
  url: string;
  caption: string;
}

const absUrl = (src: string, base?: string) => {
  try {
    const u = new URL(src.trim(), base);
    if (u.protocol === 'http:') u.protocol = 'https:';
    return u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
};

const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}=["']([^"']+)["']`, 'i'))?.[1];

/**
 * Foto berketerangan dari artikel: JSON-LD image.caption, <figure> + <figcaption>, atribut alt/title
 * pada <img>, dan og:image + og:image:alt. Keterangan dipakai untuk mencocokkan foto dengan tokoh.
 */
export function articleImages(html: string, baseUrl?: string, ldImages: { src: string; caption: string }[] = []): ArticleImage[] {
  const out: ArticleImage[] = [];
  const push = (src: string | undefined, caption: string) => {
    if (!src || /\.(svg|gif)(\?|$)/i.test(src) || /logo|icon|avatar-default|placeholder|1x1|pixel/i.test(src)) return;
    const url = absUrl(src, baseUrl);
    const cap = decode(caption).slice(0, 300);
    if (url && cap.length >= 10 && !out.some((o) => o.url === url)) out.push({ url, caption: cap });
  };
  for (const im of ldImages) push(im.src, im.caption);
  const imgSrc = (tag: string) => attr(tag, 'data-src') || attr(tag, 'data-lazy-src') || attr(tag, 'data-original') || attr(tag, 'src') || attr(tag, 'srcset')?.split(/\s+/)[0];
  for (const m of html.matchAll(/<figure[\s\S]*?<\/figure>/gi)) {
    const fig = m[0];
    const img = fig.match(/<img[^>]+>/i)?.[0];
    const cap = fig.match(/<figcaption[^>]*>([\s\S]*?)<\/figcaption>/i)?.[1] || (img ? attr(img, 'alt') || '' : '');
    if (img) push(imgSrc(img), cap);
  }
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const alt = attr(m[0], 'alt') || attr(m[0], 'title') || '';
    if (alt.length >= 20) push(imgSrc(m[0]), alt);
  }
  push(metaContent(html, ['og:image']), metaContent(html, ['og:image:alt', 'twitter:image:alt']) || '');
  return out.slice(0, 15);
}

export interface Article {
  body: string;
  description?: string;
  author?: string;
  image?: string;
  publishedAt?: string;
  title?: string;
  images: ArticleImage[];
}

export function extractArticle(html: string, baseUrl?: string): Article {
  const ld = jsonLdArticle(html);
  const paras = paragraphs(html);
  let body = ld?.body && ld.body.length > 200 ? ld.body : paras.join('\n');
  body = body
    .split(/\n+/)
    .filter((l) => !BOILER.test(l.trim()))
    .join('\n')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 6000);
  const pub = ld?.published || metaContent(html, ['article:published_time', 'datePublished', 'pubdate', 'publishdate']);
  return {
    body,
    title: ld?.headline || metaContent(html, ['og:title']),
    description: metaContent(html, ['og:description', 'description']),
    author: ld?.author || metaContent(html, ['author', 'article:author']),
    image: metaContent(html, ['og:image']),
    publishedAt: pub ? toIso(pub) : undefined,
    images: articleImages(html, baseUrl, ld?.images || []),
  };
}

/** Halaman daftar (tag, topik, pencarian, indeks), bukan artikel tunggal. */
export const isListingUrl = (url: string) => /\/(tag|tags|topik|topic|search|cari|indeks|index|kumpulan|label|keyword)(\/|\?|$)|[?&](q|s|query|tag)=/i.test(url);

/** Ambil tautan artikel dari halaman daftar yang teks tautannya memuat kata kunci. */
export function listingLinks(html: string, baseUrl: string, test: (text: string) => boolean) {
  const out = new Map<string, string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = decode(m[2]);
    if (text.length < 25 || !test(text)) continue;
    try {
      const u = new URL(m[1], baseUrl);
      if (domainOf(u.href) !== domainOf(baseUrl) || isListingUrl(u.href)) continue;
      out.set(u.href, text);
    } catch {
      /* URL tidak valid */
    }
  }
  return [...out.entries()].slice(0, 25).map(([url, title]) => ({ url, title }));
}
