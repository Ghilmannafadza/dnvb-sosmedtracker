import { EntityLogo } from '../components/EntityLogo';
import { ArrowUpRight, Copy, Loader2, Plus, Printer, Settings2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { GroupBarChart, HairlineTimeline, SentimentBars, SentimentDonut } from '../components/charts';
import { FigureStrip, PersonModal } from '../components/panels';
import { ArrowButton, Avatar, Card, Empty, Kpi, Legend, Reveal, Segmented, StackBar } from '../components/ui';
import { aggregate, type Agg, type PersonAgg } from '../lib/aggregate';
import { fmtDate, nf, pct1 } from '../lib/format';
import { groupNarrative } from '../lib/narrative';
import { BRAND_KIND_LABEL, type Topic } from '../lib/presets';
import { getPref, setPref } from '../lib/store';
import { navigate, useApp } from '../state';

export default function GroupOverview() {
  const { topics, results, overrides, channel, range, progress, runMany } = useApp();
  const [showNeutral, setShowNeutral] = useState<'n' | 'y'>('n');
  const [person, setPerson] = useState<PersonAgg | null>(null);
  const [copied, setCopied] = useState(false);
  const [gtab, setGtabState] = useState<'ringkasan' | 'komparasi' | 'tokoh'>(() => getPref('groupTab', 'ringkasan'));
  const setGtab = (t: 'ringkasan' | 'komparasi' | 'tokoh') => {
    setGtabState(t);
    setPref('groupTab', t);
  };
  const GTABS = [
    { key: 'ringkasan' as const, label: 'Ringkasan', hint: 'Angka gabungan, grafik komparasi, narasi, kartu brand' },
    { key: 'komparasi' as const, label: 'Komparasi Brand', hint: 'Tabel perbandingan, share of voice, dan tren gabungan' },
    { key: 'tokoh' as const, label: 'Tokoh & Isu', hint: 'Tokoh, kreator, isu, dan akun lintas brand' },
  ];
  const group = topics.filter((t) => t.inGroup);
  const groupName = 'DNVB Indonesia';
  const anyRunning = group.some((t) => progress[t.id] && !['done', 'error'].includes(progress[t.id].phase));

  const stats = useMemo(
    () => group.map((t) => ({ topic: t, agg: results[t.id] ? aggregate(results[t.id].items, overrides, { channel, from: range.from, to: range.to, queries: t.queries }) : null })),
    [group, results, overrides, channel, range.from, range.to],
  );
  const ready = stats.filter((s): s is { topic: Topic; agg: Agg } => !!s.agg);

  const combined = useMemo(() => {
    const seen = new Set<string>();
    const items = ready.flatMap((s) => s.agg.items).filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
    return ready.length ? aggregate(items, overrides, { channel, from: range.from, to: range.to }) : null;
  }, [ready, results, overrides, channel, range.from, range.to]);

  const narrative = ready.length ? groupNarrative(ready.map((s) => ({ short: s.topic.short, name: s.topic.name, agg: s.agg })), groupName, channel) : [];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(narrative.map((l, i) => `(${i + 1}) ${l}`).join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-4">
      <Reveal className="relative overflow-hidden rounded-[20px] rounded-tl-[80px] bg-deep px-6 py-8 text-white sm:px-10 sm:py-10">
        <img src="/dnvb/shape-flower.png" alt="" aria-hidden className="pointer-events-none absolute top-6 right-[8%] hidden h-14 w-14 sm:block [animation:dnvb-float_5s_ease-in-out_infinite]" />
        <img src="/dnvb/shape-d.png" alt="" aria-hidden className="pointer-events-none absolute right-[22%] bottom-6 hidden h-12 w-12 md:block [animation:dnvb-float_6s_ease-in-out_infinite_1s]" />
        <span className="pointer-events-none absolute top-10 right-[30%] hidden h-2.5 w-2.5 rounded-full bg-yellow md:block" aria-hidden />
        <span className="pointer-events-none absolute right-[12%] bottom-10 hidden h-2 w-2 rounded-full bg-secondary sm:block" aria-hidden />
        <span className="eyebrow-dark">DNVB Sosmed Tracker</span>
        <h1 className="mt-4 max-w-2xl text-[30px] leading-[1.15] font-bold tracking-[-0.02em] sm:text-[42px]">Ringkasan sentimen brand</h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-deep-muted">
          Komparasi {group.length} brand · {fmtDate(range.from)} sampai {fmtDate(range.to)} · {channel === 'all' ? 'Instagram, TikTok, Threads, YouTube, dan media web' : channel === 'news' ? 'media web' : 'Instagram, TikTok, Threads, YouTube'}
        </p>
        <div className="no-print mt-6 flex flex-wrap items-center gap-2">
          <ArrowButton disabled={anyRunning || !group.length} onClick={() => runMany(group)}>
            {anyRunning ? (
              <>
                <Loader2 size={15} className="animate-spin" /> Memantau…
              </>
            ) : (
              `Pantau semua brand (${group.length})`
            )}
          </ArrowButton>
          <button className="btn border-white/20 bg-transparent text-white hover:border-white hover:text-white" onClick={() => navigate('/topics?new=1')}>
            <Plus size={15} /> Tambah brand
          </button>
          <button className="btn border-white/20 bg-transparent text-white hover:border-white hover:text-white" onClick={() => navigate('/topics')}>
            <Settings2 size={15} /> Atur brand
          </button>
          <button className="btn border-white/20 bg-transparent text-white hover:border-white hover:text-white" onClick={() => window.print()} disabled={!ready.length}>
            <Printer size={15} /> Laporan PDF
          </button>
        </div>
      </Reveal>

      {!group.length && (
        <Card>
          <Empty title="Belum ada brand di komparasi">Centang brand di halaman Brand & Kata Kunci agar muncul di sini.</Empty>
        </Card>
      )}

      {group.length > 0 && (
        <nav role="tablist" aria-label="Bagian ringkasan brand" className="no-print sticky top-0 z-20 -mx-4 overflow-x-auto border-b border-line bg-canvas/95 px-4 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex min-w-max gap-6">
            {GTABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={gtab === t.key}
                title={t.hint}
                onClick={() => setGtab(t.key)}
                className={`relative h-12 text-[13.5px] whitespace-nowrap transition-colors duration-300 ${gtab === t.key ? 'font-bold text-ink' : 'text-muted hover:text-primary'}`}
              >
                {t.label}
                <span className={`absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-primary transition-transform duration-300 ${gtab === t.key ? 'scale-x-100' : 'scale-x-0'}`} />
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* ===== Tab Ringkasan: angka gabungan, grafik + narasi, lalu kartu per entitas ===== */}
      <div className={gtab === 'ringkasan' ? 'space-y-4' : 'hidden print:block print:space-y-4'}>
      {ready.length > 0 && (
        <>
          {/* KPI gabungan */}
          {combined && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Total sebutan" value={nf(combined.total)} sub={`${nf(combined.social)} sosmed · ${nf(combined.news)} media web`} />
              <Kpi delay={60} label="Rasio positif" tone="pos" value={pct1(combined.polarity.positivePct)} sub={`${combined.sent.positive} sebutan positif`} />
              <Kpi delay={120} label="Rasio negatif" tone="neg" value={pct1(combined.polarity.negativePct)} sub={`${combined.sent.negative} sebutan negatif`} />
              <Kpi delay={180} label="Lonjakan negatif" tone={combined.spikes.length ? 'neg' : undefined} value={combined.spikes.length} sub="hari terdeteksi anomali" />
            </div>
          )}
          {/* Grafik + narasi (format slide laporan) */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <Card
              className="xl:col-span-2"
              title="Sentimen per Brand"
              action={
                <Segmented
                  label="Tampilkan netral"
                  value={showNeutral}
                  onChange={setShowNeutral}
                  options={[
                    { value: 'n', label: 'Positif vs Negatif' },
                    { value: 'y', label: 'Dengan netral' },
                  ]}
                />
              }
            >
              <GroupBarChart rows={ready.map((s) => ({ name: s.topic.short, ...s.agg.sent }))} showNeutral={showNeutral === 'y'} />
              <div className="mt-2">
                <Legend neutral={showNeutral === 'y'} />
              </div>
            </Card>
            <Card
              className="xl:col-span-3"
              title="Narasi Analisis Otomatis"
              action={
                <button className="btn btn-sm" onClick={copy} aria-live="polite">
                  <Copy size={13} /> {copied ? 'Tersalin' : 'Salin'}
                </button>
              }
            >
              <ol className="space-y-3 text-[14.5px] leading-relaxed text-ink">
                {narrative.map((l, i) => {
                  const idx = l.indexOf(': ');
                  const head = idx > 0 && idx < 10 ? l.slice(0, idx) : '';
                  return (
                    <li key={i}>
                      ({i + 1}){' '}
                      {head ? (
                        <>
                          <b className="font-semibold italic">{head}</b>: {l.slice(idx + 2)}
                        </>
                      ) : (
                        l
                      )}
                    </li>
                  );
                })}
              </ol>
              <p className="meta mt-4">Rasio dihitung dari sebutan berpolaritas (positif ditambah negatif); sebutan netral dikecualikan, mengikuti format laporan.</p>
            </Card>
          </div>
        </>
      )}
      {/* Kartu per entitas */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {stats.map(({ topic, agg }) => {
          const p = progress[topic.id];
          const running = p && !['done', 'error'].includes(p.phase);
          return (
            <Card
              key={topic.id}
              title={<span className="inline-flex items-center gap-2"><EntityLogo topic={topic} size={26} />{topic.name}<span className="badge badge-muted font-medium">{BRAND_KIND_LABEL[topic.kind || 'client']}</span></span>}
              action={
                <a href={'#/topic/' + topic.id} className="corner" aria-label={`Buka detail ${topic.name}`}>
                  <ArrowUpRight size={17} strokeWidth={1.6} />
                </a>
              }
            >
              {running ? (
                <div className="flex items-center gap-2 py-8 text-[13px] text-ink-2" aria-live="polite">
                  <Loader2 size={15} className="animate-spin" />
                  {p.phase === 'collect' ? 'Mengumpulkan sebutan' : p.phase === 'analyze' ? `Menganalisis ${p.analyzed} dari ${p.total}` : 'Menyusun ringkasan'}
                </div>
              ) : p?.phase === 'error' ? (
                <p className="py-6 text-[13px] text-neg-text">Gagal: {p.message}</p>
              ) : !agg ? (
                <Empty title="Belum dipantau">Klik Pantau semua brand atau buka detail brand.</Empty>
              ) : (
                <>
                  <div className="mb-4 flex gap-3 overflow-hidden">
                    {agg.persons.slice(0, 5).map((pp) => (
                      <button key={pp.name} className="w-[74px] shrink-0 text-center" onClick={() => setPerson(pp)}>
                        <div className="flex justify-center">
                          <Avatar name={pp.name} size={36} photo={pp.photo?.url} credit={pp.photo?.outlet} />
                        </div>
                        <div className="mt-1 line-clamp-2 h-[28px] text-[11px] leading-tight font-medium">{pp.name}</div>
                        <StackBar p={pp.positive} u={pp.neutral} n={pp.negative} height={4} />
                      </button>
                    ))}
                    {!agg.persons.length && <div className="text-[12px] text-muted">Belum ada tokoh terdeteksi.</div>}
                  </div>
                  <SentimentDonut p={agg.sent.positive} u={agg.sent.neutral} n={agg.sent.negative} size={150} />
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="tile py-2">
                      <div className="text-[15px] font-medium tabular-nums">{nf(agg.news)}</div>
                      <div className="meta">media web</div>
                    </div>
                    <div className="tile py-2">
                      <div className="text-[15px] font-medium tabular-nums">{nf(agg.social)}</div>
                      <div className="meta">sosmed</div>
                    </div>
                    <div className="tile py-2">
                      <div className={`text-[15px] font-medium tabular-nums ${agg.netSentiment >= 0 ? 'text-pos-text' : 'text-neg-text'}`}>{(agg.netSentiment > 0 ? '+' : '') + agg.netSentiment}</div>
                      <div className="meta">net sentiment</div>
                    </div>
                  </div>
                </>
              )}
            </Card>
          );
        })}
      </div>
      </div>

      {/* ===== Tab Komparasi ===== */}
      <div className={gtab === 'komparasi' ? 'space-y-4' : 'hidden print:block print:space-y-4'}>
      {!ready.length && gtab === 'komparasi' && (
        <Card>
          <Empty title="Belum ada hasil untuk dibandingkan">Jalankan Pantau semua terlebih dahulu.</Empty>
        </Card>
      )}
      {ready.length > 0 && (
        <>
          {/* Tabel komparasi */}
          <Card title="Tabel Komparasi Brand">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-[13px] tabular-nums">
                <thead className="text-[12px] text-muted">
                  <tr>
                    <th className="pb-3 pr-3 font-normal">Brand</th>
                    <th className="pb-3 pr-3 text-right font-normal">Total</th>
                    <th className="pb-3 pr-3 text-right font-normal">Media web</th>
                    <th className="pb-3 pr-3 text-right font-normal">Sosmed</th>
                    <th className="pb-3 pr-3 text-right font-normal">Positif</th>
                    <th className="pb-3 pr-3 text-right font-normal">Netral</th>
                    <th className="pb-3 pr-3 text-right font-normal">Negatif</th>
                    <th className="pb-3 pr-3 text-right font-normal">% Pos</th>
                    <th className="pb-3 pr-3 text-right font-normal">% Neg</th>
                    <th className="pb-3 pr-3 font-normal">Isu negatif utama</th>
                    <th className="pb-3 font-normal">Share of voice</th>
                  </tr>
                </thead>
                <tbody>
                  {ready.map(({ topic, agg }) => {
                    const negIss = [...agg.issues].sort((a, b) => b.negative - a.negative)[0];
                    const sum = ready.reduce((a, s) => a + s.agg.total, 0);
                    const sov = sum ? (agg.total / sum) * 100 : 0;
                    return (
                      <tr key={topic.id} className="border-t border-line hover:bg-tile/60">
                        <td className="py-3 pr-3">
                          <a href={'#/topic/' + topic.id} className="inline-flex items-center gap-2 align-middle font-semibold hover:text-primary">
                            <EntityLogo topic={topic} size={24} />
                            {topic.short}
                          </a>{' '}
                          <span className="text-muted">· {topic.name}</span>
                        </td>
                        <td className="py-3 pr-3 text-right font-semibold">{nf(agg.total)}</td>
                        <td className="py-3 pr-3 text-right">{nf(agg.news)}</td>
                        <td className="py-3 pr-3 text-right">{nf(agg.social)}</td>
                        <td className="py-3 pr-3 text-right">{agg.sent.positive}</td>
                        <td className="py-3 pr-3 text-right">{agg.sent.neutral}</td>
                        <td className="py-3 pr-3 text-right">{agg.sent.negative}</td>
                        <td className="py-3 pr-3 text-right text-pos-text">{pct1(agg.polarity.positivePct)}</td>
                        <td className="py-3 pr-3 text-right text-neg-text">{pct1(agg.polarity.negativePct)}</td>
                        <td className="py-3 pr-3 text-ink-2">{negIss?.negative ? `${negIss.name} (${negIss.negative})` : '-'}</td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 rounded-full bg-tile">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${sov}%` }} />
                            </div>
                            <span className="text-ink-2">{pct1(sov)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          {combined && (
              <Card title="Tren Sebutan Harian, Gabungan Semua Brand" action={<Legend />}>
                <HairlineTimeline data={combined.timeline} height={230} />
              </Card>
          )}
        </>
      )}
      </div>

      {/* ===== Tab Tokoh & Isu ===== */}
      <div className={gtab === 'tokoh' ? 'space-y-4' : 'hidden print:block print:space-y-4'}>
      {!combined && gtab === 'tokoh' && (
        <Card>
          <Empty title="Belum ada tokoh dan isu">Jalankan Pantau semua terlebih dahulu.</Empty>
        </Card>
      )}
      {combined && (
        <>
              <Card title="Tokoh & Kreator Lintas Brand" action={<Legend />}>
                <FigureStrip persons={combined.persons} onOpen={setPerson} />
              </Card>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card title="Kategori Isu Gabungan">
                  <SentimentBars rows={combined.issues} max={10} />
                </Card>
                <Card title="Media & Akun Teraktif">
                  <SentimentBars rows={combined.outlets} max={10} />
                </Card>
                <Card title="Brand & Organisasi Disebut">
                  <SentimentBars rows={combined.organizations} max={10} />
                </Card>
              </div>
        </>
      )}
      </div>

      {person && <PersonModal person={person} items={combined?.items || []} onClose={() => setPerson(null)} />}
    </div>
  );
}
