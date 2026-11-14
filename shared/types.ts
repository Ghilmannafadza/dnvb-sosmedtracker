// Tipe data yang dipakai bersama oleh API (serverless) dan frontend.

export type Sentiment = 'positive' | 'neutral' | 'negative';

export type SourceKey =
  | 'instagram'
  | 'tiktok'
  | 'threads'
  | 'youtube'
  | 'googlenews'
  | 'bingnews'
  | 'gdelt'
  | 'web'
  | 'rss'
  | 'firecrawl'
  | 'x'
  | 'facebook'
  | 'reddit'
  | 'linkedin';

export type Channel = 'news' | 'social';

/**
 * group: kelompok tampilan di pemilih sumber.
 *   social = kanal utama DNVB Sosmed Tracker (Instagram, TikTok, Threads, YouTube)
 *   news   = media web (portal berita, blog, RSS)
 *   other  = media sosial tambahan (opsional, mati secara default untuk brand baru)
 * needsKey: kunci yang membuka jalur utama (sumber tetap bisa aktif lewat jalur cadangan).
 */
export const SOURCE_META: Record<SourceKey, { label: string; channel: Channel; group: 'news' | 'social' | 'other'; needsKey?: string }> = {
  instagram: { label: 'Instagram', channel: 'social', group: 'social' },
  tiktok: { label: 'TikTok', channel: 'social', group: 'social' },
  threads: { label: 'Threads', channel: 'social', group: 'social' },
  youtube: { label: 'YouTube', channel: 'social', group: 'social' },
  googlenews: { label: 'Google News', channel: 'news', group: 'news' },
  bingnews: { label: 'Bing News', channel: 'news', group: 'news' },
  gdelt: { label: 'GDELT (media global)', channel: 'news', group: 'news' },
  web: { label: 'Web & blog (Firecrawl / Exa)', channel: 'news', group: 'news' },
  rss: { label: 'RSS media', channel: 'news', group: 'news' },
  firecrawl: { label: 'Firecrawl (crawl media)', channel: 'news', group: 'news', needsKey: 'FIRECRAWL_API_KEY' },
  x: { label: 'X / Twitter', channel: 'social', group: 'other' },
  facebook: { label: 'Facebook', channel: 'social', group: 'other' },
  reddit: { label: 'Reddit', channel: 'social', group: 'other' },
  linkedin: { label: 'LinkedIn', channel: 'social', group: 'other' },
};

/** Kanal utama yang aktif secara default untuk brand baru */
export const CORE_SOURCES: SourceKey[] = ['instagram', 'tiktok', 'threads', 'youtube', 'googlenews', 'bingnews', 'gdelt', 'web', 'rss', 'firecrawl'];

export const ALL_SOURCE_KEYS = Object.keys(SOURCE_META) as SourceKey[];

/** Jalur pengambilan data (gaya Agent Reach: daftar berurutan, jalur pertama yang tersedia dipakai) */
export interface BackendStatus {
  id: string;
  label: string;
  kind: 'api' | 'cli' | 'bridge' | 'exa' | 'firecrawl';
  available: boolean;
  reason?: string;
  setup?: string;
}

/** Definisi query yang dikirim ke /api/collect */
export interface TopicQuery {
  /** Salah satu dari kata kunci ini harus muncul (OR). Frasa otomatis diberi tanda kutip. */
  keywords: string[];
  /** Opsional: minimal satu kata konteks juga harus muncul (AND (..OR..)). */
  context?: string[];
  /** Kata yang dikecualikan (NOT). */
  exclude?: string[];
}

export interface Engagement {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
}

/** Satu sebutan (berita/post/video/komentar) mentah dari collector */
export interface RawItem {
  id: string;
  source: SourceKey;
  channel: Channel;
  /** platform tampilan, mis. "kompas.com" atau "TikTok" */
  outlet: string;
  domain?: string;
  url: string;
  title: string;
  snippet?: string;
  author?: string;
  publishedAt: string; // ISO
  image?: string;
  engagement?: Engagement;
  /** tier media 1 (nasional), 2 (regional/sektor), 3 (lainnya) */
  tier?: 1 | 2 | 3;
  kind?: 'article' | 'post' | 'video' | 'comment';
  /** Isi artikel hasil pembacaan halaman (diisi oleh /api/enrich) */
  body?: string;
  /** URL asli penerbit (hasil dekode tautan Google News) */
  originalUrl?: string;
  /** Status pembacaan isi: ok = isi terbaca, title = hanya judul */
  read?: 'ok' | 'title';
  /** Skor relevansi kata kunci 0..1 */
  relevance?: number;
  /** Kemiripan makna dengan profil entitas (embedding), 0..1 */
  semantic?: number;
  /** Foto berketerangan dari artikel (untuk foto tokoh) */
  images?: { url: string; caption: string }[];
}

