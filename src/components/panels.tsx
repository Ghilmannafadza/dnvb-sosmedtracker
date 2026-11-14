import { ArrowUp, Check, ChevronLeft, ChevronRight, ExternalLink, Loader2, Star, Users, X } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { SOURCE_META, type Insight, type Sentiment, type SourceKey } from '../../shared/types';
import { personKey } from '../../shared/photos';
import { jobsFromItems, resolvePhotos } from '../lib/photos';
import { photoFor, type Agg, type PersonAgg, type ViewItem } from '../lib/aggregate';
import { compact, fmtDate, nf, pct0, pct1, SENT_LABEL, timeAgo } from '../lib/format';
import type { Progress } from '../lib/pipeline';
import { useApp } from '../state';
import { SourceIcon } from './SourceIcon';
import { Avatar, Drawer, Empty, Modal, Pager, SentBadge, StackBar } from './ui';

/* ------------------------------ Tokoh ------------------------------ */
export function FigureStrip({ persons, onOpen, onAll, onDeep = false, limit = 20 }: { persons: PersonAgg[]; onOpen: (p: PersonAgg) => void; onAll?: () => void; onDeep?: boolean; limit?: number }) {
  const { health } = useApp();
  const ref = useRef<HTMLUListElement>(null);
  const scroll = (d: number) => ref.current?.scrollBy({ left: d * 340, behavior: 'smooth' });
  if (!persons.length)
    return (
      <p className={`text-[13px] ${onDeep ? 'text-deep-muted' : 'text-muted'}`}>
        Belum ada tokoh terdeteksi pada periode ini.
        {health?.ai.provider === 'lexicon' && ' Ekstraksi tokoh saat ini memakai pola jabatan (Founder, CEO, Kreator, dst.). Isi SUMOPOD_API_KEY atau GEMINI_API_KEY agar tokoh terbaca dari seluruh konteks kalimat.'}
      </p>
    );
  const ctl = onDeep ? 'btn btn-sm border-deep-ink/25 bg-transparent text-deep-ink' : 'btn btn-sm';
  return (
    <div>
    <ul ref={ref} className="scroll-thin -mx-1 flex gap-1 overflow-x-auto pb-2">
      {persons.slice(0, limit).map((p) => (
        <li key={p.name} className="shrink-0">
          <button onClick={() => onOpen(p)} className={`flex w-[112px] flex-col items-center rounded-[16px] px-2 py-3 text-center transition-colors ${onDeep ? 'hover:bg-deep-ink/10' : 'hover:bg-tile'}`}>
            <Avatar name={p.name} size={48} onDeep={onDeep} photo={p.photo?.url} credit={p.photo?.outlet} />
            <span className="mt-2 line-clamp-2 min-h-[32px] text-[12.5px] leading-tight font-medium">{p.name}</span>
            <span className={`mb-2 line-clamp-1 text-[11px] ${onDeep ? 'text-deep-muted' : 'text-muted'}`} title={p.role}>
              {p.role || 'Peran belum terbaca'}
            </span>
            <span className="w-full">
              <StackBar p={p.positive} u={p.neutral} n={p.negative} height={4} labels onDeep={onDeep} />
            </span>
            <span className={`mt-1 text-[11px] tabular-nums ${onDeep ? 'text-deep-muted' : 'text-muted'}`}>{p.total}x disebut</span>
          </button>
        </li>
      ))}
    </ul>
    <div className="no-print mt-2 flex items-center justify-between gap-2">
      <div className="flex gap-1">
        <button className={`${ctl} btn-icon`} onClick={() => scroll(-1)} aria-label="Geser daftar tokoh ke kiri">
          <ChevronLeft size={15} />
        </button>
        <button className={`${ctl} btn-icon`} onClick={() => scroll(1)} aria-label="Geser daftar tokoh ke kanan">
          <ChevronRight size={15} />
        </button>
      </div>
      {onAll && (
        <button className={ctl} onClick={onAll}>
          <Users size={14} /> Semua tokoh ({persons.length})
        </button>
      )}
    </div>
    </div>
  );
}

