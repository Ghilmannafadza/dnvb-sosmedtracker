import { Globe2, Newspaper, Rss, Search, Flame } from 'lucide-react';
import { siFacebook, siGooglenews, siInstagram, siReddit, siRss, siThreads, siTiktok, siX, siYoutube, type SimpleIcon } from 'simple-icons';
import { SOURCE_META, type SourceKey } from '../../shared/types';
import nounIcons from '../assets/noun-icons.json';

/**
 * Logo sumber data. Logo merek resmi dari paket simple-icons (CC0). Untuk sumber tanpa logo di
 * simple-icons (Bing News, GDELT) dipakai ikon dari The Noun Project bila sudah diunduh lewat
 * `npm run icons` (lihat scripts/fetch-noun-icons.mjs), jika belum: ikon generik.
 */
const BRAND: Partial<Record<SourceKey, SimpleIcon>> = {
  googlenews: siGooglenews,
  youtube: siYoutube,
  reddit: siReddit,
  x: siX,
  tiktok: siTiktok,
  instagram: siInstagram,
  facebook: siFacebook,
  threads: siThreads,
  rss: siRss,
};

/** LinkedIn tidak tersedia di simple-icons (permintaan pemilik merek): monogram sederhana */
function LinkedInMark({ size, label, className }: { size: number; label: string; className: string }) {
  return (
    <svg role="img" aria-label={label} viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`}>
      <title>{label}</title>
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <text x="12" y="17" textAnchor="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="12" fill="#fff">in</text>
    </svg>
  );
}

type NounIcon = { png: string; attribution: string; id: string };
const NOUN = nounIcons as Partial<Record<SourceKey, NounIcon>>;

export function SourceIcon({ source, size = 16, className = '' }: { source: SourceKey; size?: number; className?: string }) {
  const label = SOURCE_META[source]?.label || source;
  if (source === 'linkedin') return <LinkedInMark size={size} label={label} className={className} />;
  const b = BRAND[source];
  if (b) {
    // Logo hitam (X, TikTok) memakai warna teks agar tetap terlihat di tema gelap
    const fill = b.hex === '000000' ? 'currentColor' : `#${b.hex}`;
    return (
      <svg role="img" aria-label={label} viewBox="0 0 24 24" width={size} height={size} className={`shrink-0 ${className}`} fill={fill}>
        <title>{label}</title>
        <path d={b.path} />
      </svg>
    );
  }
  const n = NOUN[source];
  if (n?.png) return <img src={n.png} alt={label} title={`${label}. Ikon: ${n.attribution}`} width={size} height={size} className={`shrink-0 dark:invert ${className}`} />;
  const Icon = source === 'gdelt' ? Globe2 : source === 'web' ? Search : source === 'rss' ? Rss : source === 'firecrawl' ? Flame : Newspaper;
  return <Icon size={size} className={`shrink-0 text-ink-2 ${className}`} aria-label={label} />;
}

/** Ikon untuk nama platform hasil agregasi ("Media Online", "YouTube", ...). */
export function PlatformIcon({ name, size = 16 }: { name: string; size?: number }) {
  if (name === 'Media web') return <Newspaper size={size} className="shrink-0 text-ink-2" aria-hidden />;
  const key = (Object.keys(SOURCE_META) as SourceKey[]).find((k) => SOURCE_META[k].label === name || name.startsWith(SOURCE_META[k].label));
  return key ? <SourceIcon source={key} size={size} /> : null;
}

export const nounAttributions = () => Object.entries(NOUN).filter(([, v]) => v?.attribution).map(([k, v]) => ({ source: k as SourceKey, text: v!.attribution }));
