import { guardrailReason, QUERY_EXCLUDES } from '../../shared/guardrails.js';
import type { RawItem, TopicQuery } from '../../shared/types.js';

const clean = (arr?: string[]) => (arr || []).map((s) => s.trim()).filter(Boolean);

/**
 * Kata kunci diperlakukan sebagai FRASA bila: diberi tanda kutip oleh pengguna, berupa nama
 * (setiap kata diawali huruf kapital, mis. "Asmin Bara Bronang", "PT ABB"), atau satu kata.
 * Selain itu (mis. "kelas bisnis DNVB mahal") dianggap kumpulan kata yang semuanya
 * harus muncul, dalam urutan apa pun. Ini mencegah pencarian frasa panjang yang hampir tidak
 * pernah cocok persis sehingga mesin pencari mengembalikan hasil acak.
 */
export function parseKeyword(k: string): { phrase: boolean; text: string; tokens: string[] } {
  const raw = k.trim();
  const quoted = /^".+"$/.test(raw);
  const text = raw.replace(/^"|"$/g, '').trim();
  const words = text.split(/\s+/).filter(Boolean);
  const nameLike = words.every((w) => /^[A-Z0-9(]/.test(w) || /^(dan|&|of|bin|binti)$/i.test(w));
  const phrase = quoted || words.length === 1 || nameLike;
  return { phrase, text, tokens: phrase ? [text] : words.filter((w) => w.length > 1) };
}

const qWeb = (k: string) => {
  const p = parseKeyword(k);
  if (p.phrase) return /\s/.test(p.text) ? `"${p.text.replace(/"/g, '')}"` : p.text;
  return p.tokens.length > 1 ? `(${p.tokens.join(' ')})` : p.tokens[0];
};

/** Sintaks boolean Google News / Bing: ("a b" OR (c d)) (ctx1 OR ctx2) -x */
export function webQuery(q: TopicQuery) {
  const kw = clean(q.keywords);
  const ctx = clean(q.context);
  const ex = clean(q.exclude);
  const group = (arr: string[]) => (arr.length > 1 ? `(${arr.map(qWeb).join(' OR ')})` : qWeb(arr[0]));
  let s = group(kw);
  if (ctx.length) s += ' ' + group(ctx);
  if (ex.length) s += ' ' + ex.map((e) => '-' + qWeb(e)).join(' ');
  s += ' ' + QUERY_EXCLUDES.map((e) => '-' + e).join(' ');
  return s;
}

/** Sintaks GDELT: OR wajib di dalam kurung, kata < 3 huruf tidak boleh */
export function gdeltQuery(q: TopicQuery) {
  const parts = clean(q.keywords)
    .map((k) => {
      const p = parseKeyword(k);
      if (p.phrase) return p.text.replace(/\W/g, '').length >= 3 ? `"${p.text}"` : '';
      const t = p.tokens.filter((x) => x.length >= 3);
      return t.length ? `(${t.join(' ')})` : '';
    })
    .filter(Boolean);
  const ex = clean(q.exclude);
  let s = parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0] || '""';
  if (ex.length) s += ' ' + ex.map((e) => `-"${e.replace(/"/g, '')}"`).join(' ');
  return s;
}

/** Kata kunci paling spesifik (dipakai untuk platform yang tidak mendukung boolean). */
export function primaryTerms(q: TopicQuery, max = 3) {
  return clean(q.keywords)
    .map((k) => parseKeyword(k).text)
    .sort((a, b) => b.length - a.length)
    .slice(0, max);
}

export const norm = (s: string) =>
  ' ' +
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}#@]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim() +
  ' ';

/** Jumlah kemunculan kata kunci (batas kata) dalam teks yang sudah dinormalisasi. */
export function countKeyword(hay: string, k: string) {
  const p = parseKeyword(k);
  const one = (t: string) => {
    const n = norm(t).trim();
    if (!n) return 0;
    let c = hay.split(' ' + n + ' ').length - 1;
    // hashtag / tulisan tanpa spasi (#asminbarabronang)
    if (n.includes(' ')) c += hay.split(' ' + n.replace(/ /g, '') + ' ').length - 1 + hay.split(' #' + n.replace(/ /g, '') + ' ').length - 1;
    return c;
  };
  if (p.phrase) return one(p.text);
  const counts = p.tokens.map(one);
  return counts.every((c) => c > 0) ? Math.min(...counts) : 0;
}

const isStrong = (k: string) => {
  // nama multi-kata selain singkatan "PT XXX" dianggap cukup spesifik tanpa konteks
  const p = parseKeyword(k);
  return p.phrase && p.text.replace(/^PT\.?\s+/i, '').includes(' ');
};

/**
 * Skor relevansi 0..1 sebuah sebutan terhadap satu query.
 * Judul memuat kata kunci = sinyal kuat; isi artikel memuat kata kunci = sinyal sedang;
 * singkatan ambigu (PT ABB, PT TOP) wajib disertai kata konteks; kata pengecualian = 0.
 */
