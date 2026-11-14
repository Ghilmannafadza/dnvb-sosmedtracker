import type { Sentiment } from '../../shared/types';

export const pct1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1).replace('.', ',') : '0') + '%';
export const pct0 = (v: number) => (Number.isFinite(v) ? Math.round(v) : 0) + '%';
export const nf = (n: number) => new Intl.NumberFormat('id-ID').format(Math.round(n || 0));
export const compact = (n: number) =>
  new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0);

export const fmtDate = (iso: string, withTime = false) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};
export const fmtDay = (ymd: string) => {
  const d = new Date(ymd + 'T00:00:00');
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
};
export const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  return `${Math.floor(s / 86400)} hari lalu`;
};

export const SENT_LABEL: Record<Sentiment, string> = { positive: 'Positif', neutral: 'Netral', negative: 'Negatif' };
export const SENT_COLOR: Record<Sentiment, string> = { positive: 'var(--pos)', neutral: 'var(--neu)', negative: 'var(--neg)' };

export const initials = (name: string) =>
  name
    .replace(/^(H|Hj|Dr|Ir)\.?\s+/i, '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

export const hueOf = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
};

export const ymdLocal = (d: Date) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
};

export const PRESET_RANGES = [
  { key: '7d', label: '7 hari', days: 7 },
  { key: '30d', label: '30 hari', days: 30 },
  { key: '90d', label: '3 bulan', days: 90 },
  { key: '180d', label: '6 bulan', days: 180 },
  { key: 'ytd', label: 'Tahun ini', days: 0 },
] as const;

export function rangeFromPreset(key: string) {
  const to = new Date();
  const p = PRESET_RANGES.find((r) => r.key === key);
  const from = key === 'ytd' || !p ? new Date(to.getFullYear(), 0, 1) : new Date(to.getTime() - (p.days - 1) * 86400000);
  return { from: ymdLocal(from), to: ymdLocal(to) };
}
