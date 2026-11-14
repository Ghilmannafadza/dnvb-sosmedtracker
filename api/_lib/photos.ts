// Pencarian, verifikasi, dan penyimpanan foto tokoh.
// Urutan: foto yang sudah tersimpan → kandidat dari artikel pantauan → pencarian berita khusus nama
// tokoh (Bing News) → Wikipedia. Gambar diunduh lewat server dengan Referer artikel (CDN media sering
// menolak hotlink), diperiksa model AI multimodal bila aktif, lalu disimpan permanen di Vercel Blob
// (BLOB_READ_WRITE_TOKEN) atau dikembalikan sebagai data URL agar disimpan di browser.
import { captionHasName, nameTokens, personKey, photoCandidates, type PhotoCandidate, type StoredPhoto } from '../../shared/photos.js';
import { extractArticle } from './article.js';
import { hasVision, visionJson } from './gemini.js';
import { domainOf, fetchJson, fetchText } from './http.js';
import { parseBingRss } from './news.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
export const MAX_BYTES = 1_200_000;
const MIN_BYTES = 3_000;

export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

export interface PersonReq {
  name: string;
  role?: string;
  org?: string;
  candidates?: PhotoCandidate[];
}

export interface Img {
  buf: Buffer;
  type: string;
}

export async function downloadImage(url: string, referer?: string): Promise<Img | null> {
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const r = await fetch(url.replace(/^http:/i, 'https:'), {
      headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8', ...(referer ? { Referer: referer } : {}) },
      signal: AbortSignal.timeout(10000),
      redirect: 'follow',
    });
    if (!r.ok) return null;
    const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/(jpeg|jpg|png|webp|avif)$/.test(type)) return null;
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_BYTES) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < MIN_BYTES || buf.length > MAX_BYTES) return null;
    return { buf, type: type === 'image/jpg' ? 'image/jpeg' : type };
  } catch {
    return null;
  }
}

export const toDataUrl = (im: Img) => `data:${im.type};base64,${im.buf.toString('base64')}`;

/* ------------------------------ verifikasi AI ------------------------------ */

const VSCHEMA = {
  type: 'OBJECT',
  properties: {
    people: { type: 'INTEGER', description: 'jumlah wajah manusia yang terlihat jelas' },
    main_person: { type: 'BOOLEAN', description: 'ada satu orang yang menjadi subjek utama foto' },
    kind: { type: 'STRING', description: 'portrait | person_activity | group | no_person | graphic' },
  },
  required: ['people', 'main_person', 'kind'],
};

/** true = layak dipakai sebagai foto tokoh; null = AI tidak tersedia/gagal (pakai aturan teks saja). */
export async function aiCheck(im: Img, person: PersonReq, caption: string): Promise<boolean | null> {
  if (!hasVision()) return null;
  try {
    const v = await visionJson<{ people: number; main_person: boolean; kind: string }>(
      `Kamu memeriksa apakah foto berita ini layak dijadikan foto profil tokoh "${person.name}"${person.role ? ` (${person.role})` : ''}.\n` +
        `Keterangan/judul foto: "${caption.slice(0, 300)}".\n` +
        'Nilai hanya isi gambar: berapa wajah yang terlihat jelas, dan apakah ada SATU orang yang menjadi subjek utama. ' +
        'Logo, infografis, gedung, produk, poster promosi, dokumen, dan kerumunan tanpa subjek utama tidak layak.',
      toDataUrl(im),
      VSCHEMA,
    );
    return Boolean(v.main_person) && v.people >= 1 && v.people <= 3 && !/no_person|graphic/i.test(v.kind || '');
  } catch {
    return null;
  }
}

/* ------------------------- pencarian berita per tokoh ------------------------- */

export async function newsCandidates(p: PersonReq): Promise<PhotoCandidate[]> {
  const q = `"${p.name}"${p.org ? ` ${p.org}` : ''}`;
  let items;
  try {
    items = parseBingRss(await fetchText(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=id-ID&cc=ID`, { timeoutMs: 9000 }));
  } catch {
    return [];
  }
  const hits = items.filter((i) => captionHasName(`${i.title} ${i.snippet}`, p.name)).slice(0, 4);
  const arts = await Promise.all(
    hits.map(async (i) => {
      try {
        const html = await fetchText(i.url, { timeoutMs: 9000 });
        const a = extractArticle(html, i.url);
        return { title: a.title || i.title, url: i.url, outlet: i.outlet || domainOf(i.url), image: a.image || i.image, images: a.images };
      } catch {
        return { title: i.title, url: i.url, outlet: i.outlet || domainOf(i.url), image: i.image, images: [] };
      }
    }),
  );
  return photoCandidates(p, arts);
}

/* --------------------------------- Wikipedia --------------------------------- */

export async function wikiPhoto(p: PersonReq): Promise<{ url: string; page: string; caption: string } | null> {
  const toks = nameTokens(p.name);
  if (toks.length < 2) return null;
  const ctx = nameTokens(`${p.role || ''} ${p.org || ''}`).filter((t) => t.length > 3);
  for (const lang of ['id', 'en']) {
    try {
      const j: any = await fetchJson(
        `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&generator=search&gsrlimit=3&gsrsearch=${encodeURIComponent(p.name)}` +
          '&prop=pageimages|description|extracts&exintro=1&explaintext=1&exchars=500&piprop=thumbnail&pithumbsize=320',
        { timeoutMs: 8000 },
      );
      for (const pg of j?.query?.pages || []) {
        const title = ' ' + nameTokens(pg.title || '').join(' ') + ' ';
        if (!toks.every((t) => title.includes(' ' + t + ' '))) continue;
        const text = ' ' + nameTokens(`${pg.description || ''} ${pg.extract || ''}`).join(' ') + ' ';
        // Wajib halaman tentang orang: ada konteks jabatan/organisasi, atau ciri biografi
        const isPerson = /\b(lahir|born|politikus|politician|pengusaha|businessman|pejabat|bupati|gubernur|menteri|direktur|executive|anggota)\b/.test(text);
        const ctxHit = ctx.some((t) => text.includes(' ' + t + ' '));
        if (!pg.thumbnail?.source || !(isPerson && (ctxHit || !ctx.length || toks.length >= 3))) continue;
        return { url: pg.thumbnail.source, page: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(pg.title)}`, caption: pg.description || pg.title };
      }
    } catch {
      /* lanjut bahasa lain */
    }
  }
  return null;
}