export function FiguresTable({ persons, onOpen }: { persons: PersonAgg[]; onOpen: (p: PersonAgg) => void }) {
  const [q, setQ] = useState('');
  const list = persons.filter((p) => (p.name + ' ' + (p.role || '') + ' ' + (p.org || '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <label className="label" htmlFor="fig-search">
        Cari tokoh, jabatan, atau organisasi
      </label>
      <input id="fig-search" className="input mb-4" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead className="text-[12px] text-muted">
            <tr>
              <th className="py-2 pr-3 font-normal">Tokoh</th>
              <th className="py-2 pr-3 font-normal">Jabatan · organisasi</th>
              <th className="py-2 pr-3 text-right font-normal">Disebut</th>
              <th className="py-2 font-normal" style={{ width: 160 }}>
                Konteks sentimen
              </th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.name} className="border-t border-line">
                <td className="py-2.5 pr-3">
                  <button className="flex items-center gap-2 text-left font-medium hover:text-primary" onClick={() => onOpen(p)}>
                    <Avatar name={p.name} size={30} photo={p.photo?.url} credit={p.photo?.outlet} />
                    {p.name}
                  </button>
                </td>
                <td className="py-2.5 pr-3 text-ink-2">{[p.role, p.org].filter(Boolean).join(' · ') || '-'}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{p.total}</td>
                <td className="py-2.5">
                  <StackBar p={p.positive} u={p.neutral} n={p.negative} labels />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="py-4 text-[13px] text-muted">Tidak ada tokoh yang cocok dengan pencarian.</p>}
      </div>
    </div>
  );
}

/* --------------------------------- Daftar sebutan --------------------------------- */
const PER_PAGE = 10;

