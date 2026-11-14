import { EntityLogo } from './EntityLogo';
import { Download, FileJson, Loader2, Printer } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { SOURCE_META, type SourceKey } from '../../shared/types';
import { aggregate, type PersonAgg, type ViewItem } from '../lib/aggregate';
import { exportCsv, exportJson, slug } from '../lib/export';
import { compact, fmtDate, nf, pct1, SENT_COLOR } from '../lib/format';
import { entitySentence } from '../lib/narrative';
import type { Topic } from '../lib/presets';
import { useApp } from '../state';
import { HairlineTimeline, MiniSpark, NetGauge, SentimentBars, SentimentDonut, WordCloud } from './charts';
import { AlertsList, AskPanel, FigureStrip, FiguresTable, InsightPanel, MentionList, PersonModal, ProgressPanel } from './panels';
import { PlatformIcon, SourceIcon } from './SourceIcon';
import { ArrowButton, Card, Empty, Kpi, Legend, Modal, Reveal, StackBar } from './ui';
import { BRAND_KIND_LABEL } from '../lib/presets';

export type TopicTab = 'ringkasan' | 'sebutan' | 'isu' | 'tokoh' | 'sumber' | 'laporan';
export const TOPIC_TABS: TopicTab[] = ['ringkasan', 'sebutan', 'isu', 'tokoh', 'sumber', 'laporan'];