/* ------------------------------- penyimpanan ------------------------------- */

const pathOf = (key: string) => `tokoh/${key}`;

export async function storedPhoto(key: string): Promise<StoredPhoto | null> {
  if (!blobEnabled()) return null;
  try {
    const { head } = await import('@vercel/blob');
    const h = await head(`${pathOf(key)}.json`);
    const r = await fetch(h.url, { signal: AbortSignal.timeout(6000) });
    return r.ok ? ((await r.json()) as StoredPhoto) : null;
  } catch {
    return null;
  }
}

export async function listStored(): Promise<StoredPhoto[]> {
  if (!blobEnabled()) return [];
  const { list } = await import('@vercel/blob');
  const metas: string[] = [];
  let cursor: string | undefined;
  do {
    const r = await list({ prefix: 'tokoh/', limit: 1000, cursor });
    for (const b of r.blobs) if (b.pathname.endsWith('.json')) metas.push(b.url);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor && metas.length < 3000);
  const out: StoredPhoto[] = [];
  for (let i = 0; i < metas.length; i += 12) {
    const part = await Promise.all(
      metas.slice(i, i + 12).map((u) =>
        fetch(u, { signal: AbortSignal.timeout(6000) })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    );
    out.push(...(part.filter(Boolean) as StoredPhoto[]));
  }
  return out;
}

export async function savePhoto(meta: Omit<StoredPhoto, 'src' | 'savedAt'>, im: Img): Promise<StoredPhoto> {
  const savedAt = new Date().toISOString();
  if (!blobEnabled()) return { ...meta, src: toDataUrl(im), savedAt };
  try {
    const { put } = await import('@vercel/blob');
    const ext = im.type.split('/')[1].replace('jpeg', 'jpg');
    const img = await put(`${pathOf(meta.key)}.${ext}`, im.buf, { access: 'public', contentType: im.type, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 });
    const full: StoredPhoto = { ...meta, src: img.url, savedAt };
    await put(`${pathOf(meta.key)}.json`, JSON.stringify(full), { access: 'public', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 60 });
    return full;
  } catch (e) {
    // Blob gagal (mis. store bertipe private): tetap kembalikan foto agar disimpan di browser
    console.warn('[photos] Blob gagal:', (e as Error).message);
    return { ...meta, src: toDataUrl(im), savedAt };
  }
}

/* --------------------------------- resolver --------------------------------- */

export interface Resolved {
  key: string;
  name: string;
  photo?: StoredPhoto;
  /** langkah yang dicoba, untuk diagnosa di UI */
  tried: string[];
}

async function tryCandidates(p: PersonReq, cands: PhotoCandidate[], tried: string[], label: string) {
  for (const c of cands.slice(0, 4)) {
    const im = await downloadImage(c.url, c.articleUrl);
    if (!im) {
      tried.push(`${label}: gagal unduh ${domainOf(c.url)}`);
      continue;
    }
    const ok = await aiCheck(im, p, c.caption);
    // Tanpa AI: foto berketerangan nama diterima; foto utama artikel tetap diterima bila judul hanya menyebut tokoh ini
    if (ok === false) {
      tried.push(`${label}: ditolak AI (${domainOf(c.url)})`);
      continue;
    }
    return { c, im };
  }
  return null;
}

export async function resolvePerson(p: PersonReq, opts: { search?: boolean; exclude?: string[] } = {}): Promise<Resolved> {
  const key = personKey(p.name);
  const tried: string[] = [];
  const base = { key, name: p.name, tried };
  if (!key) return base;

  const ex = new Set((opts.exclude || []).filter(Boolean));
  const allowed = (c: PhotoCandidate) => !ex.has(c.url) && !(c.articleUrl && ex.has(c.articleUrl));

  const stored = await storedPhoto(key);
  if (stored && !ex.has(stored.sourceUrl || '') && !ex.has(stored.src)) return { ...base, photo: stored };

  let hit = await tryCandidates(p, (p.candidates || []).filter(allowed), tried, 'artikel');
  if (!hit && opts.search !== false) {
    const extra = (await newsCandidates(p)).filter((c) => allowed(c) && !(p.candidates || []).some((x) => x.url === c.url));
    tried.push(`pencarian berita: ${extra.length} kandidat`);
    hit = await tryCandidates(p, extra, tried, 'berita');
  }
  if (hit) {
    const photo = await savePhoto(
      { key, name: p.name, source: 'berita', credit: hit.c.outlet || domainOf(hit.c.articleUrl || hit.c.url), caption: hit.c.caption.slice(0, 240), sourceUrl: hit.c.articleUrl },
      hit.im,
    );
    return { ...base, photo };
  }
  const w = await wikiPhoto(p);
  if (w && !ex.has(w.page)) {
    const im = await downloadImage(w.url, w.page);
    if (im) {
      const photo = await savePhoto({ key, name: p.name, source: 'wikipedia', credit: 'Wikipedia', caption: w.caption, sourceUrl: w.page }, im);
      return { ...base, photo };
    }
  }
  tried.push('wikipedia: tidak ada');
  return base;
}
