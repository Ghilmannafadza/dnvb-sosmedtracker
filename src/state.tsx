import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { HealthResponse, Sentiment, SourceKey } from '../shared/types';
import type { StoredPhoto } from '../shared/photos';
import { aggregate } from './lib/aggregate';
import { deleteLocalPhoto, fetchServerPhotos, hiddenPhotos, hidePhoto, jobsFromItems, loadLocalPhotos, resolvePhotos, saveLocalPhotos } from './lib/photos';
import { rangeFromPreset } from './lib/format';
import { fetchHealth, generateInsight, runTopic, type Progress } from './lib/pipeline';
import type { Topic } from './lib/presets';
import {
  getPref,
  loadAllResults,
  loadOverrides,
  loadTopics,
  saveOverrides,
  saveResult,
  saveTopics,
  setPref,
  type Overrides,
  type TopicResult,
} from './lib/store';

export type Channel = 'all' | 'news' | 'social';

interface Ctx {
  topics: Topic[];
  setTopics: (t: Topic[]) => void;
  results: Record<string, TopicResult>;
  overrides: Overrides;
  setSentiment: (id: string, s: Sentiment | null) => void;
  toggleIrrelevant: (id: string) => void;
  toggleStar: (id: string) => void;
  health: HealthResponse | null;
  range: { from: string; to: string; preset: string };
  setRange: (r: { from: string; to: string; preset: string }) => void;
  channel: Channel;
  setChannel: (c: Channel) => void;
  progress: Record<string, Progress>;
  run: (topic: Topic) => Promise<TopicResult | undefined>;
  runMany: (topics: Topic[]) => Promise<void>;
  refreshInsight: (topic: Topic) => Promise<void>;
  putResult: (r: TopicResult) => void;
  dark: boolean;
  setDark: (d: boolean) => void;
  /** foto tokoh tersimpan, kunci = personKey(nama) */
  photos: Record<string, StoredPhoto>;
  photoJob: { running: boolean; asked: number; found: number } | null;
  findPhotos: (topicIds?: string[], force?: boolean) => Promise<void>;
  removePhoto: (key: string) => void;
  addStored: (p: StoredPhoto) => void;
}

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

