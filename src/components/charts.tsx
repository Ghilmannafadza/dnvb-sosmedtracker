import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Bucket } from '../lib/aggregate';
import { fmtDate, nf } from '../lib/format';

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(Math.floor(e[0].contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const MONTH = new Intl.DateTimeFormat('id-ID', { month: 'short' });

/**
 * Tren harian sebagai garis rambut (hairline) bertumpuk per sentimen. Motif identitas yang diambil
 * dari tekstur grafik pada referensi. Menjawab: "Kapan isu ini paling ramai, dan seberapa negatif?"
 * Hover/fokus + panah kiri/kanan menampilkan rincian hari; Enter memfilter daftar ke hari itu.
 */
export function HairlineTimeline({ data, height = 240, onPickDay, onDeep = false }: { data: Bucket[]; height?: number; onPickDay?: (d: string) => void; onDeep?: boolean }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const padB = 26;
  const padT = 34;
  const h = height - padB - padT;
  const max = Math.max(1, ...data.map((d) => d.total));
  const colW = data.length ? width / data.length : 0;
  const barW = Math.max(1.5, Math.min(5, colW * 0.4));
  const peaks = useMemo(
    () =>
      data
        .map((d, i) => ({ d, i }))
        .filter((x) => x.d.total > 0)
        .sort((a, b) => b.d.total - a.d.total)
        .slice(0, 2),
    [data],
  );
  const ticks = useMemo(() => {
    const out: { i: number; label: string }[] = [];
    let last = '';
    data.forEach((d, i) => {
      const m = d.name.slice(0, 7);
      if (m !== last) {
        out.push({ i, label: MONTH.format(new Date(d.name + 'T00:00:00')) });
        last = m;
      }
    });
    return out.length > 8 ? out.filter((_, k) => k % 2 === 0) : out;
  }, [data]);

  const onKey = (e: KeyboardEvent) => {
    if (!data.length) return;
    if (e.key === 'ArrowRight') setActive((a) => Math.min(data.length - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? data.length) - 1));
    else if (e.key === 'Enter' && active !== null) onPickDay?.(data[active].name);
    else return;
    e.preventDefault();
  };

  const ink = onDeep ? 'var(--deep-ink)' : 'var(--ink)';
  const mutedCls = onDeep ? 'text-deep-muted' : 'text-muted';
  const cur = active !== null ? data[active] : null;

  if (!data.length) return <div className={`py-10 text-[13px] ${mutedCls}`}>Belum ada sebutan pada periode ini.</div>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className={`min-h-[18px] text-[12px] tabular-nums ${mutedCls}`} aria-live="polite">
          {cur ? (
            <>
              <b className={onDeep ? 'text-deep-ink' : 'text-ink'}>{fmtDate(cur.name)}</b> · {cur.total} sebutan · {cur.positive} positif · {cur.neutral} netral · {cur.negative} negatif
            </>
          ) : (
            'Arahkan kursor atau gunakan panah kiri/kanan untuk melihat rincian harian'
          )}
        </div>
        <button className={`btn btn-sm no-print ${onDeep ? 'border-deep-ink/20 bg-transparent text-deep-ink' : ''}`} onClick={() => setTable(!table)} aria-pressed={table}>
          {table ? 'Grafik' : 'Tabel'}
        </button>
      </div>
      {table ? (
        <div className="scroll-thin max-h-[300px] overflow-auto">
          <table className="w-full text-left text-[12.5px] tabular-nums">
            <thead className={mutedCls}>
              <tr>
                <th className="py-1.5 font-normal">Tanggal</th>
                <th className="py-1.5 text-right font-normal">Total</th>
                <th className="py-1.5 text-right font-normal">Positif</th>
                <th className="py-1.5 text-right font-normal">Netral</th>
                <th className="py-1.5 text-right font-normal">Negatif</th>
              </tr>
            </thead>
            <tbody>
              {data
                .filter((d) => d.total)
                .map((d) => (
                  <tr key={d.name} className="border-t border-line">
                    <td className="py-1.5">{fmtDate(d.name)}</td>
                    <td className="py-1.5 text-right">{d.total}</td>
                    <td className="py-1.5 text-right">{d.positive}</td>
                    <td className="py-1.5 text-right">{d.neutral}</td>
                    <td className="py-1.5 text-right">{d.negative}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={ref}
          tabIndex={0}
          role="img"
          aria-label={`Grafik sebutan harian, ${data.length} hari. Puncak ${peaks[0] ? fmtDate(peaks[0].d.name) + ' dengan ' + peaks[0].d.total + ' sebutan' : '-'}.`}
          onKeyDown={onKey}
          onMouseLeave={() => setActive(null)}
          className="relative w-full rounded-[12px]"
          style={{ height }}
        >
          {width > 0 && (
            <svg width={width} height={height} className="block">
              <line x1={0} x2={width} y1={padT + h + 0.5} y2={padT + h + 0.5} stroke={onDeep ? 'rgba(241,240,230,.25)' : 'var(--line-strong)'} />
              {data.map((d, i) => {
                const x = i * colW + colW / 2 - barW / 2;
                let y = padT + h;
                const seg = (v: number, fill: string, key: string) => {
                  if (!v) return null;
                  const sh = (v / max) * h;
                  y -= sh;
                  return <rect key={key} x={x} y={y + 1} width={barW} height={Math.max(0, sh - 1)} rx={barW / 2} fill={fill} />;
                };
                const faded = active !== null && active !== i ? 0.45 : 1;
                return (
                  <g key={d.name} opacity={faded}>
                    {seg(d.positive, 'var(--pos)', 'p')}
                    {seg(d.neutral, 'var(--neu)', 'u')}
                    {seg(d.negative, 'var(--neg)', 'n')}
                    {d.total === 0 && <rect x={x} y={padT + h - 2} width={barW} height={2} rx={1} fill={onDeep ? 'rgba(241,240,230,.18)' : 'var(--line)'} />}
                  </g>
                );
              })}
              {peaks.map(({ d, i }, k) => {
                const cx = i * colW + colW / 2;
                const cy = padT + h - (d.total / max) * h;
                const right = cx < width - 150;
                const lx = right ? cx + 18 : cx - 18;
                const ly = Math.max(12, cy - 10 - k * 4);
                return (
                  <g key={'pk' + i} aria-hidden>
                    <line x1={cx} y1={cy - 4} x2={lx} y2={ly} stroke={ink} strokeOpacity={0.35} />
                    <circle cx={cx} cy={cy - 4} r={4} fill="var(--panel)" stroke={ink} strokeWidth={1.5} />
                    <text x={lx + (right ? 4 : -4)} y={ly + 4} textAnchor={right ? 'start' : 'end'} fontSize={12} fill={ink}>
                      {fmtDate(d.name)} · {d.total}
                    </text>
                  </g>
                );
              })}
              {ticks.map((t) => (
                <text key={t.i} x={t.i * colW + 2} y={height - 6} fontSize={11} fill={onDeep ? 'var(--deep-muted)' : 'var(--muted)'}>
                  {t.label}
                </text>
              ))}
              {data.map((d, i) => (
                <rect key={'hit' + i} x={i * colW} y={0} width={colW} height={padT + h} fill="transparent" onMouseEnter={() => setActive(i)} onClick={() => onPickDay?.(d.name)} style={{ cursor: onPickDay ? 'pointer' : 'default' }} />
              ))}
              {active !== null && <line x1={active * colW + colW / 2} x2={active * colW + colW / 2} y1={padT - 8} y2={padT + h} stroke={ink} strokeOpacity={0.25} strokeDasharray="2 3" />}
            </svg>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Gauge setengah lingkaran untuk net sentiment (-100 s.d. +100), mengikuti pola gauge referensi.
 * Busur terisi = gradien pink → biru DNVB; sisa = arsir tipis.
 */
export function NetGauge({ value, size = 300, onDeep = false }: { value: number; size?: number; onDeep?: boolean }) {
  const v = Math.max(-100, Math.min(100, value));
  const r = size / 2 - 14;
  const cx = size / 2;
  const cy = size / 2 + 4;
  const frac = (v + 100) / 200;
  const pt = (f: number) => {
    const a = Math.PI * (1 - f);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const [x0, y0] = pt(0);
  const [x1, y1] = pt(frac);
  const [x2, y2] = pt(1);
  const hatch = Array.from({ length: 64 }, (_, i) => i / 63).filter((f) => f > frac + 0.012);
  return (
    <div className="mx-auto w-full" style={{ maxWidth: size }}>
      <div className="relative">
      <svg viewBox={`0 0 ${size} ${size / 2 + 18}`} className="block w-full" role="img" aria-label={`Net sentiment ${v > 0 ? '+' : ''}${v} pada skala minus 100 sampai plus 100`}>
        <defs>
          <linearGradient id="gauge-grad" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="var(--primary)" />
            <stop offset="1" stopColor="var(--secondary)" />
          </linearGradient>
        </defs>
        <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" stroke={onDeep ? 'rgba(255,255,255,.18)' : 'var(--line)'} strokeWidth={1} />
        {hatch.map((f) => {
          const a = Math.PI * (1 - f);
          return <line key={f} x1={cx + (r - 7) * Math.cos(a)} y1={cy - (r - 7) * Math.sin(a)} x2={cx + (r + 7) * Math.cos(a)} y2={cy - (r + 7) * Math.sin(a)} stroke={onDeep ? 'rgba(255,255,255,.22)' : 'var(--line-strong)'} strokeWidth={1} />;
        })}
        {frac > 0.005 && <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} fill="none" stroke="url(#gauge-grad)" strokeWidth={12} strokeLinecap="round" />}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        <div className={`text-[56px] leading-none font-bold tracking-[-0.03em] tabular-nums ${onDeep ? 'text-white' : 'text-ink'}`}>
          {v > 0 ? '+' : ''}
          {v}
        </div>
        <div className={`mt-1 text-[12px] ${onDeep ? 'text-deep-muted' : 'text-muted'}`}>net sentiment</div>
      </div>
      </div>
      <div className={`mt-3 flex justify-between text-[11px] ${onDeep ? 'text-deep-muted' : 'text-muted'}`}>
        <span>-100 semua negatif</span>
        <span>+100 semua positif</span>
      </div>
    </div>
  );
}

const tipStyle = {
  contentStyle: { borderRadius: 12, border: '1px solid var(--line)', background: 'var(--panel)', color: 'var(--ink)', fontSize: 12, padding: '6px 10px' },
  labelStyle: { fontWeight: 600, marginBottom: 2 },
};

/** Komparasi sentimen antarbrand. */
export function GroupBarChart({ rows, showNeutral, height = 300 }: { rows: { name: string; positive: number; neutral: number; negative: number }[]; showNeutral: boolean; height?: number }) {
  const label = { fontSize: 13, fill: 'var(--ink)' };
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 26, right: 4, left: -18, bottom: 0 }} barGap={6} barCategoryGap="28%">
          <CartesianGrid vertical={false} strokeDasharray="2 4" />
          <XAxis dataKey="name" tick={{ fontSize: 13, fontWeight: 600, fill: 'var(--ink)' }} tickLine={false} axisLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip {...tipStyle} cursor={{ fill: 'var(--tile)' }} />
          <Bar dataKey="positive" name="Positif" fill="var(--pos)" radius={[8, 8, 8, 8]} maxBarSize={44} isAnimationActive={false}>
            <LabelList dataKey="positive" position="top" style={label} />
          </Bar>
          {showNeutral && (
            <Bar dataKey="neutral" name="Netral" fill="var(--neu)" radius={[8, 8, 8, 8]} maxBarSize={44} isAnimationActive={false}>
              <LabelList dataKey="neutral" position="top" style={label} />
            </Bar>
          )}
          <Bar dataKey="negative" name="Negatif" fill="var(--neg)" radius={[8, 8, 8, 8]} maxBarSize={44} isAnimationActive={false}>
            <LabelList dataKey="negative" position="top" style={label} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Daftar peringkat dengan batang polaritas. Baris bisa diklik untuk memfilter daftar sebutan. */
export function RankList({ rows, max = 10, onPick, onDeep = false, start = 0, icon, empty = 'Belum ada data pada periode ini.' }: { rows: Bucket[]; max?: number; onPick?: (name: string) => void; onDeep?: boolean; start?: number; icon?: (name: string) => ReactNode; empty?: string }) {
  const list = rows.slice(0, max);
  const top = Math.max(1, ...list.map((r) => r.total));
  if (!list.length) return <div className={`py-4 text-[13px] ${onDeep ? 'text-deep-muted' : 'text-muted'}`}>{empty}</div>;
  return (
    <ol className="space-y-3" start={start + 1}>
      {list.map((r, i) => {
        const inner = (
          <>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`w-4 shrink-0 text-[11px] tabular-nums ${onDeep ? 'text-deep-muted' : 'text-muted'}`}>{start + i + 1}</span>
                {icon?.(r.name)}
                <span className="truncate">{r.name}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {nf(r.total)}
                {r.negative > 0 && <span className={`ml-2 text-[12px] ${onDeep ? 'text-deep-muted' : 'text-neg-text'}`}>{nf(r.negative)} neg</span>}
              </span>
            </div>
            <div className="ml-6 flex h-[6px] gap-[2px]" style={{ width: `calc(${Math.max(5, (r.total / top) * 100)}% - 24px)` }}>
              {r.positive > 0 && <div className="rounded-full bg-pos" style={{ flex: r.positive }} />}
              {r.neutral > 0 && <div className="rounded-full bg-neu" style={{ flex: r.neutral }} />}
              {r.negative > 0 && <div className="rounded-full bg-neg" style={{ flex: r.negative }} />}
            </div>
          </>
        );
        return (
          <li key={r.name}>
            {onPick ? (
              <button type="button" className="block w-full rounded-[10px] text-left" onClick={() => onPick(r.name)} title={`Tampilkan sebutan: ${r.name}`}>
                {inner}
              </button>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function WordCloud({ words, onPick }: { words: [string, number][]; onPick?: (w: string) => void }) {
  if (!words.length) return <div className="py-4 text-[13px] text-muted">Belum ada data pada periode ini.</div>;
  const max = words[0][1];
  const min = words[words.length - 1][1];
  const list = [...words].sort((a, b) => (a[0] > b[0] ? 1 : -1));
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {list.map(([w, c]) => {
        const t = max === min ? 0.5 : (c - min) / (max - min);
        return (
          <button key={w} type="button" onClick={() => onPick?.(w)} title={`${w}: ${c} judul`} className="rounded-md leading-tight text-ink hover:underline" style={{ fontSize: 12 + t * 18, fontWeight: t > 0.6 ? 500 : 300, opacity: 0.6 + t * 0.4 }}>
            {w}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Komponen tata letak SaaS semula (gaya baru)                          */
/* ------------------------------------------------------------------ */

/** Donut komposisi sentimen + legenda angka. */
export function SentimentDonut({ p, u, n, size = 180 }: { p: number; u: number; n: number; size?: number }) {
  const total = p + u + n;
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const segs = [
    { v: p, col: 'var(--pos)', label: 'Positif' },
    { v: u, col: 'var(--neu)', label: 'Netral' },
    { v: n, col: 'var(--neg)', label: 'Negatif' },
  ];
  let off = 0;
  const gap = total ? Math.min(6, c * 0.01) : 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Positif ${p}, netral ${u}, negatif ${n}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tile)" strokeWidth={16} />
          {total > 0 &&
            segs.map((s) => {
              const len = (s.v / total) * c;
              const el = s.v ? (
                <circle
                  key={s.label}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={s.col}
                  strokeWidth={16}
                  strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                  strokeDashoffset={-off}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                />
              ) : null;
              off += len;
              return el;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[34px] leading-none font-bold tracking-[-0.02em] tabular-nums">{nf(total)}</div>
          <div className="mt-1 text-[12px] text-muted">total sebutan</div>
        </div>
      </div>
      <ul className="space-y-2.5 text-[13px]">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.col }} />
            <span className="w-14 text-ink-2">{s.label}</span>
            <span className="font-semibold tabular-nums">{nf(s.v)}</span>
            <span className="text-muted tabular-nums">{total ? Math.round((s.v / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sparkline garis rambut kecil (motif yang sama dengan tren harian). */
export function MiniSpark({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex h-10 items-end gap-[2px]" aria-hidden>
      {data.map((v, i) => (
        <div key={i} className="flex-1 rounded-full" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0, background: color, maxWidth: 3 }} />
      ))}
    </div>
  );
}

/** Daftar batang sentimen bertumpuk (nama lama dipertahankan agar tata letak semula tetap sama). */
export function SentimentBars({ rows, max = 10, onClick, icon }: { rows: Bucket[]; max?: number; onClick?: (name: string) => void; icon?: (name: string) => ReactNode }) {
  return <RankList rows={rows} max={max} onPick={onClick} icon={icon} />;
}