export default function TopicDashboard({ topic, tab: tabProp, onTab }: { topic: Topic; tab?: TopicTab; onTab?: (t: TopicTab) => void }) {
  const [tabLocal, setTabLocal] = useState<TopicTab>('ringkasan');
  const tab = tabProp || tabLocal;
  const setTab = (t: TopicTab) => {
    if (onTab) onTab(t);
    else setTabLocal(t);
    document.getElementById('main')?.scrollTo({ top: 0 });
  };
  const { results, overrides, channel, range, progress, run, refreshInsight } = useApp();
  const result = results[topic.id];
  const prog = progress[topic.id];
  const running = !!prog && !['done', 'error'].includes(prog.phase);
  const [person, setPerson] = useState<PersonAgg | null>(null);
  const [allFig, setAllFig] = useState(false);
  const [filter, setFilter] = useState<{ label: string; ids: Set<string> } | null>(null);
  const [insLoading, setInsLoading] = useState(false);

  const agg = useMemo(() => (result ? aggregate(result.items, overrides, { channel, from: range.from, to: range.to, queries: topic.queries }) : null), [result, overrides, channel, range.from, range.to, topic.queries]);

  const pick = (label: string, pred: (i: ViewItem) => boolean) => {
    if (!agg) return;
    setFilter({ label, ids: new Set(agg.items.filter(pred).map((i) => i.id)) });
    setTab('sebutan');
  };

  const header = (
    <Reveal className="flex flex-wrap items-end justify-between gap-4 pt-2">
      <div className="min-w-0">
        <span className="eyebrow">{BRAND_KIND_LABEL[topic.kind || 'client']}</span>
        <div className="mt-3 flex items-center gap-3">
          <EntityLogo topic={topic} size={52} />
          <h1 className="display text-[30px] leading-tight sm:text-[40px]">{topic.name}</h1>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {topic.queries.flatMap((q) => q.keywords).map((k) => (
            <span key={k} className="chip">
              {k}
            </span>
          ))}
          {result && (
            <span className="meta ml-1">
              Dipantau {fmtDate(result.runAt, true)} · periode {fmtDate(result.from)} sampai {fmtDate(result.to)} · analisis{' '}
              {result.engine === 'gemini' ? 'AI' : result.engine === 'mixed' ? 'AI dan leksikon' : 'leksikon'}
            </span>
          )}
        </div>
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        {agg && (
          <>
            <button className="btn" onClick={() => exportCsv(`dnvb-sosmedtracker-${slug(topic.short)}-${range.from}_${range.to}`, agg.items)}>
              <Download size={15} /> CSV
            </button>
            <button className="btn btn-icon w-10" onClick={() => exportJson(`dnvb-sosmedtracker-${slug(topic.short)}`, { topic, result })} aria-label="Ekspor JSON lengkap" title="Ekspor JSON lengkap">
              <FileJson size={15} />
            </button>
            <button className="btn" onClick={() => window.print()}>
              <Printer size={15} /> Laporan PDF
            </button>
          </>
        )}
        <ArrowButton disabled={running} onClick={() => run(topic)}>
          {running ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Memantau…
            </>
          ) : result ? (
            'Pantau ulang'
          ) : (
            'Mulai pantau'
          )}
        </ArrowButton>
      </div>
    </Reveal>
  );

  if (!result || !agg)
    return (
      <div className="space-y-4">
        {header}
        {prog && prog.phase !== 'error' && (
          <Card title="Progres pemantauan">
            <ProgressPanel p={prog} />
          </Card>
        )}
        {prog?.phase === 'error' && (
          <Card>
            <Empty title="Pemantauan gagal">{prog.message}</Empty>
          </Card>
        )}
        {!prog && (
          <Card>
            <Empty title="Brand ini belum dipantau">
              Klik Mulai pantau untuk mengumpulkan percakapan tentang brand di Instagram, TikTok, Threads, YouTube (termasuk komentar), dan media web, lalu menilai sentimen positif, netral, dan negatif tiap sebutan.
            </Empty>
          </Card>
        )}
      </div>
    );

  const spark = (k: 'positive' | 'neutral' | 'negative') => agg.timeline.slice(-45).map((d) => d[k]);
  const errSources = result.sources.filter((s) => !s.ok);
  const peak = [...agg.timeline].sort((a, b) => b.total - a.total)[0];


  const negRecent = agg.items.filter((i) => i.sentiment === 'negative').sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 5);
  const eng = (i: ViewItem) => (i.engagement?.views || 0) / 100 + (i.engagement?.likes || 0) + (i.engagement?.comments || 0) * 3;
  const posTop = agg.items.filter((i) => i.sentiment === 'positive').sort((a, b) => eng(b) - eng(a) || (b.a?.score || 0) - (a.a?.score || 0)).slice(0, 5);
  const platformIcon = (n: string) => <PlatformIcon name={n} size={15} />;
  const more = (to: TopicTab, label: string) => (
    <button className="btn btn-sm" onClick={() => setTab(to)}>
      {label} <ArrowRight size={13} />
    </button>
  );
  const TABS: { key: TopicTab; label: string; count?: number; hint: string }[] = [
    { key: 'ringkasan', label: 'Ringkasan', hint: 'Angka utama, tren, dan sinyal' },
    { key: 'sebutan', label: 'Sebutan', count: agg.items.length, hint: 'Semua unggahan, komentar, dan berita' },
    { key: 'isu', label: 'Isu', count: agg.issues.length, hint: 'Apa yang dibicarakan' },
    { key: 'tokoh', label: 'Tokoh & Kreator', count: agg.persons.length, hint: 'Siapa yang disebut' },
    { key: 'sumber', label: 'Kanal & Sumber', hint: 'Di mana dibicarakan' },
    { key: 'laporan', label: 'Laporan & AI', hint: 'Ringkasan, rekomendasi, tanya data' },
  ];

  const sections: Record<TopicTab, ReactNode> = {
    /* ---------------- 1. Ringkasan: agregat di atas, detail lewat tab lain ---------------- */
    ringkasan: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Kpi delay={0} label="Total sebutan" value={nf(agg.total)} sub={`${nf(agg.social)} sosmed · ${nf(agg.news)} media web`} />
          <Kpi delay={60} label="Media sosial" value={nf(agg.social)} sub={`${compact(agg.engagement.views)} tayang · ${compact(agg.engagement.likes)} suka`} />
          <Kpi delay={120} label="Media web" value={nf(agg.news)} sub={`Tier 1: ${agg.tiers[0].total} · Tier 2: ${agg.tiers[1].total}`} />
          <Kpi delay={180} label="Positif" tone="pos" value={pct1(agg.polarity.positivePct)} sub={`${agg.sent.positive} dari ${agg.polarity.base} (netral dikecualikan)`} />
          <Kpi delay={240} label="Negatif" tone="neg" value={pct1(agg.polarity.negativePct)} sub={`${agg.sent.negative} dari ${agg.polarity.base}`} />
          <Kpi delay={300} label="Net sentiment" tone={agg.netSentiment >= 0 ? 'pos' : 'neg'} value={(agg.netSentiment > 0 ? '+' : '') + agg.netSentiment} sub="(positif − negatif) ÷ total × 100" />
        </div>

        <Reveal className="rounded-[20px] bg-primary-soft px-5 py-4 text-[14.5px] leading-relaxed text-ink">
          {entitySentence({ short: topic.short, name: topic.name, agg }, channel)}
          {result.insight?.executiveSummary && <p className="mt-2 text-[13.5px] text-ink-2">{result.insight.executiveSummary}</p>}
        </Reveal>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <Reveal className="relative overflow-hidden rounded-[20px] rounded-tl-[64px] bg-deep p-6 text-deep-ink xl:col-span-2">
            <span className="eyebrow-dark">Skor sentimen</span>
            <h3 className="mt-3 text-[22px] leading-tight font-bold">Bagaimana warganet memandang {topic.short || topic.name}?</h3>
            <div className="mt-4 flex justify-center">
              <NetGauge value={agg.netSentiment} size={260} onDeep />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
              {(['positive', 'neutral', 'negative'] as const).map((k) => (
                <div key={k}>
                  <div className="text-[22px] font-bold tabular-nums" style={{ color: SENT_COLOR[k] }}>
                    {agg.total ? Math.round((agg.sent[k] / agg.total) * 100) : 0}%
                  </div>
                  <div className="text-[12px] text-deep-muted">{k === 'positive' ? 'Positif' : k === 'neutral' ? 'Netral' : 'Negatif'} · {nf(agg.sent[k])}</div>
                </div>
              ))}
            </div>
            <img src="/dnvb/shape-flower.png" alt="" aria-hidden className="pointer-events-none absolute -top-3 -right-3 h-16 w-16 opacity-90 [animation:dnvb-spin_14s_linear_infinite]" />
          </Reveal>
          <Card title="Sentimen per Kanal" className="xl:col-span-3" action={<Legend />}>
            <ChannelSentiment items={agg.items} onPick={(label, pred) => pick(label, pred)} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card title="Tren Sebutan Harian per Sentimen" className="xl:col-span-2" action={<Legend />}>
            <HairlineTimeline data={agg.timeline} height={240} onPickDay={(d) => pick(`Tanggal ${fmtDate(d)}`, (i) => i.publishedAt.startsWith(d))} />
            {peak && peak.total > 0 && (
              <div className="meta mt-1">
                Puncak: {fmtDate(peak.name)} ({peak.total} sebutan, {peak.negative} negatif)
              </div>
            )}
          </Card>
          <Card title="Komposisi Sentimen" delay={80}>
            <SentimentDonut p={agg.sent.positive} u={agg.sent.neutral} n={agg.sent.negative} />
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
              {(['positive', 'neutral', 'negative'] as const).map((k) => (
                <div key={k}>
                  <div className="mb-1 text-[12px] font-semibold tabular-nums" style={{ color: k === 'positive' ? 'var(--pos-text)' : k === 'negative' ? 'var(--neg-text)' : 'var(--neu-text)' }}>
                    {agg.total ? Math.round((agg.sent[k] / agg.total) * 100) : 0}%
                  </div>
                  <MiniSpark data={spark(k)} color={SENT_COLOR[k]} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card title="Sebutan Negatif Terbaru" action={more('sebutan', 'Semua')}>
            <MiniFeed list={negRecent} empty="Tidak ada sebutan negatif pada periode ini." onPick={(it) => pick(`Sebutan: ${it.title.slice(0, 40)}`, (x) => x.id === it.id)} />
          </Card>
          <Card title="Sebutan Positif Teratas" delay={80} action={more('sebutan', 'Semua')}>
            <MiniFeed list={posTop} empty="Belum ada sebutan positif pada periode ini." onPick={(it) => pick(`Sebutan: ${it.title.slice(0, 40)}`, (x) => x.id === it.id)} />
          </Card>
          <Card title="Peringatan Dini" delay={160}>
            <AlertsList agg={agg} onPickDay={(d) => pick(`Tanggal ${fmtDate(d)}`, (i) => i.publishedAt.startsWith(d))} />
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card title="Isu Teratas" action={more('isu', 'Semua isu')}>
            <SentimentBars rows={agg.issues} max={6} onClick={(n) => pick(`Isu ${n}`, (i) => (i.a?.issue || 'Lainnya') === n)} />
          </Card>
          <Card title="Tokoh & Kreator yang Disebut" className="xl:col-span-2" delay={80} action={more('tokoh', 'Semua tokoh')}>
            <FigureStrip persons={agg.persons} onOpen={setPerson} onAll={() => setAllFig(true)} limit={10} />
          </Card>
        </div>
      </div>
    ),

    /* ---------------- 2. Sebutan: rail filter kiri + feed (pola Brand24 / Meltwater) ---------------- */
    sebutan: (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4 xl:order-none">
          <Card title="Saring cepat">
            <p className="meta -mt-2 mb-3">Klik baris untuk menyaring daftar.</p>
            <h4 className="mb-2 text-[12.5px] font-semibold">Platform</h4>
            <SentimentBars rows={agg.platforms} icon={platformIcon} onClick={(n) => pick(`Platform ${n}`, (i) => (i.channel === 'news' ? 'Media web' : SOURCE_META[i.source]?.label) === n)} />
            <h4 className="mt-5 mb-2 text-[12.5px] font-semibold">Tier media</h4>
            <SentimentBars rows={agg.tiers.filter((t) => t.total)} onClick={(n) => pick(n, (i) => i.channel === 'news' && `Tier ${i.tier}` === n.split(' •')[0])} />
            <h4 className="mt-5 mb-2 text-[12.5px] font-semibold">Kategori isu</h4>
            <SentimentBars rows={agg.issues} max={6} onClick={(n) => pick(`Isu ${n}`, (i) => (i.a?.issue || 'Lainnya') === n)} />
          </Card>
        </div>
        <Card id="mentions" title={<>Unggahan, Komentar & Berita <span className="text-muted">({nf(agg.items.length)})</span></>}>
          <MentionList items={agg.items} presetFilter={filter ? { ...filter, clear: () => setFilter(null) } : null} />
        </Card>
      </div>
    ),

    /* ---------------- 3. Isu: apa yang dibicarakan ---------------- */
    isu: (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Kategori Isu">
            <SentimentBars rows={agg.issues} max={12} onClick={(n) => pick(`Isu ${n}`, (i) => (i.a?.issue || 'Lainnya') === n)} />
          </Card>
          <Card title="Sub-Isu Teratas">
            {agg.subIssues.length ? (
              <SentimentBars rows={agg.subIssues} max={12} onClick={(n) => pick(`Sub-isu ${n}`, (i) => i.a?.subIssue === n)} />
            ) : (
              <p className="text-[13px] text-muted">Sub-isu spesifik dibaca oleh AI. Isi SUMOPOD_API_KEY (atau GEMINI_API_KEY) untuk mengaktifkannya.</p>
            )}
          </Card>
        </div>
        <Card title="Kata Kunci Dominan">
          <WordCloud words={agg.words} onPick={(w) => pick(`Kata "${w}"`, (i) => i.title.toLowerCase().includes(w))} />
        </Card>
      </div>
    ),

    /* ---------------- 4. Tokoh: siapa yang disebut ---------------- */
    tokoh: (
      <div className="space-y-4">
        <Card title="Tokoh & Kreator yang Disebut" action={<Legend />}>
          <FigureStrip persons={agg.persons} onOpen={setPerson} />
        </Card>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card title="Daftar Tokoh" className="xl:col-span-2">
            <FiguresTable persons={agg.persons} onOpen={setPerson} />
          </Card>
          <Card title="Brand & Organisasi Disebut">
            <SentimentBars rows={agg.organizations} max={12} onClick={(n) => pick(`Organisasi ${n}`, (i) => !!i.a?.organizations.includes(n))} />
          </Card>
        </div>
      </div>
    ),

    /* ---------------- 5. Sumber & wilayah: di mana dibicarakan ---------------- */
    sumber: (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Distribusi Platform">
            <SentimentBars rows={agg.platforms} icon={platformIcon} onClick={(n) => pick(`Platform ${n}`, (i) => (i.channel === 'news' ? 'Media web' : SOURCE_META[i.source]?.label) === n)} />
          </Card>
          <Card title="Tier Media Web">
            <SentimentBars rows={agg.tiers.filter((t) => t.total)} onClick={(n) => pick(n, (i) => i.channel === 'news' && `Tier ${i.tier}` === n.split(' •')[0])} />
          </Card>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Media & Akun Teraktif">
            <SentimentBars rows={agg.outlets} max={12} onClick={(n) => pick(`Media ${n}`, (i) => i.outlet === n)} />
          </Card>
          <Card title="Lokasi Disebut">
            <SentimentBars rows={agg.locations} max={12} onClick={(n) => pick(`Lokasi ${n}`, (i) => !!i.a?.locations.includes(n))} />
          </Card>
        </div>
        <Card title="Status Sumber Data pada Pemantauan Terakhir">
          <div className="flex flex-wrap gap-2">
            {result.sources.map((s) => (
              <span key={s.source} title={s.error || s.note} className={`badge gap-1.5 ${s.ok ? 'badge-muted' : 'badge-negative'}`}>
                <SourceIcon source={s.source} size={13} />
                {SOURCE_META[s.source].label}: {s.ok ? `${result.items.filter((i) => i.source === s.source).length} item${s.blocked ? `, ${s.blocked} ditolak pagar` : ''}` : 'gagal'}
              </span>
            ))}
          </div>
          {errSources.length > 0 && (
            <ul className="mt-3 space-y-1 text-[12.5px] text-ink-2">
              {errSources.map((s) => (
                <li key={s.source}>
                  <b className="font-semibold">{SOURCE_META[s.source].label}</b>: {s.error}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    ),

    /* ---------------- 6. Laporan & AI ---------------- */
    laporan: (
      <div className="space-y-4">
        <Card title="Ringkasan Analisis & Rekomendasi">
          <InsightPanel
            photos={Object.fromEntries(agg.persons.filter((x) => x.photo).map((x) => [x.name.toLowerCase(), x.photo!.url]))}
            insight={result.insight}
            loading={insLoading}
            onRefresh={async () => {
              setInsLoading(true);
              try {
                await refreshInsight(topic);
              } finally {
                setInsLoading(false);
              }
            }}
          />
        </Card>
        <Card title="Tanya Data" className="no-print">
          <AskPanel topic={topic.name} context={topic.context} agg={agg} />
        </Card>
      </div>
    ),
  };

  return (
    <div className="space-y-4">
      {header}
      {running && prog && (
        <Card title="Progres pemantauan">
          <ProgressPanel p={prog} />
        </Card>
      )}

      <nav role="tablist" aria-label="Bagian analisis" className="no-print sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-line bg-canvas/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex min-w-max gap-6">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              title={t.hint}
              onClick={() => setTab(t.key)}
              className={`relative h-12 text-[13.5px] whitespace-nowrap transition-colors duration-300 ${tab === t.key ? 'font-bold text-ink' : 'text-muted hover:text-primary'}`}
            >
              {t.label}
              {t.count !== undefined && <span className={`ml-1.5 tabular-nums ${tab === t.key ? 'text-primary' : 'text-muted'}`}>{nf(t.count)}</span>}
              <span className={`absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary transition-transform duration-300 ${tab === t.key ? 'scale-x-100' : 'scale-x-0'}`} />
            </button>
          ))}
        </div>
      </nav>

      <div role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {sections[tab]}
      </div>

      {/* Saat dicetak: semua bagian ditampilkan berurutan */}
      <div className="hidden print:block">
        {TOPIC_TABS.filter((k) => k !== tab).map((k) => (
          <div key={k} className="mt-6">
            {sections[k]}
          </div>
        ))}
      </div>

      {person && <PersonModal person={person} items={agg.items} onClose={() => setPerson(null)} />}
      {allFig && (
        <Modal onClose={() => setAllFig(false)} title={`Semua Tokoh & Kreator, ${topic.name}`} width={900}>
          <FiguresTable
            persons={agg.persons}
            onOpen={(p) => {
              setAllFig(false);
              setPerson(p);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/* --------------------------------- komponen ringkasan --------------------------------- */

/** Urutan kanal utama DNVB Sosmed Tracker; kanal lain ikut tampil bila ada datanya. */
const CHANNEL_ROWS: { key: string; label: string; source?: SourceKey; test: (i: ViewItem) => boolean }[] = [
  { key: 'instagram', label: 'Instagram', source: 'instagram', test: (i) => i.source === 'instagram' },
  { key: 'tiktok', label: 'TikTok', source: 'tiktok', test: (i) => i.source === 'tiktok' },
  { key: 'threads', label: 'Threads', source: 'threads', test: (i) => i.source === 'threads' },
  { key: 'youtube', label: 'YouTube', source: 'youtube', test: (i) => i.source === 'youtube' },
  { key: 'web', label: 'Media web', test: (i) => i.channel === 'news' },
  { key: 'other', label: 'Sosmed lain', test: (i) => i.channel === 'social' && !['instagram', 'tiktok', 'threads', 'youtube'].includes(i.source) },
];

function ChannelSentiment({ items, onPick }: { items: ViewItem[]; onPick: (label: string, pred: (i: ViewItem) => boolean) => void }) {
  const rows = CHANNEL_ROWS.map((r) => {
    const list = items.filter(r.test);
    const p = list.filter((i) => i.sentiment === 'positive').length;
    const n = list.filter((i) => i.sentiment === 'negative').length;
    const u = list.length - p - n;
    const comments = list.filter((i) => i.kind === 'comment').length;
    return { ...r, total: list.length, p, n, u, comments, net: list.length ? Math.round(((p - n) / list.length) * 100) : 0 };
  }).filter((r) => r.key !== 'other' || r.total > 0);
  return (
    <ul className="divide-y divide-line">
      {rows.map((r) => (
        <li key={r.key}>
          <button className="grid w-full grid-cols-[150px_minmax(0,1fr)_64px] items-center gap-4 py-3 text-left disabled:opacity-60 sm:grid-cols-[180px_minmax(0,1fr)_72px]" disabled={!r.total} onClick={() => onPick(`Kanal ${r.label}`, r.test)}>
            <span className="flex min-w-0 items-center gap-2.5">
              {r.source ? <SourceIcon source={r.source} size={18} /> : <PlatformIcon name="Media web" size={18} />}
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-semibold">{r.label}</span>
                <span className="block text-[11.5px] text-muted tabular-nums">
                  {nf(r.total)} sebutan{r.comments ? ` · ${nf(r.comments)} komentar` : ''}
                </span>
              </span>
            </span>
            <StackBar p={r.p} u={r.u} n={r.n} height={10} labels={r.total > 0} />
            <span className={`text-right text-[15px] font-bold tabular-nums ${!r.total ? 'text-muted' : r.net >= 0 ? 'text-pos-text' : 'text-neg-text'}`} title="Net sentiment kanal">
              {r.total ? (r.net > 0 ? '+' : '') + r.net : '–'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function MiniFeed({ list, empty, onPick }: { list: ViewItem[]; empty: string; onPick: (it: ViewItem) => void }) {
  if (!list.length) return <p className="text-[13px] text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {list.map((it) => (
        <li key={it.id} className="py-2.5">
          <button className="w-full text-left" onClick={() => onPick(it)}>
            <div className="line-clamp-2 text-[13px] leading-snug font-medium hover:text-primary">{it.title}</div>
            <div className="meta mt-1 flex items-center gap-1.5">
              <SourceIcon source={it.source} size={13} />
              <span className="truncate">
                {it.author ? `@${it.author.replace(/^@/, '')} · ` : ''}
                {it.outlet} · {fmtDate(it.publishedAt)}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