export function AppProvider({ children }: { children: ReactNode }) {
  const [topics, setTopicsState] = useState<Topic[]>(loadTopics);
  const [results, setResults] = useState<Record<string, TopicResult>>({});
  const [overrides, setOverrides] = useState<Overrides>(loadOverrides);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [range, setRangeState] = useState(() => {
    const preset = getPref<string>('rangePreset', '90d');
    const saved = getPref<{ from: string; to: string } | null>('rangeCustom', null);
    return preset === 'custom' && saved ? { ...saved, preset } : { ...rangeFromPreset(preset), preset };
  });
  const [channel, setChannelState] = useState<Channel>(() => getPref('channel', 'all'));
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [dark, setDarkState] = useState(() => document.documentElement.classList.contains('dark'));
  const [photos, setPhotos] = useState<Record<string, StoredPhoto>>({});
  const [photoJob, setPhotoJob] = useState<Ctx['photoJob']>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const photosRef = useRef(photos);
  photosRef.current = photos;
  const resultsRef = useRef(results);
  resultsRef.current = results;
  const photoBusy = useRef(false);

  const addPhotos = useCallback((list: StoredPhoto[]) => {
    if (!list.length) return;
    setPhotos((prev) => {
      const next = { ...prev };
      for (const p of list) next[p.key] = p;
      return next;
    });
  }, []);

  /** Cari foto untuk tokoh teratas tiap topik yang belum punya foto tersimpan. */
  const findPhotos = useCallback(
    async (topicIds?: string[], force = false) => {
      if (photoBusy.current) return;
      photoBusy.current = true;
      try {
        const rs = Object.values(resultsRef.current).filter((r) => !topicIds || topicIds.includes(r.topicId));
        const jobs = rs.flatMap((r) => jobsFromItems(aggregate(r.items).persons.slice(0, 40), r.items));
        if (!jobs.length) return;
        setPhotoJob({ running: true, asked: 0, found: 0 });
        const st = await resolvePhotos(jobs, photosRef.current, addPhotos, { force });
        setPhotoJob({ running: false, ...st });
      } finally {
        photoBusy.current = false;
      }
    },
    [addPhotos],
  );

  useEffect(() => {
    fetchHealth().then(setHealth);
    // Foto tersimpan: lokal dulu (instan), lalu daftar server (Vercel Blob) bila ada
    loadLocalPhotos().then((local) => {
      setPhotos((prev) => ({ ...local, ...prev }));
      fetchServerPhotos().then((srv) => {
        const hidden = hiddenPhotos();
        const fresh = srv.filter((p) => !hidden[p.key] && (!local[p.key] || local[p.key].savedAt < p.savedAt));
        saveLocalPhotos(fresh);
        addPhotos(fresh);
      });
    });
    loadAllResults(topics.map((t) => t.id)).then((r) => {
      setResults((prev) => ({ ...r, ...prev }));
      resultsRef.current = { ...r, ...resultsRef.current };
      // Hasil pantauan lama (sebelum fitur foto): lengkapi foto tokohnya di latar belakang
      setTimeout(() => findPhotos(), 1500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTopics = useCallback((t: Topic[]) => {
    setTopicsState(t);
    saveTopics(t);
  }, []);

  const updateOv = useCallback((fn: (o: Overrides) => Overrides) => {
    setOverrides((prev) => {
      const next = fn(structuredClone(prev));
      saveOverrides(next);
      return next;
    });
  }, []);

  const enabled = useMemo(() => {
    const e: Partial<Record<SourceKey, boolean>> = {};
    if (health) (Object.keys(health.sources) as SourceKey[]).forEach((k) => (e[k] = health.sources[k].enabled));
    return e;
  }, [health]);

  const putResult = useCallback((r: TopicResult) => {
    setResults((prev) => ({ ...prev, [r.topicId]: r }));
    saveResult(r);
  }, []);

  const run = useCallback(
    async (topic: Topic) => {
      try {
        const r = await runTopic(topic, rangeRef.current, enabled, (p) => setProgress((prev) => ({ ...prev, [topic.id]: p })));
        putResult(r);
        resultsRef.current = { ...resultsRef.current, [r.topicId]: r };
        findPhotos([r.topicId]);
        return r;
      } catch (e) {
        setProgress((prev) => ({
          ...prev,
          [topic.id]: { phase: 'error', sources: {}, analyzed: 0, total: 0, message: String((e as Error).message) },
        }));
      }
    },
    [enabled, putResult, findPhotos],
  );

  const runMany = useCallback(
    async (ts: Topic[]) => {
      // dua topik paralel agar tidak membebani sumber data
      let i = 0;
      await Promise.all(
        Array.from({ length: Math.min(2, ts.length) }, async () => {
          while (i < ts.length) await run(ts[i++]);
        }),
      );
    },
    [run],
  );

  const refreshInsight = useCallback(
    async (topic: Topic) => {
      const r = results[topic.id];
      if (!r) return;
      const insight = await generateInsight(topic, r, overrides);
      putResult({ ...r, insight });
    },
    [results, overrides, putResult],
  );

  const value: Ctx = {
    photos,
    photoJob,
    findPhotos,
    addStored: (p) => addPhotos([p]),
    removePhoto: (key) => {
      hidePhoto(key, photos[key]?.sourceUrl || photos[key]?.src || '');
      setPhotos((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      deleteLocalPhoto(key);
    },
    topics,
    setTopics,
    results,
    overrides,
    setSentiment: (id, s) =>
      updateOv((o) => {
        if (s) o.sentiment[id] = s;
        else delete o.sentiment[id];
        return o;
      }),
    toggleIrrelevant: (id) =>
      updateOv((o) => {
        if (o.irrelevant[id]) delete o.irrelevant[id];
        else o.irrelevant[id] = true;
        return o;
      }),
    toggleStar: (id) =>
      updateOv((o) => {
        if (o.starred[id]) delete o.starred[id];
        else o.starred[id] = true;
        return o;
      }),
    health,
    range,
    setRange: (r) => {
      setRangeState(r);
      setPref('rangePreset', r.preset);
      if (r.preset === 'custom') setPref('rangeCustom', { from: r.from, to: r.to });
    },
    channel,
    setChannel: (c) => {
      setChannelState(c);
      setPref('channel', c);
    },
    progress,
    run,
    runMany,
    refreshInsight,
    putResult,
    dark,
    setDark: (d) => {
      setDarkState(d);
      document.documentElement.classList.toggle('dark', d);
      try {
        localStorage.setItem('dnvb:theme', d ? 'dark' : 'light');
      } catch {
        /* abaikan */
      }
    },
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

/* ---------------------------------- router ---------------------------------- */
export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash.slice(1) || '/');
  useEffect(() => {
    const fn = () => setHash(window.location.hash.slice(1) || '/');
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return hash;
}
export const navigate = (path: string) => {
  window.location.hash = path;
};