export function relevanceFor(title: string, body: string, q: TopicQuery) {
  const zero = { score: 0, inTitle: false, hits: 0 };
  if (guardrailReason(title, body.slice(0, 300))) return zero;
  const ht = norm(title);
  const hb = norm(body);
  const kw = clean(q.keywords);
  const ex = clean(q.exclude);
  if (ex.some((e) => countKeyword(ht, e) || countKeyword(hb, e))) return zero;
  let inTitle = false;
  let hits = 0;
  let strong = false;
  for (const k of kw) {
    const t = countKeyword(ht, k);
    const b = countKeyword(hb, k);
    if (t) inTitle = true;
    if (t || b) strong = strong || isStrong(k);
    hits += t + b;
  }
  if (!hits) return { score: 0, inTitle, hits };
  // Kata konteks yang sama dengan kata kunci tidak dihitung (mis. konteks "DNVB" untuk kata kunci "DNVB")
  const kwNorm = kw.map((k) => norm(parseKeyword(k).text));
  const ctx = clean(q.context).filter((c) => {
    const n = norm(c);
    return !kwNorm.some((k) => k.includes(n) || n.includes(k));
  });
  if (ctx.length && !strong && !contextNear(ht, hb, kw, ctx)) return { score: 0.1, inTitle, hits };
  const score = Math.min(1, (inTitle ? 0.6 : 0) + Math.min(hits, 4) * 0.15 + (strong ? 0.15 : 0));
  return { score: Number(score.toFixed(2)), inTitle, hits };
}

/**
 * Untuk kata kunci ambigu (satu kata atau singkatan), kata konteks harus muncul di judul yang sama,
 * atau dalam jarak 30 kata dari kemunculan kata kunci di isi. Mencegah artikel properti di
 * artikel umum "digitally native vertical brand" yang kebetulan menyebut "Indonesia" di bagian lain halaman.
 */
function contextNear(ht: string, hb: string, kw: string[], ctx: string[]) {
  const inTitleK = kw.some((k) => countKeyword(ht, k));
  if (inTitleK && ctx.some((c) => countKeyword(ht, c))) return true;
  const words = hb.trim().split(' ');
  const WINDOW = 30;
  const pos = (phrase: string) => {
    const t = norm(phrase).trim().split(' ');
    const out: number[] = [];
    for (let i = 0; i + t.length <= words.length; i++) if (t.every((x, j) => words[i + j] === x)) out.push(i);
    return out;
  };
  const kPos = kw.flatMap((k) => {
    const p = parseKeyword(k);
    return p.phrase ? pos(p.text) : pos(p.tokens[0]);
  });
  if (inTitleK) kPos.push(0); // judul + paragraf pembuka
  const cPos = ctx.flatMap((c) => pos(parseKeyword(c).text));
  return kPos.some((k) => cPos.some((c) => Math.abs(c - k) <= WINDOW));
}

/** Relevansi terbaik di antara beberapa query sebuah topik. */
export function relevanceAll(title: string, body: string, queries: TopicQuery[]) {
  return queries.reduce((best, q) => {
    const r = relevanceFor(title, body, q);
    return r.score > best.score ? r : best;
  }, { score: 0, inTitle: false, hits: 0 });
}

export const RELEVANCE_MIN = 0.3;

/** Filter lokal (judul + cuplikan) yang dipakai saat pengumpulan. */
export function matchesQuery(item: Pick<RawItem, 'title' | 'snippet'>, q: TopicQuery, requireContext = true) {
  const r = relevanceFor(item.title, item.snippet || '', requireContext ? q : { ...q, context: [] });
  return r.score >= RELEVANCE_MIN;
}

export function splitWindows(fromIso: string, toIso: string, maxWindows = 6) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const span = Math.max(to - from, 86400000);
  const days = Math.ceil(span / 86400000);
  const n = Math.min(maxWindows, Math.max(1, Math.ceil(days / 14)));
  const step = span / n;
  const out: { from: Date; to: Date }[] = [];
  for (let i = 0; i < n; i++) out.push({ from: new Date(from + step * i), to: new Date(from + step * (i + 1)) });
  return out;
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function dedupe(items: RawItem[]) {
  const seen = new Map<string, RawItem>();
  for (const it of items) {
    const key = norm(it.title).slice(0, 90) + '|' + (it.channel === 'social' ? it.url : '');
    const prev = seen.get(key);
    if (!prev) seen.set(key, it);
    else if (!prev.snippet && it.snippet) seen.set(key, { ...it, outlet: prev.outlet || it.outlet });
  }
  return [...seen.values()];
}

export async function pool<T, R>(arr: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, arr.length) }, async () => {
      while (i < arr.length) {
        const idx = i++;
        out[idx] = await fn(arr[idx]);
      }
    }),
  );
  return out;
}
