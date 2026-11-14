import type { AnalyzedItem, CollectResponse, Insight, Sentiment } from '../../shared/types';
import { PRESET_TOPICS, PRESET_VERSION, type Topic } from './presets';

export interface TopicResult {
  topicId: string;
  runAt: string;
  from: string;
  to: string;
  items: AnalyzedItem[];
  sources: Omit<CollectResponse, 'items'>[];
  engine: 'gemini' | 'lexicon' | 'mixed';
  insight?: Insight;
}

/* ----------------------------- localStorage kecil ----------------------------- */
const LS = {
  get<T>(k: string, def: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : def;
    } catch {
      return def;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* penyimpanan penuh / diblokir */
    }
  },
};

const K = {
  topics: 'dnvb:brands',
  ver: 'dnvb:presetVersion',
  overrides: 'dnvb:overrides',
  pref: 'dnvb:pref:',
};

export function loadTopics(): Topic[] {
  const saved = LS.get<Topic[] | null>(K.topics, null);
  if (!saved) return PRESET_TOPICS;
  // Migrasi: perbarui query/konteks brand preset bila versi preset naik (pengaturan pengguna dipertahankan)
  const ver = LS.get<number>(K.ver, 1);
  if (ver < PRESET_VERSION) {
    const next = saved.map((t) => {
      const p = PRESET_TOPICS.find((x) => x.id === t.id);
      return t.preset && p ? { ...t, queries: p.queries, context: p.context, name: p.name, short: p.short, kind: p.kind, handles: p.handles } : t;
    });
    for (const p of PRESET_TOPICS) if (!next.some((t) => t.id === p.id)) next.unshift(p);
    LS.set(K.topics, next);
    LS.set(K.ver, PRESET_VERSION);
    return next;
  }
  return saved;
}
export const saveTopics = (t: Topic[]) => {
  LS.set(K.topics, t);
  LS.set(K.ver, PRESET_VERSION);
};
export const resetTopics = () => LS.set(K.topics, PRESET_TOPICS);

export interface Overrides {
  sentiment: Record<string, Sentiment>;
  irrelevant: Record<string, true>;
  starred: Record<string, true>;
}
export const loadOverrides = (): Overrides =>
  LS.get<Overrides>(K.overrides, { sentiment: {}, irrelevant: {}, starred: {} });
export const saveOverrides = (o: Overrides) => LS.set(K.overrides, o);

export const getPref = <T>(k: string, def: T) => LS.get<T>(K.pref + k, def);
export const setPref = (k: string, v: unknown) => LS.set(K.pref + k, v);

/* ------------------------------ IndexedDB hasil ------------------------------ */
const mem = new Map<string, TopicResult>();
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const r = indexedDB.open('dnvb-sosmedtracker', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('results');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

export async function saveResult(r: TopicResult) {
  mem.set(r.topicId, r);
  const d = await db();
  if (!d) return;
  await new Promise<void>((res) => {
    try {
      const tx = d.transaction('results', 'readwrite');
      tx.objectStore('results').put(r, r.topicId);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    } catch {
      res();
    }
  });
}

export async function loadResult(id: string): Promise<TopicResult | undefined> {
  if (mem.has(id)) return mem.get(id);
  const d = await db();
  if (!d) return undefined;
  return new Promise((res) => {
    try {
      const q = d.transaction('results').objectStore('results').get(id);
      q.onsuccess = () => {
        if (q.result) mem.set(id, q.result);
        res(q.result);
      };
      q.onerror = () => res(undefined);
    } catch {
      res(undefined);
    }
  });
}

export async function loadAllResults(ids: string[]) {
  const out: Record<string, TopicResult> = {};
  await Promise.all(
    ids.map(async (id) => {
      const r = await loadResult(id);
      if (r) out[id] = r;
    }),
  );
  return out;
}

export async function deleteResult(id: string) {
  mem.delete(id);
  const d = await db();
  if (!d) return;
  try {
    d.transaction('results', 'readwrite').objectStore('results').delete(id);
  } catch {
    /* abaikan */
  }
}
