// Foto tokoh yang tersimpan: sekali ditemukan, dipakai lagi di semua topik dan sesi berikutnya.
// Disimpan di IndexedDB browser (database terpisah 'dnvb-sosmedtracker-photos'); bila server memakai
// Vercel Blob, daftar foto server juga dimuat sehingga semua pengguna berbagi foto yang sama.
import { personKey, photoCandidates, type PhotoCandidate, type StoredPhoto } from '../../shared/photos';
import type { AnalyzedItem } from '../../shared/types';

const DB = 'dnvb-sosmedtracker-photos';
let dbp: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'key' });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

export async function loadLocalPhotos(): Promise<Record<string, StoredPhoto>> {
  const d = await db();
  if (!d) return {};
  return new Promise((res) => {
    try {
      const q = d.transaction('photos').objectStore('photos').getAll();
      q.onsuccess = () => res(Object.fromEntries((q.result as StoredPhoto[]).map((p) => [p.key, p])));
      q.onerror = () => res({});
    } catch {
      res({});
    }
  });
}

export async function saveLocalPhotos(list: StoredPhoto[]) {
  const d = await db();
  if (!d || !list.length) return;
  await new Promise<void>((res) => {
    try {
      const tx = d.transaction('photos', 'readwrite');
      for (const p of list) tx.objectStore('photos').put(p);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    } catch {
      res();
    }
  });
}

export async function deleteLocalPhoto(key: string) {
  const d = await db();
  if (!d) return;
  try {
    d.transaction('photos', 'readwrite').objectStore('photos').delete(key);
  } catch {
    /* abaikan */
  }
}

/** Perkecil foto (data URL) menjadi maks 192px JPEG agar ringan disimpan. */
export async function downscale(src: string, size = 192): Promise<string> {
  if (!src.startsWith('data:')) return src;
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const s = Math.min(1, size / Math.min(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * s);
    const h = Math.round(img.naturalHeight * s);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const out = c.toDataURL('image/jpeg', 0.85);
    return out.length < src.length ? out : src;
  } catch {
    return src;
  }
}

/* ---------------------- tokoh yang belum ketemu fotonya ---------------------- */
const MISS = 'dnvb:photoMiss';
const RETRY_MS = 3 * 86400000;
const misses = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(MISS) || '{}');
  } catch {
    return {};
  }
};
function markMiss(keys: string[]) {
  try {
    const m = misses();
    for (const k of keys) m[k] = Date.now();
    localStorage.setItem(MISS, JSON.stringify(m));
  } catch {
    /* abaikan */
  }
}
export const clearMiss = (key?: string) => {
  try {
    if (!key) return localStorage.removeItem(MISS);
    const m = misses();
    delete m[key];
    localStorage.setItem(MISS, JSON.stringify(m));
  } catch {
    /* abaikan */
  }
};

/* Foto yang ditolak analis (salah orang): tidak dipakai dan tidak dicari ulang otomatis */
const HIDE = 'dnvb:photoHide';
export const hiddenPhotos = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(HIDE) || '{}');
  } catch {
    return {};
  }
};
export function hidePhoto(key: string, src: string) {
  try {
    localStorage.setItem(HIDE, JSON.stringify({ ...hiddenPhotos(), [key]: src.slice(0, 400) }));
  } catch {
    /* abaikan */
  }
}

function unhide(key: string) {
  try {
    const h = hiddenPhotos();
    if (!h[key]) return;
    delete h[key];
    localStorage.setItem(HIDE, JSON.stringify(h));
  } catch {
    /* abaikan */
  }
}

/* --------------------------------- server --------------------------------- */

export async function fetchServerPhotos(): Promise<StoredPhoto[]> {
  try {
    const r = await fetch('/api/photos');
    if (!r.ok) return [];
    const j = await r.json();
    return (j.photos || []) as StoredPhoto[];
  } catch {
    return [];
  }
}

export interface PhotoJob {
  name: string;
  role?: string;
  org?: string;
  candidates: PhotoCandidate[];
}

/** Kandidat foto per tokoh dari sebutan hasil pantauan. */
export function jobsFromItems(persons: { name: string; role?: string; org?: string; itemIds: string[] }[], items: AnalyzedItem[]): PhotoJob[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return persons.map((p) => {
    const arts = p.itemIds
      .map((id) => byId.get(id))
      .filter((i): i is AnalyzedItem => Boolean(i && i.channel === 'news'))
      .slice(0, 30)
      .map((i) => ({ title: i.title, url: i.originalUrl || i.url, outlet: i.outlet, image: i.image, images: i.images, persons: (i.a?.persons || []).map((x) => x.name) }));
    return { name: p.name, role: p.role, org: p.org, candidates: photoCandidates(p, arts) };
  });
}

/**
 * Cari foto untuk tokoh yang belum punya. Dikirim 2 tokoh per panggilan (batas ukuran respon),
 * 3 panggilan paralel. Tokoh yang tidak ketemu tidak dicari ulang selama 3 hari.
 */
export async function resolvePhotos(jobs: PhotoJob[], have: Record<string, StoredPhoto>, onFound: (p: StoredPhoto[]) => void, opts: { force?: boolean } = {}) {
  const miss = misses();
  const hidden = hiddenPhotos();
  const seen = new Set<string>();
  const todo = jobs.filter((j) => {
    const k = personKey(j.name);
    if (!k || k.split('-').length < 2 || have[k] || (hidden[k] && !opts.force) || seen.has(k)) return false;
    seen.add(k);
    return opts.force || !miss[k] || Date.now() - miss[k] > RETRY_MS;
  });
  const batches: PhotoJob[][] = [];
  for (let i = 0; i < todo.length; i += 2) batches.push(todo.slice(i, i + 2));
  let n = 0;
  let found = 0;
  await Promise.all(
    Array.from({ length: Math.min(3, batches.length) }, async () => {
      while (n < batches.length) {
        const b = batches[n++];
        try {
          const r = await fetch('/api/photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persons: b, exclude: b.map((x) => hidden[personKey(x.name)]).filter(Boolean) }) });
          if (!r.ok) continue;
          const j = await r.json();
          const got: StoredPhoto[] = [];
          const missed: string[] = [];
          for (const x of j.results || []) {
            if (x.photo) {
              got.push({ ...x.photo, src: await downscale(x.photo.src) });
              unhide(x.photo.key);
            }
            else if (x.key) missed.push(x.key);
          }
          markMiss(missed);
          if (got.length) {
            found += got.length;
            await saveLocalPhotos(got);
            onFound(got);
          }
        } catch {
          /* jaringan: coba lagi lain waktu */
        }
      }
    }),
  );
  return { asked: todo.length, found };
}
