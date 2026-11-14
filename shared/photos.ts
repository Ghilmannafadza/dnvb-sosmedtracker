// Pencocokan foto tokoh (dipakai server dan klien).

export interface PhotoCandidate {
  url: string;
  caption: string;
  /** halaman artikel asal foto, dipakai sebagai Referer saat mengunduh */
  articleUrl?: string;
  outlet?: string;
  /** caption = keterangan menyebut nama; headline = foto utama artikel yang judulnya menyebut nama */
  kind: 'caption' | 'headline';
}

export interface StoredPhoto {
  key: string;
  name: string;
  /** URL permanen (Vercel Blob) atau data URL (tersimpan di browser) */
  src: string;
  source: 'berita' | 'wikipedia';
  credit: string;
  caption?: string;
  sourceUrl?: string;
  savedAt: string;
}

const TITLES = /^(h|hj|dr|drs|ir|prof|kh|ust|ustaz|st|se|sh|mm|mba|mt|msi|spd|sip)$/;

export const nameTokens = (n: string) =>
  n
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L} ]+/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !TITLES.test(t));

/** Kunci tokoh yang stabil lintas topik dan pemantauan: "muhammad-wiyatno" */
export const personKey = (name: string) => nameTokens(name).join('-');

const hayOf = (s: string) => ' ' + nameTokens(s).join(' ') + ' ';

/** Keterangan menyebut nama lengkap (atau minimal dua kata nama). */
export function captionHasName(caption: string, name: string) {
  const hay = hayOf(caption);
  const t = nameTokens(name).filter((x) => x.length > 2);
  if (!t.length) return false;
  const found = t.filter((x) => hay.includes(' ' + x + ' ')).length;
  return found >= Math.min(2, t.length);
}

/** Longgar: nama belakang + kata jabatan pertama (mis. "Bupati ... Wiyatno"). */
function captionHasSurnameAndRole(caption: string, name: string, role?: string) {
  const t = nameTokens(name);
  const roleWord = role ? nameTokens(role)[0] : undefined;
  if (t.length < 2 || !roleWord || roleWord.length < 4) return false;
  const hay = hayOf(caption);
  return hay.includes(' ' + t[t.length - 1] + ' ') && hay.includes(' ' + roleWord + ' ');
}

/**
 * Kandidat foto untuk satu tokoh dari artikel-artikel yang menyebutnya, urut dari paling meyakinkan.
 * Foto bersama (keterangan menyebut tokoh lain dari artikel yang sama) dilewati.
 */
export function photoCandidates(
  person: { name: string; role?: string },
  articles: { title: string; url?: string; outlet?: string; image?: string; images?: { url: string; caption: string }[]; persons?: string[] }[],
): PhotoCandidate[] {
  const strict: PhotoCandidate[] = [];
  const relaxed: PhotoCandidate[] = [];
  const headline: PhotoCandidate[] = [];
  const me = nameTokens(person.name);
  for (const a of articles) {
    const others = (a.persons || []).filter((n) => {
      const t = nameTokens(n);
      return !(t.every((x) => me.includes(x)) || me.every((x) => t.includes(x)));
    });
    for (const im of a.images || []) {
      if (others.some((o) => captionHasName(im.caption, o))) continue;
      const c = { url: im.url, caption: im.caption, articleUrl: a.url, outlet: a.outlet, kind: 'caption' as const };
      if (captionHasName(im.caption, person.name)) strict.push(c);
      else if (captionHasSurnameAndRole(im.caption, person.name, person.role)) relaxed.push(c);
    }
    // Foto utama artikel yang judulnya menyebut tokoh dan hanya tokoh ini yang disebut
    if (a.image && !others.length && captionHasName(a.title, person.name))
      headline.push({ url: a.image, caption: a.title, articleUrl: a.url, outlet: a.outlet, kind: 'headline' });
  }
  const seen = new Set<string>();
  return [...strict, ...relaxed, ...headline].filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true))).slice(0, 5);
}