export interface PersonMention {
  name: string;
  role?: string;
  org?: string;
  /** Sikap/konteks tokoh terhadap entitas yang dipantau */
  stance?: Sentiment;
  /** Kutipan pernyataan tokoh dalam sebutan ini (bila ada) */
  quote?: string;
}

export interface ItemAnalysis {
  id: string;
  relevant: boolean;
  sentiment: Sentiment;
  score: number; // -1..1
  reason?: string;
  issue: string; // kategori isu
  subIssue?: string;
  persons: PersonMention[];
  organizations: string[];
  locations: string[];
  engine: 'gemini' | 'lexicon';
}

export type AnalyzedItem = RawItem & { a?: ItemAnalysis };

export interface CollectResponse {
  source: SourceKey;
  items: RawItem[];
  ok: boolean;
  error?: string;
  note?: string;
  /** jalur yang berhasil dipakai, mis. "twitter-cli" atau "OpenCLI" */
  via?: string;
  /** jalur yang dicoba sebelum berhasil/gagal */
  tried?: string[];
  tookMs: number;
  /** jumlah item yang ditolak pagar pembatas */
  blocked?: number;
}

export interface AnalyzeRequest {
  topic: string;
  context?: string;
  /** Kata kunci entitas, membantu AI menilai relevansi */
  keywords?: string[];
  items: (Pick<RawItem, 'id' | 'title' | 'snippet' | 'outlet' | 'channel'> & { body?: string })[];
}

export interface EnrichRequest {
  queries: TopicQuery[];
  items: Pick<RawItem, 'id' | 'url' | 'source' | 'title' | 'snippet'>[];
}

export interface EnrichResult {
  id: string;
  originalUrl?: string;
  body?: string;
  description?: string;
  author?: string;
  image?: string;
  images?: { url: string; caption: string }[];
  publishedAt?: string;
  domain?: string;
  /** true bila kata kunci ditemukan di judul atau isi */
  relevant: boolean;
  relevance: number;
  read: 'ok' | 'title';
  /** Tautan artikel dari halaman tag/indeks yang memuat kata kunci (crawl lanjutan) */
  links?: { url: string; title: string }[];
  error?: string;
}

export interface AnalyzeResponse {
  results: ItemAnalysis[];
  engine: 'gemini' | 'lexicon';
  error?: string;
}

export interface InsightRequest {
  topic: string;
  context?: string;
  period: { from: string; to: string };
  stats: {
    total: number;
    news: number;
    social: number;
    positive: number;
    neutral: number;
    negative: number;
    topIssues: { issue: string; count: number; negative: number }[];
    topPersons: { name: string; role?: string; count: number; negative: number; positive: number }[];
    topOutlets: { outlet: string; count: number; negative: number }[];
    peakDays: { date: string; count: number; negative: number }[];
  };
  headlines: { title: string; outlet: string; date: string; sentiment: Sentiment; issue: string }[];
}

export interface Insight {
  executiveSummary: string;
  keyFindings: string[];
  mainIssues: { issue: string; description: string; sentiment: Sentiment }[];
  risks: { title: string; level: 'tinggi' | 'sedang' | 'rendah'; description: string }[];
  recommendations: string[];
  stakeholders: { name: string; position: string; note: string }[];
  engine: 'gemini' | 'template';
  generatedAt: string;
}

export interface HealthResponse {
  ai: { provider: 'gemini' | 'sumopod' | 'lexicon'; model?: string; embedModel?: string };
  sources: Record<SourceKey, { enabled: boolean; reason?: string; backends?: BackendStatus[]; active?: string }>;
  /** Agent Reach: CLI lokal terdeteksi dan jembatan */
  reach?: { local: boolean; bridge?: string; bins: Record<string, boolean>; exa: 'mcp' | 'api' | 'off'; firecrawl?: 'cloud' | 'self' | 'off' };
  /** Penyimpanan foto tokoh: blob = permanen di server (Vercel Blob), browser = IndexedDB per perangkat */
  photos?: { store: 'blob' | 'browser'; vision: boolean };
  version: string;
}

/** Kategori isu percakapan brand (konsumen, kreator, media) */
export const ISSUE_CATEGORIES = [
  'Produk & Kualitas',
  'Harga & Promo',
  'Layanan & Pengalaman Pelanggan',
  'Konten & Kampanye',
  'Kreator & Influencer',
  'Event & Komunitas',
  'Edukasi & Kelas',
  'Bisnis & Kemitraan',
  'Karier & Internal',
  'Reputasi & Krisis',
  'Lainnya',
] as const;
