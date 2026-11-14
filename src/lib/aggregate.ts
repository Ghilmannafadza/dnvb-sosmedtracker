import { guardrailReason } from '../../shared/guardrails';
import { SOURCE_META, type AnalyzedItem, type Sentiment, type SourceKey, type TopicQuery } from '../../shared/types';
import { relevanceAll, RELEVANCE_MIN } from '../../api/_lib/query';
import type { Overrides } from './store';

export type ViewItem = AnalyzedItem & { sentiment: Sentiment };

export interface Bucket {
  name: string;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
}

export interface PersonAgg extends Bucket {
  role?: string;
  org?: string;
  itemIds: string[];
  /** kutipan pernyataan tokoh beserta id sebutannya */
  quotes: { text: string; itemId: string }[];
  /** foto tokoh dari artikel berita yang keterangannya menyebut nama tokoh */
  photo?: { url: string; caption: string; outlet: string; itemId: string };
}

export interface Filters {
  channel?: 'all' | 'news' | 'social';
  includeIrrelevant?: boolean;
  from?: string;
  to?: string;
  /** query topik: dipakai untuk menyaring ulang sebutan (juga hasil pantauan lama yang tersimpan) */
  queries?: TopicQuery[];
}

const STOP = new Set(
  (
    'yang dan di ke dari untuk pada dengan dalam ini itu oleh atau juga akan telah sudah tidak bisa ada para serta agar karena sebagai ' +
    'kepada bagi lebih masih saat secara hingga tersebut adalah menjadi tahun hari kata bahwa baru dua tiga satu per pt tbk the of and to in ' +
    'for on with a an is by at as be from news berita video halaman all www com co id html tribunnews kalteng antaranews detik kompas ' +
    'kami kita mereka dia ia jadi namun tetap pun lagi sejak sekitar setelah sebelum antara terhadap melalui tentang mulai sangat cukup ' +
    'salah banyak beberapa seluruh semua akan apa siapa mana bagaimana kenapa nya https http amp rp ribu juta miliar triliun persen'
  ).split(' '),
);

const normName = (n: string) =>
  n
    .replace(/^(H|Hj|Dr|Ir|Drs|Prof)\.?\s+/i, '')
    .replace(/,\s*(S\.\w+|M\.\w+|SE|SH|ST|MM|MBA|SIP|S\.IP).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

const empty = (name: string): Bucket => ({ name, total: 0, positive: 0, neutral: 0, negative: 0 });
const add = (b: Bucket, s: Sentiment) => {
  b.total++;
  b[s]++;
};

export function effectiveItems(items: AnalyzedItem[], ov?: Overrides, f: Filters = {}): ViewItem[] {
  const from = f.from ? new Date(f.from).getTime() : -Infinity;
  const to = f.to ? new Date(f.to).getTime() + 86399999 : Infinity;
  return items
    .filter((i) => {
      if (!f.includeIrrelevant) {
        if (ov?.irrelevant[i.id]) return false;
        if (i.a && i.a.relevant === false) return false;
        // Pagar pembatas + relevansi kata kunci (komentar YouTube dikecualikan: konteksnya videonya)
        if (guardrailReason(i.title, i.snippet, i.originalUrl || i.url)) return false;
        if (f.queries?.length && i.kind !== 'comment' && relevanceAll(i.title, `${i.snippet || ''}\n${i.body || ''}`, f.queries).score < RELEVANCE_MIN) return false;
      }
      if (f.channel && f.channel !== 'all' && i.channel !== f.channel) return false;
      const d = new Date(i.publishedAt).getTime();
      return d >= from && d <= to;
    })
    .map((i) => ({ ...i, sentiment: ov?.sentiment[i.id] || i.a?.sentiment || 'neutral' }));
}

/**
 * Gabungkan nama yang merujuk orang yang sama: "Wiyatno" / "Muhammad Wiyatno" / "M. Wiyatno".
 * Nama pendek digabung ke nama terpanjang yang memuat semua katanya, bila hanya ada satu kandidat.
 */
const pTok = (n: string) =>
  n
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L} ]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
const capHas = (cap: string, name: string) => {
  const hay = ' ' + cap.toLowerCase().normalize('NFKD').replace(/[^\p{L} ]+/gu, ' ') + ' ';
  const t = pTok(name);
  const found = t.filter((x) => hay.includes(' ' + x + ' ')).length;
  return t.length > 0 && found >= Math.min(2, t.length);
};

