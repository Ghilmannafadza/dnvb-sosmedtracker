import { Plus, Trash2 } from 'lucide-react';
import { SOURCE_META, type SourceKey, type TopicQuery } from '../../shared/types';
import { BRAND_KIND_LABEL, type BrandKind, type Topic } from '../lib/presets';
import { useApp } from '../state';
import { SourceIcon } from './SourceIcon';

const toList = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
const toStr = (a?: string[]) => (a || []).join(', ');

export function QueryEditor({ queries, onChange }: { queries: TopicQuery[]; onChange: (q: TopicQuery[]) => void }) {
  const set = (i: number, patch: Partial<TopicQuery>) => onChange(queries.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-3">
      {queries.map((q, i) => (
        <div key={i} className="tile p-4">
          <div className="mb-2 flex items-center justify-between text-[13px] font-medium">
            Query {i + 1}
            {queries.length > 1 && (
              <button type="button" className="btn btn-sm" onClick={() => onChange(queries.filter((_, j) => j !== i))} aria-label="Hapus query">
                <Trash2 size={13} /> Hapus
              </button>
            )}
          </div>
          <label className="label">Kata kunci (salah satu harus muncul, pisahkan dengan koma)</label>
          <input className="input" value={toStr(q.keywords)} onChange={(e) => set(i, { keywords: toList(e.target.value) })} placeholder="Nama Brand, @akunbrand, #hashtagbrand" />
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div>
              <label className="label">Konteks wajib (opsional, salah satu)</label>
              <input className="input" value={toStr(q.context)} onChange={(e) => set(i, { context: toList(e.target.value) })} placeholder="kelas, skincare, Jakarta" />
            </div>
            <div>
              <label className="label">Kecualikan (opsional)</label>
              <input className="input" value={toStr(q.exclude)} onChange={(e) => set(i, { exclude: toList(e.target.value) })} placeholder="nama brand lain yang mirip" />
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-sm" onClick={() => onChange([...queries, { keywords: [] }])}>
        <Plus size={12} /> Tambah query (mis. singkatan yang butuh konteks)
      </button>
    </div>
  );
}

const PICK_GROUPS = [
  { key: 'social', label: 'Kanal utama (media sosial)' },
  { key: 'news', label: 'Media web' },
  { key: 'other', label: 'Sosmed tambahan (opsional)' },
] as const;

export function SourcePicker({ value, onChange }: { value: SourceKey[]; onChange: (v: SourceKey[]) => void }) {
  const { health } = useApp();
  return (
    <div className="space-y-3" role="group" aria-label="Pilih sumber data">
      {PICK_GROUPS.map((g) => {
        const list = (Object.keys(SOURCE_META) as SourceKey[]).filter((s) => SOURCE_META[s].group === g.key);
        const allOn = list.every((s) => value.includes(s));
        return (
          <div key={g.key}>
            <div className="mb-1.5 flex items-center gap-3">
              <span className="meta">{g.label}</span>
              <button type="button" className="meta underline" onClick={() => onChange(allOn ? value.filter((x) => !list.includes(x)) : [...new Set([...value, ...list])])}>
                {allOn ? 'kosongkan' : 'pilih semua'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {list.map((s) => {
                const st = health?.sources[s];
                const enabled = health ? st?.enabled : true;
                const on = value.includes(s);
                const label = `${SOURCE_META[s].label}${enabled ? (st?.active ? ` (lewat ${st.active})` : '') : ` (nonaktif: ${st?.reason || 'butuh kunci'})`}`;
                return (
                  <label
                    key={s}
                    title={label}
                    className={`relative flex h-12 w-12 cursor-pointer items-center justify-center rounded-[14px] border transition-colors focus-within:ring-2 focus-within:ring-secondary ${on ? 'border-primary bg-panel' : 'border-line bg-tile opacity-45 hover:opacity-80'}`}
                  >
                    <input type="checkbox" className="sr-only" aria-label={label} checked={on} onChange={(e) => onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s))} />
                    <SourceIcon source={s} size={22} />
                    {on && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-white" aria-hidden>✓</span>}
                    {!enabled && <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full bg-warn ring-2 ring-panel" aria-hidden />}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
      <p className="meta">Arahkan kursor ke logo untuk nama sumber dan jalur yang dipakai. Titik kuning: belum ada jalur aktif (lihat halaman Sumber Data).</p>
    </div>
  );
}

export function TopicForm({ topic, onChange }: { topic: Topic; onChange: (t: Topic) => void }) {
  const set = (p: Partial<Topic>) => onChange({ ...topic, ...p });
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_80px]">
        <div>
          <label className="label">Nama brand</label>
          <input className="input" value={topic.name} onChange={(e) => set({ name: e.target.value })} placeholder="Contoh: Kopi Kenangan" />
        </div>
        <div>
          <label className="label">Singkatan</label>
          <input className="input" value={topic.short} maxLength={10} onChange={(e) => set({ short: e.target.value.toUpperCase() })} />
        </div>
        <div>
          <label className="label">Warna</label>
          <input type="color" className="input p-1" value={topic.color} onChange={(e) => set({ color: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <div>
          <span className="label">Jenis brand</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Jenis brand">
            {(Object.keys(BRAND_KIND_LABEL) as BrandKind[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={(topic.kind || 'client') === k} className={`btn btn-sm ${(topic.kind || 'client') === k ? 'btn-primary' : ''}`} onClick={() => set({ kind: k })}>
                {BRAND_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Akun resmi (tanpa @, pisahkan koma)</label>
          <input
            className="input"
            value={toStr(topic.handles)}
            placeholder="namabrand, namabrand.id"
            onChange={(e) => {
              const handles = toList(e.target.value).map((h) => h.replace(/^@/, ''));
              // akun resmi otomatis ikut jadi kata kunci query pertama (@akun dan akun)
              const old = new Set((topic.handles || []).flatMap((h) => [h, '@' + h]));
              const first = topic.queries[0] || { keywords: [] };
              const kw = [...first.keywords.filter((k) => !old.has(k)), ...handles.flatMap((h) => ['@' + h, h])];
              set({ handles, queries: [{ ...first, keywords: [...new Set(kw)] }, ...topic.queries.slice(1)] });
            }}
          />
        </div>
      </div>
      <div>
        <label className="label">Logo (URL gambar, opsional)</label>
        <input className="input" value={topic.logo || ''} onChange={(e) => set({ logo: e.target.value.trim() || undefined })} placeholder="https://…/logo.png" />
      </div>
      <div>
        <label className="label">Konteks untuk AI: apa brand ini, produknya, dan hal yang BUKAN brand ini. Membantu AI membedakan nama yang mirip</label>
        <textarea className="input h-24 py-2" value={topic.context} onChange={(e) => set({ context: e.target.value })} placeholder="Brand kopi susu asal Jakarta, gerai offline dan aplikasi. Bukan kopi kenangan mantan (lirik/meme)." />
      </div>
      <div>
        <label className="label">Query pencarian</label>
        <QueryEditor queries={topic.queries} onChange={(queries) => set({ queries })} />
      </div>
      <div>
        <label className="label">Kanal yang dipantau</label>
        <SourcePicker value={topic.sources} onChange={(sources) => set({ sources })} />
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={topic.inGroup} onChange={(e) => set({ inGroup: e.target.checked })} />
        Tampilkan di komparasi Ringkasan Brand
      </label>
    </div>
  );
}
