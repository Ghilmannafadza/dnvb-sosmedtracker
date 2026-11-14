import { CORE_SOURCES, type SourceKey, type TopicQuery } from '../../shared/types';

/** Jenis brand yang dipantau */
export type BrandKind = 'own' | 'client' | 'competitor';

export const BRAND_KIND_LABEL: Record<BrandKind, string> = {
  own: 'Brand DNVB',
  client: 'Brand klien',
  competitor: 'Kompetitor & pembanding',
};

/** Satu brand yang dipantau (nama tipe "Topic" dipertahankan agar kompatibel dengan data tersimpan) */
export interface Topic {
  id: string;
  name: string;
  /** singkatan untuk grafik, mis. DNVB */
  short: string;
  color: string;
  /** konteks untuk AI: bisnis, produk, akun resmi, hal yang BUKAN brand ini */
  context: string;
  queries: TopicQuery[];
  sources: SourceKey[];
  /** ikut dalam komparasi di halaman Ringkasan Brand */
  inGroup: boolean;
  /** label portofolio, mis. "DNVB Indonesia" */
  group?: string;
  preset?: boolean;
  createdAt: string;
  /** URL atau path logo (opsional). Tanpa logo: monogram berwarna */
  logo?: string;
  kind?: BrandKind;
  /** akun resmi (tanpa @), dipakai sebagai kata kunci & penanda unggahan milik brand */
  handles?: string[];
}

export const ALL_SOURCES: SourceKey[] = CORE_SOURCES;

/** Versi preset: naikkan bila query preset berubah agar data brand tersimpan di browser ikut diperbarui. */
export const PRESET_VERSION = 1;

const now = '2026-11-14T00:00:00.000Z';

/** Kata konteks untuk singkatan "DNVB" yang juga dipakai sebagai istilah umum (digitally native vertical brand). */
const DNVB_CTX = ['Indonesia', 'business school', 'Forum Gosip', 'Exclusive Club', 'Media Copilot', 'Produk Video', 'kelas', 'membership', 'dnvbindonesia', 'Awan Prasetyo', 'pebisnis', 'founder'];

/**
 * DNVB Indonesia (dnvbindonesia.com), riset November 2026:
 * "A people-powered ed tech and media platform". Produk: DNVB Business School (kelas bisnis praktis
 * dari entrepreneur & profesional), Produk Video (kursus dua jam), Exclusive Club (membership),
 * Forum Gosip (konten/obrolan bisnis), Media Copilot, dan Karir. Akun resmi Instagram, TikTok,
 * YouTube, dan X: @dnvbindonesia.
 */
export const PRESET_TOPICS: Topic[] = [
  {
    id: 'dnvb',
    name: 'DNVB Indonesia',
    short: 'DNVB',
    color: '#F55D9E',
    kind: 'own',
    group: 'DNVB Indonesia',
    handles: ['dnvbindonesia'],
    preset: true,
    createdAt: now,
    inGroup: true,
    sources: CORE_SOURCES,
    context:
      'DNVB Indonesia (dnvbindonesia.com), platform edtech dan media bisnis "people-powered" di Indonesia. Produk: DNVB Business School (kelas bisnis praktis dari entrepreneur dan profesional), Produk Video (kursus bisnis dua jam), Exclusive Club (membership), Forum Gosip (konten obrolan bisnis), Media Copilot, dan Karir. Akun resmi @dnvbindonesia di Instagram, TikTok, Threads, YouTube. BUKAN artikel umum tentang konsep "digitally native vertical brand" di luar negeri.',
    queries: [
      { keywords: ['DNVB Indonesia', 'dnvbindonesia', '@dnvbindonesia', 'DNVB Business School', 'Forum Gosip DNVB', 'DNVB Exclusive Club'] },
      { keywords: ['DNVB'], context: DNVB_CTX, exclude: ['Warby Parker', 'Casper', 'Glossier', 'Dollar Shave Club'] },
    ],
  },
];

/** Templat brand baru: kanal utama aktif, sisanya opsional */
export function blankBrand(kind: BrandKind = 'client'): Topic {
  return {
    id: 'b' + Date.now().toString(36),
    name: '',
    short: '',
    color: ['#346BC8', '#1DD460', '#FF6D00', '#F4BF41', '#7B61FF', '#101820'][Math.floor(Math.random() * 6)],
    context: '',
    queries: [{ keywords: [] }],
    sources: CORE_SOURCES,
    inGroup: true,
    group: 'DNVB Indonesia',
    kind,
    handles: [],
    createdAt: new Date().toISOString(),
  };
}
