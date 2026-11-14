import { ArrowUpRight, X } from 'lucide-react';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import type { Sentiment } from '../../shared/types';
import { personKey } from '../../shared/photos';
import { SENT_LABEL, initials, pct0 } from '../lib/format';
import { useApp } from '../state';

/* --------------------------------- motion DNVB --------------------------------- */

/** Reveal saat elemen masuk layar (pola react-awesome-reveal di dnvbindonesia.com): slide-up 500ms "ease". */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('in');
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es)
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Reveal({ children, delay = 0, className = '', fade = false, as: Tag = 'div' }: { children: ReactNode; delay?: number; className?: string; fade?: boolean; as?: 'div' | 'section' | 'li' }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <Tag ref={ref as any} className={`reveal ${fade ? 'reveal-fade' : ''} ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

/** Panah putih resmi dnvbindonesia.com (public/dnvb/arrow-right.png), digambar ulang sebagai SVG agar tajam. */
export function Arrow({ className = 'arr' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tombol utama DNVB: pil pink, hover biru, panah kanan keluar dan panah kiri masuk (300ms ease-in-out). */
export function ArrowButton({ children, dark = false, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { dark?: boolean }) {
  return (
    <button type="button" {...rest} className={`btn-arrow ${dark ? 'dark' : ''} ${className}`}>
      <span>
        <Arrow />
        {children}
        <Arrow />
      </span>
    </button>
  );
}

export function SentBadge({ s, onClick, title }: { s: Sentiment; onClick?: () => void; title?: string }) {
  const cls = `badge badge-${s}`;
  return onClick ? (
    <button type="button" className={`${cls} hover:opacity-80`} onClick={onClick} title={title || 'Buka detail untuk mengoreksi sentimen'}>
      {SENT_LABEL[s]}
    </button>
  ) : (
    <span className={cls}>{SENT_LABEL[s]}</span>
  );
}

/**
 * Avatar tokoh. Bila tersedia, memakai foto dari artikel berita (keterangannya menyebut nama tokoh);
 * bila tidak ada atau gagal dimuat, kembali ke inisial (placeholder jujur, tanpa foto karangan).
 */
export function Avatar({ name, size = 44, onDeep = false, photo, credit }: { name: string; size?: number; onDeep?: boolean; photo?: string; credit?: string }) {
  const { photos } = useApp();
  // Foto tersimpan (sudah diverifikasi & diunduh) didahulukan; foto langsung dari artikel jadi cadangan
  const stored = photos?.[personKey(name)];
  const srcs = [stored?.src, photo].filter((x): x is string => Boolean(x));
  const [failed, setFailed] = useState(0);
  const [prev, setPrev] = useState(srcs.join('|'));
  if (prev !== srcs.join('|')) {
    setPrev(srcs.join('|'));
    setFailed(0);
  }
  const src = srcs[failed];
  const cr = stored?.src === src ? stored?.credit : credit;
  if (src)
    return (
      <img
        src={src}
        alt={`Foto ${name}`}
        title={cr ? `${name}. Foto: ${cr}` : name}
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed((f) => f + 1)}
        className={`shrink-0 rounded-full object-cover object-top ${onDeep ? 'ring-1 ring-deep-ink/20' : 'ring-1 ring-line'}`}
        style={{ width: size, height: size }}
      />
    );
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${onDeep ? 'bg-deep-ink/15 text-deep-ink' : 'bg-tile text-ink'}`}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.34) }}
      aria-hidden
    >
      {initials(name) || '?'}
    </div>
  );
}