export function MentionList({ items, presetFilter }: { items: ViewItem[]; presetFilter?: { label: string; ids: Set<string>; clear: () => void } | null }) {
  const { overrides, toggleStar } = useApp();
  const [page, setPage] = useState(1);
  const [sent, setSent] = useState<'all' | Sentiment>('all');
  const [src, setSrc] = useState<'all' | SourceKey>('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'new' | 'old' | 'eng' | 'neg'>('new');
  const [onlyStar, setOnlyStar] = useState(false);
  const [open, setOpen] = useState<ViewItem | null>(null);

  const sources = useMemo(() => [...new Set(items.map((i) => i.source))], [items]);
  const list = useMemo(() => {
    let l = items;
    if (presetFilter) l = l.filter((i) => presetFilter.ids.has(i.id));
    if (sent !== 'all') l = l.filter((i) => i.sentiment === sent);
    if (src !== 'all') l = l.filter((i) => i.source === src);
    if (onlyStar) l = l.filter((i) => overrides.starred[i.id]);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((i) => `${i.title} ${i.snippet} ${i.outlet} ${i.author}`.toLowerCase().includes(s));
    }
    const eng = (i: ViewItem) => (i.engagement?.views || 0) + (i.engagement?.likes || 0) * 5 + (i.engagement?.comments || 0) * 10 + (i.engagement?.shares || 0) * 10;
    return [...l].sort((a, b) =>
      sort === 'new' ? b.publishedAt.localeCompare(a.publishedAt) : sort === 'old' ? a.publishedAt.localeCompare(b.publishedAt) : sort === 'eng' ? eng(b) - eng(a) : (a.a?.score ?? 0) - (b.a?.score ?? 0),
    );
  }, [items, sent, src, q, sort, onlyStar, overrides.starred, presetFilter]);

  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const cur = Math.min(page, pages);
  const view = list.slice((cur - 1) * PER_PAGE, cur * PER_PAGE);
  const reset = () => setPage(1);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <div className="col-span-2 sm:col-span-4 lg:col-span-1">
          <label className="sr-only" htmlFor="ml-q">
            Cari di daftar
          </label>
          <input id="ml-q" className="input" placeholder="Cari judul, media, akun" value={q} onChange={(e) => (setQ(e.target.value), reset())} />
        </div>
        <select aria-label="Filter sentimen" className="input" value={sent} onChange={(e) => (setSent(e.target.value as any), reset())}>
          <option value="all">Semua sentimen</option>
          <option value="positive">Positif</option>
          <option value="neutral">Netral</option>
          <option value="negative">Negatif</option>
        </select>
        <select aria-label="Filter sumber" className="input" value={src} onChange={(e) => (setSrc(e.target.value as any), reset())}>
          <option value="all">Semua sumber</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {SOURCE_META[s]?.label || s}
            </option>
          ))}
        </select>
        <select aria-label="Urutkan" className="input" value={sort} onChange={(e) => setSort(e.target.value as any)}>
          <option value="new">Terbaru</option>
          <option value="old">Terlama</option>
          <option value="eng">Interaksi tertinggi</option>
          <option value="neg">Paling negatif</option>
        </select>
        <button className={`btn ${onlyStar ? 'btn-dark' : ''}`} onClick={() => (setOnlyStar(!onlyStar), reset())} aria-pressed={onlyStar}>
          <Star size={14} fill={onlyStar ? 'currentColor' : 'none'} /> Ditandai
        </button>
      </div>
      {presetFilter && (
        <div className="tile mb-3 flex items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
          <span>
            Difilter: <b className="font-semibold">{presetFilter.label}</b>
          </span>
          <button className="btn btn-sm" onClick={presetFilter.clear}>
            <X size={13} /> Hapus filter
          </button>
        </div>
      )}
      {!view.length ? (
        <Empty title={items.length ? 'Tidak ada sebutan yang cocok dengan filter ini' : 'Belum ada sebutan pada periode ini'}>
          {items.length ? 'Longgarkan filter sentimen, sumber, atau kata pencarian.' : 'Perluas periode di kanan atas atau tambah kata kunci pada topik.'}
        </Empty>
      ) : (
        <ul className="divide-y divide-line">
          {view.map((it) => (
            <li key={it.id} className="flex gap-4 py-3.5">
              <div className="w-[64px] shrink-0 pt-0.5 text-[11.5px] leading-tight text-muted tabular-nums">
                {fmtDate(it.publishedAt).replace(/ \d{4}$/, '')}
                <div>{new Date(it.publishedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div className="min-w-0 flex-1">
                <button className="line-clamp-2 text-left text-[14px] leading-snug font-medium text-ink hover:text-primary" onClick={() => setOpen(it)}>
                  {it.title}
                </button>
                {it.snippet && <p className="mt-0.5 line-clamp-1 text-[12.5px] text-ink-2">{it.snippet}</p>}
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <SourceIcon source={it.source} size={14} />
                    {it.outlet}
                  </span>
                  {it.author && <span>@{it.author}</span>}
                  {it.channel === 'news' && it.tier && <span>Tier {it.tier}</span>}
                  {it.a?.issue && <span className="chip">{it.a.subIssue || it.a.issue}</span>}
                  {it.engagement && (it.engagement.views || it.engagement.likes) ? (
                    <span className="tabular-nums">
                      {it.engagement.views ? `${compact(it.engagement.views)} tayang, ` : ''}
                      {compact(it.engagement.likes || 0)} suka
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <SentBadge s={it.sentiment} onClick={() => setOpen(it)} />
                <button
                  onClick={() => toggleStar(it.id)}
                  aria-pressed={!!overrides.starred[it.id]}
                  className={`rounded-full p-1 ${overrides.starred[it.id] ? 'text-ink' : 'text-line-strong hover:text-ink'}`}
                  aria-label={overrides.starred[it.id] ? 'Hapus tanda' : 'Tandai untuk laporan'}
                >
                  <Star size={15} fill={overrides.starred[it.id] ? 'currentColor' : 'none'} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px] text-muted">
        <span className="tabular-nums">
          {list.length ? (cur - 1) * PER_PAGE + 1 : 0} sampai {Math.min(cur * PER_PAGE, list.length)} dari {nf(list.length)}
        </span>
        <Pager page={cur} pages={pages} onPage={setPage} />
      </div>
      {open && <ItemDrawer item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function ItemDrawer({ item, onClose }: { item: ViewItem; onClose: () => void }) {
  const { overrides, setSentiment, toggleIrrelevant, health } = useApp();
  const a = item.a;
  const overridden = overrides.sentiment[item.id];
  return (
    <Drawer onClose={onClose} title={item.channel === 'news' ? 'Detail berita' : 'Detail unggahan'}>
      <div className="space-y-6 text-[13.5px]">
        <div>
          <div className="meta">
            {item.outlet} · {fmtDate(item.publishedAt, true)} · {timeAgo(item.publishedAt)}
          </div>
          <h3 className="mt-2 text-[20px] leading-snug font-bold">{item.title}</h3>
          {item.snippet && <p className="mt-2 leading-relaxed text-ink-2">{item.snippet}</p>}
          {item.body ? (
            <details className="tile mt-3 px-4 py-3">
              <summary className="cursor-pointer text-[12.5px] font-medium">Isi artikel yang dibaca sistem ({nf(item.body.length)} karakter)</summary>
              <p className="mt-2 max-h-72 overflow-y-auto text-[12.5px] leading-relaxed whitespace-pre-line text-ink-2">{item.body.slice(0, 3000)}</p>
            </details>
          ) : (
            item.channel === 'news' && <p className="meta mt-2">Isi artikel tidak dapat dibaca; analisis memakai judul dan cuplikan.</p>
          )}
          <a href={item.url} target="_blank" rel="noreferrer" className="btn btn-sm mt-4">
            <ExternalLink size={13} /> Buka di {item.outlet}
          </a>
        </div>

        <fieldset className="tile p-4">
          <legend className="sr-only">Sentimen terhadap brand</legend>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[13px] font-medium">Sentimen terhadap brand</span>
            <span className="meta">{a?.engine === 'gemini' ? `dibaca AI${health?.ai.model ? ` (${health.ai.model})` : ''}` : 'dibaca leksikon'}</span>
          </div>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Koreksi sentimen">
            {(['positive', 'neutral', 'negative'] as Sentiment[]).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={item.sentiment === s}
                onClick={() => setSentiment(item.id, s === a?.sentiment ? null : s)}
                className={`btn btn-sm ${item.sentiment === s ? 'btn-dark' : ''}`}
              >
                {item.sentiment === s && <Check size={13} />}
                {SENT_LABEL[s]}
              </button>
            ))}
          </div>
          {overridden && <p className="mt-2 text-[12px] text-ink-2">Dikoreksi manual. Hasil awal: {SENT_LABEL[a?.sentiment || 'neutral']}.</p>}
          {a?.reason && <p className="mt-2 text-[12.5px] text-ink-2">Alasan: {a.reason}</p>}
        </fieldset>

        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3">
          <dt className="text-muted">Kategori isu</dt>
          <dd>{a?.issue || '-'}</dd>
          <dt className="text-muted">Sub-isu</dt>
          <dd>{a?.subIssue || '-'}</dd>
          <dt className="text-muted">Tokoh</dt>
          <dd className="space-y-2">
            {a?.persons?.length
              ? a.persons.map((p) => (
                  <div key={p.name} className="flex flex-wrap items-center gap-2">
                    <Avatar name={p.name} size={24} photo={photoFor(item, p.name)} credit={item.outlet} />
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted">{[p.role, p.org].filter(Boolean).join(' · ')}</span>
                    {p.quote && <span className="block w-full pl-8 text-[12.5px] text-ink-2">“{p.quote}”</span>}
                  </div>
                ))
              : '-'}
          </dd>
          <dt className="text-muted">Organisasi</dt>
          <dd>{a?.organizations?.join(', ') || '-'}</dd>
          <dt className="text-muted">Lokasi</dt>
          <dd>{a?.locations?.join(', ') || '-'}</dd>
          {item.semantic !== undefined && (
            <>
              <dt className="text-muted">Kemiripan makna</dt>
              <dd className="tabular-nums">{Math.round(item.semantic * 100)}% dengan profil brand</dd>
            </>
          )}
          <dt className="text-muted">Sumber data</dt>
          <dd className="flex items-center gap-1.5">
            <SourceIcon source={item.source} size={14} />
            {SOURCE_META[item.source]?.label}
            {item.channel === 'news' && item.tier ? `, Tier ${item.tier}` : ''}
          </dd>
          {item.engagement && (
            <>
              <dt className="text-muted">Interaksi</dt>
              <dd className="tabular-nums">
                {nf(item.engagement.views || 0)} tayang, {nf(item.engagement.likes || 0)} suka, {nf(item.engagement.comments || 0)} komentar, {nf(item.engagement.shares || 0)} bagikan
              </dd>
            </>
          )}
        </dl>

        <button className="btn" onClick={() => (toggleIrrelevant(item.id), onClose())}>
          {overrides.irrelevant[item.id] ? 'Masukkan kembali ke analisis' : 'Keluarkan dari analisis (tidak relevan)'}
        </button>
      </div>
    </Drawer>
  );
}

/* ---------------------------------- Ringkasan ---------------------------------- */
export function InsightPanel({ insight, onRefresh, loading, photos }: { insight?: Insight; onRefresh?: () => void; loading?: boolean; photos?: Record<string, string> }) {
  if (!insight) return <Empty title="Ringkasan belum tersedia">Ringkasan disusun otomatis setelah pemantauan selesai.</Empty>;
  const lvl = { tinggi: 'badge-negative', sedang: 'badge-warn', rendah: 'badge-positive' } as const;
  return (
    <div className="grid gap-8 lg:grid-cols-[1.25fr_1fr]">
      <div>
        <p className="text-[20px] leading-[1.5] font-semibold tracking-[-0.01em] text-ink sm:text-[22px]">{insight.executiveSummary}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-[12px] text-muted">
          <span>
            {insight.engine === 'gemini' ? 'Disusun AI' : 'Disusun dari templat statistik (tanpa AI)'} · {fmtDate(insight.generatedAt, true)}
          </span>
          {onRefresh && (
            <button className="btn btn-sm no-print" onClick={onRefresh} disabled={loading}>
              {loading && <Loader2 size={13} className="animate-spin" />} Susun ulang dengan koreksi terbaru
            </button>
          )}
        </div>
        <h3 className="mt-8 mb-3 text-[13px] font-semibold">Temuan kunci</h3>
        <ol className="space-y-2.5">
          {insight.keyFindings.map((f, i) => (
            <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-ink-2">
              <span className="w-5 shrink-0 text-muted tabular-nums">{String(i + 1).padStart(2, '0')}</span>
              <span>{f}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-6">
        <section>
          <h3 className="mb-3 text-[13px] font-semibold">Isu utama</h3>
          <ul className="space-y-3">
            {insight.mainIssues.map((m, i) => (
              <li key={i} className="tile p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13.5px] font-medium">{m.issue}</span>
                  <SentBadge s={m.sentiment} />
                </div>
                <p className="mt-1 text-[12.5px] text-ink-2">{m.description}</p>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h3 className="mb-3 text-[13px] font-semibold">Risiko reputasi</h3>
          {insight.risks.length ? (
            <ul className="space-y-2.5">
              {insight.risks.map((r, i) => (
                <li key={i} className="flex gap-3 text-[13px]">
                  <span className={`badge h-fit capitalize ${lvl[r.level]}`}>{r.level}</span>
                  <span>
                    <span className="font-medium">{r.title}.</span> <span className="text-ink-2">{r.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-muted">Tidak ada risiko yang menonjol pada periode ini.</p>
          )}
        </section>
        <section>
          <h3 className="mb-3 text-[13px] font-semibold">Rekomendasi tindakan</h3>
          <ul className="list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-ink-2">
            {insight.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>
        {insight.stakeholders?.length > 0 && (
          <section>
            <h3 className="mb-3 text-[13px] font-semibold">Pemangku kepentingan</h3>
            <ul className="space-y-2.5">
              {insight.stakeholders.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <Avatar name={s.name} size={32} photo={photos?.[s.name.toLowerCase()]} />
                  <div className="min-w-0 text-[13px]">
                    <div className="font-medium">
                      {s.name} <span className="font-normal text-muted">· {s.position}</span>
                    </div>
                    <div className="text-[12.5px] text-ink-2">{s.note}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Progres --------------------------------- */
export function ProgressPanel({ p }: { p: Progress }) {
  const phases = [
    ['collect', p.rss ? (p.rss.discovering ? `Mencari di media online dan media sosial (menemukan feed RSS: bagian ${p.rss.discovering}, ${p.rss.feeds} feed)` : `Mencari di media online dan media sosial (RSS: ${p.rss.done} dari ${p.rss.feeds} feed, ${p.rss.scanned} artikel dipindai)`) : 'Mencari di media online dan media sosial'],
    ['enrich', p.read ? `Membaca isi artikel (${p.read.done} dari ${p.read.total}, ${p.read.ok} terbaca, ${p.read.dropped} tidak relevan dibuang${p.read.semantic ? `, ${p.read.semantic} dibuang saringan makna` : ''}${p.read.crawled ? `, ${p.read.crawled} dari halaman tag` : ''})` : 'Membaca isi artikel'],
    ['analyze', `Membaca sentimen, tokoh, dan isu (${p.analyzed} dari ${p.total})`],
    ['insight', 'Menyusun ringkasan'],
  ] as const;
  const order = ['collect', 'enrich', 'analyze', 'insight', 'done'];
  const curIdx = order.indexOf(p.phase);
  return (
    <div className="space-y-4" aria-live="polite">
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {phases.map(([k, label], i) => {
          const done = curIdx > i || p.phase === 'done';
          const now = curIdx === i;
          return (
            <li key={k} className={`tile flex items-center gap-2.5 px-4 py-3 text-[13px] ${now ? 'ring-1 ring-ink' : ''}`}>
              {done ? <Check size={15} /> : now ? <Loader2 size={15} className="animate-spin" /> : <span className="w-[15px] text-center text-muted">{i + 1}</span>}
              <span className={done || now ? 'text-ink' : 'text-muted'}>{label}</span>
            </li>
          );
        })}
      </ol>
      {p.phase === 'analyze' && p.total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-tile" role="progressbar" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.analyzed}>
          <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(p.analyzed / p.total) * 100}%` }} />
        </div>
      )}
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
        {(Object.entries(p.sources) as [SourceKey, NonNullable<Progress['sources'][SourceKey]>][]).map(([k, s]) => (
          <li key={k} className={s.state === 'skip' ? 'text-muted' : 'text-ink-2'} title={s.error}>
            <SourceIcon source={k} size={13} className="mr-1 inline-block align-[-2px]" />
            {SOURCE_META[k].label}:{' '}
            <span className="tabular-nums">
              {s.state === 'run' ? 'mencari' : s.state === 'ok' ? `${s.count} hasil` : s.state === 'err' ? 'gagal' : s.state === 'skip' ? 'nonaktif' : 'antre'}
            </span>
            {s.via && s.state === 'ok' && <span className="meta"> · {s.via}</span>}
          </li>
        ))}
      </ul>
      {p.message && <p className="text-[12.5px] text-neg-text">{p.message}</p>}
    </div>
  );
}

/* ---------------------------------- Peringatan ---------------------------------- */
export function AlertsList({ agg, onPickDay }: { agg: Agg; onPickDay?: (d: string) => void }) {
  const negIssues = agg.issues.filter((i) => i.negative > 0 && i.negative / i.total >= 0.4).slice(0, 3);
  const viral = agg.items
    .filter((i) => i.channel === 'social' && i.sentiment === 'negative')
    .sort((a, b) => (b.engagement?.views || 0) + (b.engagement?.likes || 0) * 10 - ((a.engagement?.views || 0) + (a.engagement?.likes || 0) * 10))
    .slice(0, 2);
  const t1neg = agg.items.filter((i) => i.channel === 'news' && i.tier === 1 && i.sentiment === 'negative').length;
  const alerts: { level: 'tinggi' | 'sedang'; title: string; text: string; day?: string }[] = [];
  agg.spikes
    .slice(-3)
    .reverse()
    .forEach((s) => alerts.push({ level: s.negative >= 5 ? 'tinggi' : 'sedang', title: `Lonjakan negatif ${fmtDate(s.name)}`, text: `${s.negative} dari ${s.total} sebutan bernada negatif.`, day: s.name }));
  negIssues.forEach((i) => alerts.push({ level: i.negative / i.total > 0.6 ? 'tinggi' : 'sedang', title: i.name, text: `${pct0((i.negative / i.total) * 100)} dari ${i.total} sebutan negatif.` }));
  if (t1neg) alerts.push({ level: t1neg >= 3 ? 'tinggi' : 'sedang', title: 'Media nasional Tier 1', text: `${t1neg} berita negatif, berpotensi menjadi isu nasional.` });
  viral.forEach((v) => alerts.push({ level: 'sedang', title: `Unggahan ramai di ${v.outlet}`, text: v.title.slice(0, 110) }));
  const [all, setAll] = useState(false);
  if (!alerts.length) return <p className="text-[13px] text-ink-2">Tidak ada sinyal krisis pada periode ini: tidak ada lonjakan negatif harian, isu dominan negatif, atau berita negatif di media Tier 1.</p>;
  const shown = all ? alerts : alerts.slice(0, 4);
  return (
    <div>
    <ul className="space-y-2">
      {shown.map((a, i) => {
        const body = (
          <>
            <span className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">{a.title}</span>
              <span className={`badge ${a.level === 'tinggi' ? 'badge-negative' : 'badge-warn'}`}>{a.level === 'tinggi' ? 'Tinggi' : 'Sedang'}</span>
            </span>
            <span className="mt-0.5 block text-[12.5px] text-ink-2">{a.text}</span>
          </>
        );
        return (
          <li key={i}>
            {a.day && onPickDay ? (
              <button className="tile block w-full px-4 py-3 text-left hover:ring-1 hover:ring-line-strong" onClick={() => onPickDay(a.day!)}>
                {body}
              </button>
            ) : (
              <div className="tile px-4 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
    {alerts.length > 4 && (
      <button className="btn btn-sm mt-3" onClick={() => setAll(!all)} aria-expanded={all}>
        {all ? 'Tampilkan lebih sedikit' : `Tampilkan ${alerts.length - 4} peringatan lain`}
      </button>
    )}
    </div>
  );
}

export function PersonModal({ person, items, onClose }: { person: PersonAgg; items: ViewItem[]; onClose: () => void }) {
  const [open, setOpen] = useState<ViewItem | null>(null);
  const { photos, removePhoto, addStored } = useApp();
  const [busy, setBusy] = useState<'idle' | 'search' | 'none'>('idle');
  const list = items.filter((i) => person.itemIds.includes(i.id));
  const key = personKey(person.name);
  const stored = photos[key];
  const search = async () => {
    setBusy('search');
    const r = await resolvePhotos(jobsFromItems([person], items), {}, (got) => got.forEach((g) => addStored(g)), { force: true });
    setBusy(r.found ? 'idle' : 'none');
  };
  return (
    <Modal onClose={onClose} title="Profil tokoh" width={720}>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar name={person.name} size={72} photo={person.photo?.url} credit={person.photo?.outlet} />
        <div className="min-w-0 flex-1">
          <div className="text-[22px] font-bold">{person.name}</div>
          <div className="meta">{[person.role, person.org].filter(Boolean).join(' · ') || 'Peran belum terbaca'}</div>
          {stored ? (
            <div className="meta mt-1">
              Foto tersimpan: {stored.credit}
              {stored.sourceUrl && (
                <>
                  {' '}
                  (<a className="underline" href={stored.sourceUrl} target="_blank" rel="noreferrer">sumber</a>)
                </>
              )}
              .{' '}
              <button type="button" className="underline" onClick={() => removePhoto(key)}>
                Bukan orang ini
              </button>
            </div>
          ) : person.photo ? (
            <div className="meta mt-1">Foto: {person.photo.outlet}. {person.photo.caption.slice(0, 120)}</div>
          ) : (
            <div className="meta mt-1">
              {busy === 'search' ? (
                <span className="inline-flex items-center gap-1"><Loader2 size={12} className="animate-spin" /> Mencari foto di berita…</span>
              ) : busy === 'none' ? (
                'Foto belum ditemukan di berita maupun Wikipedia.'
              ) : (
                <button type="button" className="underline" onClick={search}>
                  Cari foto tokoh
                </button>
              )}
            </div>
          )}
        </div>
        <div className="w-48">
          <StackBar p={person.positive} u={person.neutral} n={person.negative} labels height={6} />
          <div className="meta mt-1 text-right">{person.total}x disebut</div>
        </div>
      </div>
      {person.quotes?.length > 0 && (
        <div className="mb-5">
          <h4 className="mb-2 text-[13px] font-semibold">Pernyataan</h4>
          <ul className="space-y-2">
            {person.quotes.map((q, k) => (
              <li key={k} className="tile px-4 py-3 text-[13px] leading-relaxed">
                “{q.text}”
                <span className="meta block mt-1">{items.find((x) => x.id === q.itemId)?.outlet}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h4 className="mb-1 text-[13px] font-semibold">Sebutan ({list.length})</h4>
      <ul className="divide-y divide-line">
        {list.map((it) => (
          <li key={it.id} className="flex items-start gap-3 py-3">
            <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(it)}>
              <div className="text-[13.5px] font-medium hover:text-primary">{it.title}</div>
              <div className="meta">
                {it.outlet} · {fmtDate(it.publishedAt)}
              </div>
            </button>
            <SentBadge s={it.sentiment} />
          </li>
        ))}
      </ul>
      {open && <ItemDrawer item={open} onClose={() => setOpen(null)} />}
    </Modal>
  );
}

/* ---------------------------------- Tanya data ---------------------------------- */
interface Msg {
  role: 'user' | 'bot';
  text: string;
  refs?: ViewItem[];
}

/** Pertanyaan siap pakai dijawab langsung dari agregat (tanpa AI), jadi selalu berfungsi. */
function localAnswer(key: string, agg: Agg): Msg {
  const negIss = [...agg.issues].sort((a, b) => b.negative - a.negative)[0];
  const negOut = [...agg.outlets].sort((a, b) => b.negative - a.negative)[0];
  const negPer = [...agg.persons].sort((a, b) => b.negative - a.negative)[0];
  const negItems = agg.items.filter((i) => i.sentiment === 'negative').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  if (key === 'issue')
    return negIss?.negative
      ? { role: 'bot', text: `Isu dengan sebutan negatif terbanyak adalah ${negIss.name}: ${negIss.negative} dari ${negIss.total} sebutan (${pct1((negIss.negative / negIss.total) * 100)}). Contoh terbaru di bawah.`, refs: negItems.filter((i) => i.a?.issue === negIss.name).slice(0, 3) }
      : { role: 'bot', text: 'Belum ada isu bernada negatif pada periode ini.' };
  if (key === 'person')
    return negPer?.negative
      ? { role: 'bot', text: `${negPer.name}${negPer.role ? ` (${negPer.role})` : ''} paling sering muncul di sebutan negatif: ${negPer.negative} dari ${negPer.total} kali disebut.`, refs: agg.items.filter((i) => negPer.itemIds.includes(i.id) && i.sentiment === 'negative').slice(0, 3) }
      : { role: 'bot', text: 'Belum ada tokoh yang muncul dalam konteks negatif.' };
  if (key === 'outlet')
    return negOut?.negative
      ? { role: 'bot', text: `${negOut.name} memuat sebutan negatif terbanyak: ${negOut.negative} dari ${negOut.total}.`, refs: negItems.filter((i) => i.outlet === negOut.name).slice(0, 3) }
      : { role: 'bot', text: 'Belum ada media yang memuat sebutan negatif.' };
  const recent = negItems.slice(0, 3);
  return recent.length
    ? { role: 'bot', text: `Tiga sebutan negatif terbaru yang perlu ditinjau tim komunikasi:`, refs: recent }
    : { role: 'bot', text: 'Tidak ada sebutan negatif yang perlu direspons pada periode ini.' };
}

export function AskPanel({ topic, context, agg }: { topic: string; context?: string; agg: Agg }) {
  const { health } = useApp();
  const ai = !!health && health.ai.provider !== 'lexicon';
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<ViewItem | null>(null);
  const PRESET = [
    { key: 'issue', label: 'Isu negatif terbesar apa?' },
    { key: 'person', label: 'Tokoh mana yang paling kritis?' },
    { key: 'outlet', label: 'Media mana paling banyak memberitakan negatif?' },
    { key: 'respond', label: 'Apa yang perlu direspons sekarang?' },
  ];
  const ask = async (e?: FormEvent) => {
    e?.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setQ('');
    setMsgs((m) => [...m, { role: 'user', text: question }]);
    setBusy(true);
    const heads = agg.items.slice(0, 80);
    try {
      const r = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          context,
          question,
          stats: { total: agg.total, news: agg.news, social: agg.social, sentiment: agg.sent, issues: agg.issues.slice(0, 8), persons: agg.persons.slice(0, 10).map((p) => ({ name: p.name, role: p.role, total: p.total, negative: p.negative })) },
          headlines: heads.map((h, i) => ({ n: i + 1, title: h.title, outlet: h.outlet, date: h.publishedAt.slice(0, 10), sentiment: h.sentiment, issue: h.a?.issue || 'Lainnya' })),
        }),
      });
      const j = await r.json();
      setMsgs((m) => [...m, j.answer ? { role: 'bot', text: j.answer, refs: (j.refs || []).map((n: number) => heads[n - 1]).filter(Boolean).slice(0, 4) } : { role: 'bot', text: j.error || 'Tidak ada jawaban.' }]);
    } catch {
      setMsgs((m) => [...m, { role: 'bot', text: 'Server tidak dapat dihubungi. Coba lagi beberapa saat.' }]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex h-full min-h-[360px] flex-col">
      <div className="scroll-thin flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {!msgs.length && <p className="text-[13px] leading-relaxed text-ink-2">Tanyakan apa saja tentang hasil pantauan ini. Jawaban hanya diambil dari sebutan yang sudah terkumpul.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ml-8 flex justify-end' : 'mr-4'}>
            <div className={`rounded-[16px] px-3.5 py-2.5 text-[13px] leading-relaxed ${m.role === 'user' ? 'bg-ink text-canvas' : 'bg-tile text-ink'}`}>
              {m.text}
              {m.refs && m.refs.length > 0 && (
                <ul className="mt-2 space-y-1.5 border-t border-line pt-2">
                  {m.refs.map((r) => (
                    <li key={r.id}>
                      <button className="text-left text-[12.5px] underline-offset-2 hover:text-primary" onClick={() => setOpen(r)}>
                        {r.title} <span className="text-muted">({r.outlet})</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <Loader2 size={13} className="animate-spin" /> Membaca data
          </div>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {PRESET.map((p) => (
          <button key={p.key} className="chip hover:bg-accent hover:text-accent-ink" onClick={() => setMsgs((m) => [...m, { role: 'user', text: p.label }, localAnswer(p.key, agg)])}>
            {p.label}
          </button>
        ))}
      </div>
      <form onSubmit={ask} className="tile mt-3 flex items-center gap-2 p-1.5 pl-4">
        <label htmlFor="ask-q" className="sr-only">
          Pertanyaan bebas
        </label>
        <input
          id="ask-q"
          className="h-9 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted disabled:cursor-not-allowed"
          placeholder={ai ? 'Tulis pertanyaan' : 'Pertanyaan bebas butuh kunci AI (SUMOPOD_API_KEY)'}
          value={q}
          disabled={!ai}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn btn-dark btn-icon h-9 w-9 min-w-9" disabled={!ai || !q.trim() || busy} aria-label="Kirim pertanyaan">
          <ArrowUp size={15} />
        </button>
      </form>
      {open && <ItemDrawer item={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