/**
 * Foto tokoh: hanya dari foto artikel yang keterangannya (caption/alt) menyebut nama tokoh itu,
 * dan tidak menyebut tokoh lain dari artikel yang sama (menghindari salah orang pada foto bersama).
 */
/** Foto untuk satu nama dari foto artikel sebuah sebutan (keterangan menyebut nama). */
export function photoFor(it: AnalyzedItem, name: string) {
  return it.images?.find((im) => capHas(im.caption, name))?.url;
}

export function attachPhotos(persons: PersonAgg[], items: ViewItem[]) {
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const p of persons) {
    if (p.photo) continue;
    for (const id of p.itemIds) {
      const it = byId.get(id);
      if (!it?.images?.length) continue;
      const others = (it.a?.persons || []).map((x) => x.name).filter((n) => !capHas(n, p.name) && !pTok(p.name).every((t) => pTok(n).includes(t)));
      const img = it.images.find((im) => capHas(im.caption, p.name) && !others.some((o) => capHas(im.caption, o)));
      if (img) {
        p.photo = { url: img.url, caption: img.caption, outlet: it.outlet, itemId: it.id };
        break;
      }
    }
  }
  return persons;
}

export function mergeAliases(list: PersonAgg[]): PersonAgg[] {
  const toks = (n: string) => n.toLowerCase().replace(/[^\p{L} ]+/gu, ' ').split(/\s+/).filter((t) => t.length > 1);
  const sorted = [...list].sort((a, b) => toks(b.name).length - toks(a.name).length || b.total - a.total);
  const out: PersonAgg[] = [];
  for (const p of sorted) {
    const tp = toks(p.name);
    const cands = out.filter((q) => {
      const tq = toks(q.name);
      return tp.length < tq.length && tp.every((t) => tq.includes(t));
    });
    if (cands.length === 1) {
      const q = cands[0];
      const ids = new Set(q.itemIds);
      for (const id of p.itemIds) ids.add(id);
      q.itemIds = [...ids];
      q.total += p.total;
      q.positive += p.positive;
      q.neutral += p.neutral;
      q.negative += p.negative;
      q.quotes = [...q.quotes, ...p.quotes].slice(0, 8);
      q.photo = q.photo || p.photo;
      q.role = q.role || p.role;
      q.org = q.org || p.org;
    } else out.push({ ...p, itemIds: [...p.itemIds], quotes: [...p.quotes] });
  }
  return out.sort((a, b) => b.total - a.total);
}