/** Batang polaritas 3 segmen, dengan celah 2px antar segmen agar terbaca tanpa bergantung warna saja. */
export function StackBar({ p, n, u, height = 6, labels = false, onDeep = false }: { p: number; n: number; u: number; height?: number; labels?: boolean; onDeep?: boolean }) {
  const t = p + n + u || 1;
  return (
    <div>
      <div className="flex w-full gap-[2px]" style={{ height }}>
        {p > 0 && <div className="rounded-full bg-pos" style={{ flex: p }} />}
        {u > 0 && <div className="rounded-full bg-neu" style={{ flex: u }} />}
        {n > 0 && <div className="rounded-full bg-neg" style={{ flex: n }} />}
        {p + n + u === 0 && <div className={`flex-1 rounded-full ${onDeep ? 'bg-deep-ink/20' : 'bg-line'}`} />}
      </div>
      {labels && (
        <div className={`mt-1 flex justify-between text-[10.5px] tabular-nums ${onDeep ? 'text-deep-muted' : 'text-muted'}`}>
          <span>{pct0((p / t) * 100)} pos</span>
          <span>{pct0((n / t) * 100)} neg</span>
        </div>
      )}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-tile p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-300 ${value === o.value ? 'bg-primary font-semibold text-white' : 'text-ink-2 hover:text-primary'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Panel utama. `to` menambahkan tombol sudut ↗ yang benar-benar membuka halaman tujuan (motif referensi). */
export function Panel({
  title,
  sub,
  to,
  toLabel,
  action,
  children,
  className = '',
  tone = 'light',
  id,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  to?: string;
  toLabel?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'light' | 'deep';
  id?: string;
}) {
  const deep = tone === 'deep';
  return (
    <section id={id} className={`${deep ? "rounded-[20px] bg-deep text-deep-ink" : "panel"} flex min-w-0 flex-col p-5 sm:p-6 ${className}`}>
      {(title || to || action) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className={`panel-title ${deep ? 'text-deep-ink' : ''}`}>{title}</h2>}
            {sub && <div className={`mt-1 text-[12px] ${deep ? 'text-deep-muted' : 'text-muted'}`}>{sub}</div>}
          </div>
          <div className="no-print flex max-w-full flex-wrap items-center gap-2">
            {action}
            {to && (
              <a href={'#' + to} className={deep ? 'corner bg-deep-ink/10 text-deep-ink' : 'corner'} aria-label={toLabel || 'Buka detail'}>
                <ArrowUpRight size={17} strokeWidth={1.6} />
              </a>
            )}
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start px-1 py-6">
      <div className="text-[15px] font-medium text-ink">{title}</div>
      {children && <div className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Statistik kecil gaya referensi: nilai di atas, label di bawah. */
export function Stat({ value, label, tone, onDeep = false }: { value: ReactNode; label: ReactNode; tone?: 'pos' | 'neg'; onDeep?: boolean }) {
  const c = tone === 'pos' ? 'text-pos-text' : tone === 'neg' ? 'text-neg-text' : onDeep ? 'text-deep-ink' : 'text-ink';
  return (
    <div className="min-w-0">
      <div className={`text-[15px] font-medium tabular-nums ${c}`}>{value}</div>
      <div className={`mt-0.5 text-[12px] ${onDeep ? 'text-deep-muted' : 'text-muted'}`}>{label}</div>
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);
}

function useFocusOnOpen() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => prev?.focus?.();
  }, []);
  return ref;
}

export function Drawer({ onClose, title, children }: { onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEscape(onClose);
  const ref = useFocusOnOpen();
  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Detail'} className="relative flex h-full w-full max-w-[560px] flex-col bg-panel shadow-[0_0_40px_rgba(22,23,15,.18)] outline-none">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="text-[18px] font-bold tracking-tight">{title}</div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Tutup">
            <X size={16} />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-6 pb-8">{children}</div>
      </div>
    </div>
  );
}

export function Modal({ onClose, title, children, width = 760 }: { onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEscape(onClose);
  const ref = useFocusOnOpen();
  return (
    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'} className="relative flex max-h-[90vh] w-full flex-col rounded-[24px] bg-panel shadow-[0_10px_40px_rgba(22,23,15,.18)] outline-none" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between px-6 py-4">
          <div className="text-[20px] font-bold tracking-tight">{title}</div>
          <button className="btn btn-icon" onClick={onClose} aria-label="Tutup">
            <X size={16} />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto px-6 pb-6">{children}</div>
      </div>
    </div>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  const nums: (number | '…')[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  return (
    <nav className="flex items-center gap-1" aria-label="Halaman">
      <button className="btn btn-sm btn-icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">
        ‹
      </button>
      {nums.map((n, i) =>
        n === '…' ? (
          <span key={'e' + i} className="px-1 text-[12px] text-muted">
            …
          </span>
        ) : (
          <button key={n} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined} className={`h-8 min-w-8 rounded-full px-2 text-[12px] ${n === page ? 'bg-primary font-semibold text-white' : 'text-ink-2 hover:bg-tile'}`}>
            {n}
          </button>
        ),
      )}
      <button className="btn btn-sm btn-icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">
        ›
      </button>
    </nav>
  );
}

export function Legend({ onDeep = false, neutral = true }: { onDeep?: boolean; neutral?: boolean }) {
  return (
    <div className={`flex items-center gap-3 text-[11.5px] ${onDeep ? 'text-deep-muted' : 'text-muted'}`}>
      {(
        [
          ['Positif', 'bg-pos'],
          ['Netral', 'bg-neu'],
          ['Negatif', 'bg-neg'],
        ] as const
      )
        .filter(([l]) => neutral || l !== 'Netral')
        .map(([l, c]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${c}`} />
          {l}
        </span>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`h-8 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-300 ${value === t.value ? 'bg-primary text-white' : 'bg-tile text-ink-2 hover:text-primary'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Kartu dashboard standar, muncul dengan slide-up saat masuk layar. */
export function Card({ title, action, children, className = '', bodyClass = 'px-5 pb-5', id, delay = 0 }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string; id?: string; delay?: number }) {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} id={id} className={`reveal panel min-w-0 ${className}`} style={{ '--d': `${delay}ms` } as CSSProperties}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5 pb-4">
          <h3 className="min-w-[10rem] flex-1 text-[16px] font-bold tracking-[-0.01em] text-ink">{title}</h3>
          {action && <div className="no-print flex max-w-full flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={`${title || action ? '' : 'pt-5'} ${bodyClass}`}>{children}</div>
    </section>
  );
}

/** Kartu angka utama gaya bento dnvbindonesia.com: ubin abu, label kecil di atas, angka besar. */
export function Kpi({ label, value, sub, tone, delay = 0 }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'pos' | 'neg'; delay?: number }) {
  const c = tone === 'pos' ? 'text-pos-text' : tone === 'neg' ? 'text-neg-text' : 'text-ink';
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className="reveal tile min-w-0 p-5" style={{ '--d': `${delay}ms` } as CSSProperties}>
      <div className="text-[12.5px] font-medium text-muted">{label}</div>
      <div className={`mt-2 text-[32px] leading-none font-semibold tracking-[-0.03em] tabular-nums ${c}`}>{value}</div>
      {sub && <div className="mt-2 text-[12px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}