export function aggregate(items: AnalyzedItem[], ov?: Overrides, f: Filters = {}) {
  const list = effectiveItems(items, ov, f);
  const sent = { positive: 0, neutral: 0, negative: 0 };
  const days = new Map<string, Bucket>();
  const outlets = new Map<string, Bucket & { tier: number; channel: string }>();
  const platforms = new Map<string, Bucket>();
  const issues = new Map<string, Bucket>();
  const subIssues = new Map<string, Bucket>();
  const persons = new Map<string, PersonAgg & { roles: Map<string, number>; orgs: Map<string, number> }>();
  const orgs = new Map<string, Bucket>();
  const locs = new Map<string, Bucket>();
  const words = new Map<string, number>();
  const tiers = { 1: empty('Tier 1 • Nasional'), 2: empty('Tier 2 • Regional/Sektor'), 3: empty('Tier 3 • Lainnya') };
  const eng = { views: 0, likes: 0, comments: 0, shares: 0 };
  let news = 0;
  let social = 0;

  for (const it of list) {
    const s = it.sentiment;
    sent[s]++;
    it.channel === 'news' ? news++ : social++;
    const day = it.publishedAt.slice(0, 10);
    if (!days.has(day)) days.set(day, empty(day));
    add(days.get(day)!, s);

    const oName = it.channel === 'social' ? it.outlet : it.outlet || it.domain || '-';
    if (!outlets.has(oName)) outlets.set(oName, { ...empty(oName), tier: it.tier || 3, channel: it.channel });
    add(outlets.get(oName)!, s);

    const pName = it.channel === 'news' ? 'Media web' : SOURCE_META[it.source as SourceKey]?.label || it.outlet;
    if (!platforms.has(pName)) platforms.set(pName, empty(pName));
    add(platforms.get(pName)!, s);

    if (it.channel === 'news') add(tiers[(it.tier || 3) as 1 | 2 | 3], s);

    const iss = it.a?.issue || 'Lainnya';
    if (!issues.has(iss)) issues.set(iss, empty(iss));
    add(issues.get(iss)!, s);
    if (it.a?.subIssue) {
      const k = it.a.subIssue.trim();
      if (!subIssues.has(k)) subIssues.set(k, empty(k));
      add(subIssues.get(k)!, s);
    }

    const seenP = new Set<string>();
    for (const p of it.a?.persons || []) {
      const name = normName(p.name);
      const key = name.toLowerCase();
      if (!name || seenP.has(key)) continue;
      seenP.add(key);
      if (!persons.has(key)) persons.set(key, { ...empty(name), itemIds: [], quotes: [], roles: new Map(), orgs: new Map() });
      const pa = persons.get(key)!;
      // sentimen tokoh = sentimen konteks pemberitaan saat tokoh disebut
      add(pa, p.stance && !ov?.sentiment[it.id] ? p.stance : s);
      pa.itemIds.push(it.id);
      if (p.quote && pa.quotes.length < 8) pa.quotes.push({ text: p.quote, itemId: it.id });
      if (p.role) pa.roles.set(p.role, (pa.roles.get(p.role) || 0) + 1);
      if (p.org) pa.orgs.set(p.org, (pa.orgs.get(p.org) || 0) + 1);
    }
    for (const o of new Set(it.a?.organizations || [])) {
      if (!orgs.has(o)) orgs.set(o, empty(o));
      add(orgs.get(o)!, s);
    }
    for (const l of new Set(it.a?.locations || [])) {
      if (!locs.has(l)) locs.set(l, empty(l));
      add(locs.get(l)!, s);
    }

    for (const w of `${it.title}`.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').split(/\s+/)) {
      if (w.length < 4 || STOP.has(w) || /^\d+$/.test(w)) continue;
      words.set(w, (words.get(w) || 0) + 1);
    }

    if (it.engagement) {
      eng.views += it.engagement.views || 0;
      eng.likes += it.engagement.likes || 0;
      eng.comments += it.engagement.comments || 0;
      eng.shares += it.engagement.shares || 0;
    }
  }

  const sortB = <T extends Bucket>(m: Map<string, T> | T[]) => [...(Array.isArray(m) ? m : m.values())].sort((a, b) => b.total - a.total);
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Timeline lengkap (hari tanpa sebutan = 0)
  const timeline: Bucket[] = [];
  const keys = [...days.keys()].sort();
  const start = f.from || keys[0];
  const end = f.to || keys[keys.length - 1];
  if (start && end) {
    const d = new Date(start.slice(0, 10) + 'T00:00:00Z');
    const e = new Date(end.slice(0, 10) + 'T00:00:00Z');
    let guard = 0;
    while (d <= e && guard++ < 800) {
      const k = d.toISOString().slice(0, 10);
      timeline.push(days.get(k) || empty(k));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }

  // Deteksi lonjakan negatif (peringatan dini)
  const negs = timeline.map((t) => t.negative);
  const mean = negs.reduce((a, b) => a + b, 0) / Math.max(1, negs.length);
  const sd = Math.sqrt(negs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, negs.length));
  const spikes = timeline.filter((t) => t.negative >= Math.max(2, mean + 2 * sd));

  const total = list.length;
  const polar = sent.positive + sent.negative;
  return {
    items: list,
    total,
    news,
    social,
    sent,
    polarity: {
      positivePct: polar ? (sent.positive / polar) * 100 : 0,
      negativePct: polar ? (sent.negative / polar) * 100 : 0,
      base: polar,
    },
    netSentiment: total ? Math.round(((sent.positive - sent.negative) / total) * 100) : 0,
    timeline,
    spikes,
    outlets: sortB(outlets),
    platforms: sortB(platforms),
    tiers: Object.values(tiers),
    issues: sortB(issues),
    subIssues: sortB(subIssues),
    persons: attachPhotos(mergeAliases(sortB(persons).map(({ roles, orgs: o, ...p }) => ({ ...p, role: top(roles), org: top(o) })) as PersonAgg[]), list),
    organizations: sortB(orgs),
    locations: sortB(locs),
    words: [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60),
    engagement: eng,
  };
}

export type Agg = ReturnType<typeof aggregate>;
