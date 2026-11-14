// Analisis cadangan (tanpa AI) berbasis leksikon Bahasa Indonesia + bahasa warganet (slang, campur Inggris, emoji).
// Dipakai saat kunci AI belum diisi atau ketika panggilan AI gagal. Fokus: sentimen percakapan terhadap BRAND
// di Instagram, TikTok, Threads, YouTube, dan media web.
import type { ItemAnalysis, PersonMention, Sentiment } from '../../shared/types.js';

const POS = [
  'bagus', 'bagus banget', 'keren', 'keren banget', 'mantap', 'mantab', 'mantul', 'mantep', 'top', 'jos', 'juara', 'terbaik',
  'the best', 'best', 'kece', 'gokil', 'daebak', 'amazing', 'awesome', 'great', 'good', 'nice', 'love', 'loved',
  'suka', 'suka banget', 'cinta', 'favorit', 'favorite', 'fav', 'bangga', 'salut', 'respect', 'hebat', 'luar biasa', 'inspiratif',
  'menginspirasi', 'insightful', 'bermanfaat', 'manfaat', 'berguna', 'membantu', 'terbantu', 'helpful', 'daging',
  'nambah ilmu', 'menambah wawasan', 'mencerahkan', 'worth it', 'recommended', 'rekomen', 'rekomendasi', 'wajib coba',
  'wajib beli', 'puas', 'memuaskan', 'senang', 'seneng', 'happy', 'terima kasih', 'makasih', 'thank you', 'thanks', 'appreciate',
  'apresiasi', 'cakep', 'rapi', 'profesional', 'ramah', 'fast response', 'fast respon', 'responsif', 'terjangkau',
  'affordable', 'hemat', 'berkualitas', 'original', 'terpercaya', 'trusted', 'amanah', 'legit',
  'sukses', 'berhasil', 'laris', 'sold out', 'inovatif', 'inovasi', 'kreatif', 'seru', 'asik', 'asyik', 'fun', 'menarik',
  'kolaborasi', 'collab', 'penghargaan', 'award', 'meraih', 'pertumbuhan', 'meningkat',
  'meluncurkan', 'resmi hadir', 'giveaway', 'gemes', 'lucu', 'cantik', 'nyaman', 'enak', 'mudah', 'gampang', 'praktis',
  'lengkap', 'semangat', 'repeat order', 'beli lagi', 'loyal', 'nggak nyesel', 'gak nyesel', 'ga nyesel', 'tidak menyesal',
];

const NEG = [
  'kecewa', 'mengecewakan', 'nyesel', 'menyesal', 'zonk', 'jelek', 'buruk', 'parah', 'ampas', 'payah', 'busuk', 'sampah', 'norak',
  'cringe', 'garing', 'boring', 'membosankan', 'basi', 'lebay', 'overrated', 'overprice', 'overpriced', 'kemahalan', 'mahal banget',
  'rugi', 'merugikan', 'kerugian', 'penipuan', 'penipu', 'tipu', 'nipu', 'scam', 'hoax', 'hoaks', 'bohong', 'palsu', 'fake',
  'abal-abal', 'abal abal', 'cacat', 'rusak', 'error', 'bug', 'lemot', 'slow response', 'slow respon', 'lama banget', 'telat',
  'terlambat', 'tidak dibalas', 'gak dibalas', 'ga dibalas', 'dicuekin', 'diabaikan', 'ghosting', 'minta refund', 'belum dikirim',
  'komplain', 'keluhan', 'mengeluh', 'protes', 'boikot', 'boycott', 'unfollow', 'blacklist', 'kapok', 'jangan beli',
  'jangan percaya', 'waspada', 'marah', 'kesal', 'kesel', 'sebel', 'benci', 'muak', 'ilfeel', 'ilfil', 'toxic', 'kasar',
  'tidak sopan', 'gak sopan', 'rasis', 'pelecehan', 'diskriminasi', 'plagiat', 'jiplak', 'menjiplak', 'kontroversi', 'kontroversial',
  'skandal', 'dilaporkan', 'somasi', 'gugatan', 'tuntutan', 'ilegal', 'melanggar', 'pelanggaran', 'phk', 'layoff', 'bangkrut',
  'gagal', 'krisis', 'anjlok', 'merosot', 'dihujat', 'hujat', 'dikritik', 'geram', 'blunder', 'bermasalah', 'ribet',
  'membingungkan', 'gak jelas', 'ga jelas', 'nggak jelas', 'spam', 'clickbait', 'gimmick', 'pansos', 'red flag', 'worst', 'hate',
  'disappointed', 'terrible', 'awful', 'jahat', 'curang', 'manipulatif', 'eksploitasi', 'underpaid', 'gaji telat',
];

const NEGATORS = ['tidak', 'tak', 'bukan', 'belum', 'tanpa', 'nggak', 'gak', 'ga', 'enggak', 'ngga', 'kurang', 'not', 'no'];

const POS_EMOJI = /(?:😍|🥰|😘|❤️|💖|💕|💗|💯|🔥|👍|👏|🙌|🤩|😊|😁|😄|🥳|✨|🙏|💪)/gu;
const NEG_EMOJI = /(?:😡|🤬|😠|👎|💩|🤮|🤢|😤|😒|🙄|😞|😢|😭|💔|🤡)/gu;

const ISSUES: [string, RegExp][] = [
  ['Reputasi & Krisis', /krisis|skandal|kontroversi|boikot|boycott|hoaks|hoax|somasi|gugat|tuntut|dilaporkan|plagiat|jiplak|rasis|pelecehan|diskriminasi|dihujat|klarifikasi|permintaan maaf|minta maaf/i],
  ['Harga & Promo', /harga|mahal|murah|diskon|promo|voucher|cashback|gratis|flash sale|bundling|cicil|paylater|worth|overprice|terjangkau|rp\s?\d/i],
  ['Layanan & Pengalaman Pelanggan', /admin|customer service|pelayanan|layanan|respon|dibalas|refund|pengiriman|kurir|paket|komplain|keluhan|checkout|pembayaran|login|aplikasi|error/i],
  ['Produk & Kualitas', /produk|kualitas|bahan|ukuran|rasa|varian|fitur|kemasan|packaging|original|cacat|rusak|awet|launching|peluncuran|rilis|koleksi/i],
  ['Edukasi & Kelas', /kelas|course|kursus|webinar|workshop|bootcamp|belajar|materi|mentor|sertifikat|modul|ilmu|insight|edukasi|business school|pelatihan|membership/i],
  ['Kreator & Influencer', /influencer|kreator|creator|selebgram|tiktoker|youtuber|endorse|affiliate|review|ulasan|podcast|brand ambassador|ambassador/i],
  ['Event & Komunitas', /event|acara|festival|konser|meetup|gathering|komunitas|community|forum|talkshow|seminar|expo|pameran|tiket/i],
  ['Konten & Kampanye', /konten|content|video|reels|feed|postingan|caption|iklan|campaign|kampanye|viral|fyp|tren|challenge|hashtag|siaran/i],
  ['Bisnis & Kemitraan', /investasi|investor|pendanaan|funding|valuasi|omzet|revenue|penjualan|ekspansi|akuisisi|kemitraan|partnership|kolaborasi|kerja sama|umkm|startup|bisnis/i],
  ['Karier & Internal', /karier|karir|lowongan|loker|rekrutmen|magang|intern|karyawan|pegawai|gaji|phk|layoff|budaya kerja|hiring/i],
];

const TITLES =
  '(?:CEO|Co-Founder|Founder|Pendiri|Direktur Utama|Presiden Direktur|Direktur|Chief|COO|CMO|CTO|CFO|Head|Manager|Manajer|General Manager|Brand Manager|Marketing Manager|Ketua|Menteri|Kepala|Pengamat|Analis|Pakar|Praktisi|Influencer|Kreator|Content Creator|Selebgram|Host|Komisaris|Juru Bicara|Jubir)';

const TITLE_RE = new RegExp(`\\b${TITLES}\\b`, 'g');
const NOT_NAMES = new Set([
  'Indonesia', 'Jakarta', 'Bandung', 'Surabaya', 'Bali', 'Instagram', 'TikTok', 'Threads', 'YouTube', 'Shopee', 'Tokopedia', 'Gojek',
  'Grab', 'Google', 'Meta', 'Facebook', 'Twitter', 'DNVB', 'Digitally', 'Native', 'Vertical', 'Brand', 'Business', 'School', 'Forum',
  'Gosip', 'Produk', 'Video', 'Exclusive', 'Club', 'Media', 'Copilot', 'PT', 'Tbk', 'Republik', 'Kota', 'Provinsi', 'Kabupaten',
  'Kementerian', 'Dinas', 'Badan', 'Startup', 'Founder', 'Live', 'Reels', 'Story', 'Official',
]);

const ORG_RE = /\b(PT\.?\s+[A-Z][\w]*(?:\s+[A-Z][\w]*){0,4}|(?:DNVB(?: Indonesia)?|Kementerian|Dinas|Badan|OJK|BPOM|YLKI|KPPU|Kominfo|Komdigi|Shopee|Tokopedia|TikTok Shop|Lazada|Gojek|Grab|Bukalapak|Blibli|Meta|Google|Instagram|YouTube)(?:\s+[A-Z][\w]*){0,3})/g;

const LOC_RE = /\b(Jakarta(?: Selatan| Barat| Timur| Utara| Pusat)?|Bandung|Surabaya|Yogyakarta|Jogja|Semarang|Medan|Makassar|Bali|Denpasar|Bogor|Depok|Tangerang(?: Selatan)?|Bekasi|Malang|Solo|Palembang|Balikpapan|Batam|Pekanbaru|Indonesia|Singapura|Malaysia)\b/g;

const uniq = <T>(a: T[]) => [...new Set(a)];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function countHits(text: string, words: string[]) {
  let score = 0;
  const hits: string[] = [];
  for (const w of uniq(words)) {
    // batas kata Unicode: "top" tidak cocok di "laptop", "suka" tidak cocok di "sukarela"
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(w)}(?![\\p{L}\\p{N}])`, 'gu');
    for (const m of text.matchAll(re)) {
      const idx = m.index || 0;
      const before = text.slice(Math.max(0, idx - 16), idx);
      const negated = NEGATORS.some((n) => new RegExp(`(?<![\\p{L}])${n}\\s+$`, 'u').test(before));
      score += negated ? -1 : 1;
      hits.push(negated ? `tidak ${w}` : w);
    }
  }
  return { score, hits };
}

export function lexiconSentiment(text: string): { sentiment: Sentiment; score: number; reason: string } {
  const t = ' ' + text.toLowerCase() + ' ';
  const p = countHits(t, POS);
  const n = countHits(t, NEG);
  const pe = (text.match(POS_EMOJI) || []).length;
  const ne = (text.match(NEG_EMOJI) || []).length;
  // keluhan sedikit lebih berat (kehati-hatian reputasi); "tidak bagus" = negatif, "nggak kecewa" = positif
  const raw = p.score + Math.min(pe, 3) * 0.6 - (n.score + Math.min(ne, 3) * 0.6) * 1.2;
  const score = Math.max(-1, Math.min(1, raw / 3));
  const sentiment: Sentiment = score >= 0.2 ? 'positive' : score <= -0.2 ? 'negative' : 'neutral';
  const posHits = [...p.hits.filter((h) => !h.startsWith('tidak ')), ...n.hits.filter((h) => h.startsWith('tidak '))];
  const negHits = [...n.hits.filter((h) => !h.startsWith('tidak ')), ...p.hits.filter((h) => h.startsWith('tidak '))];
  const reason =
    sentiment === 'neutral'
      ? 'Tidak ada indikator sentimen yang dominan'
      : `Indikator: ${uniq(sentiment === 'positive' ? posHits : negHits).slice(0, 4).join(', ') || 'emoji'}`;
  return { sentiment, score: Number(score.toFixed(2)), reason };
}

export function lexiconIssue(text: string) {
  for (const [name, re] of ISSUES) if (re.test(text)) return name;
  return 'Lainnya';
}

const ORG_MARK = /^(PT\.?|CV|Tbk|Dinas|Badan|Komisi|Kementerian|Kabupaten|Provinsi|Kota|Official|Store|Shop)$/;
const isCap = (w: string) => /^[A-Z][\p{L}'’.]*$/u.test(w);
const isAcr = (w: string) => /^[A-Z]{2,}$/.test(w);

const SPEECH = '(?:kata|ujar|ungkap|ucap|tutur|jelas|terang|tegas|sebut|papar|imbuh|tambah|lanjut|kata dia|ujarnya|katanya)';
const NAME = "((?:H\\.\\s*|Hj\\.\\s*)?[A-Z][a-z'’]+(?:\\s+(?:[A-Z][a-z'’]+|[A-Z]\\.)){1,3})";
const ROLEWORD = /^(CEO|Co-Founder|Founder|Pendiri|Direktur|Presiden|Chief|COO|CMO|CTO|CFO|Head|Manager|Manajer|General|Brand|Marketing|Ketua|Menteri|Kepala|Pengamat|Analis|Pakar|Praktisi|Influencer|Kreator|Content|Selebgram|Host|Komisaris|Juru|Jubir|Humas|Corporate|Owner|Pemilik)/;
// "…," ujar Budi Santoso, Kepala Desa Baronang.
const SPEECH_RE = new RegExp(`\\b${SPEECH}\\s+${NAME}(?:\\s*,\\s*([^.,;"”]{3,80}))?`, 'g');
// Budi Santoso, Kepala Desa Baronang, mengatakan …
const APPOS_RE = new RegExp(`${NAME}\\s*,\\s*((?:CEO|Co-Founder|Founder|Pendiri|Direktur|Presiden|Chief|Head|Manager|Manajer|General|Brand|Marketing|Ketua|Kepala|Pengamat|Analis|Pakar|Praktisi|Influencer|Kreator|Content|Host|Komisaris|Owner|Pemilik|Humas)[^.,;"”]{2,80}),\\s*(?:mengatakan|menyampaikan|menjelaskan|menegaskan|mengungkapkan|menuturkan|menyebutkan|mengaku|meminta|menilai|berharap|menambahkan)`, 'g');

function cleanName(n: string) {
  return n.replace(/^(H|Hj)\.\s*/, '').replace(/\s+/g, ' ').trim();
}
function validName(n: string) {
  const parts = n.split(' ');
  return parts.length >= 1 && parts[0].length >= 3 && !parts.some((p) => NOT_NAMES.has(p) || isAcr(p) || ORG_MARK.test(p) || ROLEWORD.test(p));
}
function quoteBefore(text: string, idx: number) {
  const win = text.slice(Math.max(0, idx - 400), idx);
  const m = win.match(/[“"]([^“"”]{15,300})[”"]\s*,?\s*$/);
  return m ? m[1].trim().split(/\s+/).slice(0, 25).join(' ') : undefined;
}

export function lexiconPersons(text: string, sentiment: Sentiment): PersonMention[] {
  const out: PersonMention[] = [];
  // 1) pola jabatan + nama: "Bupati Kapuas Muhammad Wiyatno", "Kepala Desa Baronang, Budi Santoso"
  for (const m of text.matchAll(TITLE_RE)) {
    const role = m[0];
    const tokens = text.slice((m.index || 0) + role.length).trim().split(/\s+/);
    const readRun = (from: number) => {
      const run: string[] = [];
      let i = from;
      let comma = false;
      for (; i < Math.min(tokens.length, from + 9); i++) {
        const raw = tokens[i];
        const w = raw.replace(/[,;:.”"]+$/, '');
        if (!isCap(w)) break;
        run.push(w);
        if (raw !== w) {
          comma = /,$/.test(raw);
          i++;
          break;
        }
      }
      return { run, next: i, comma };
    };
    let { run, next, comma } = readRun(0);
    if (!run.length) continue;
    const orgish = run.some((w) => ORG_MARK.test(w) || NOT_NAMES.has(w) || isAcr(w));
    const placeTitle = /^(CEO|Co-Founder|Founder|Pendiri|Direktur Utama|Presiden Direktur|Direktur|Chief|Head|Manager|Manajer|General Manager|Brand Manager|Marketing Manager|Ketua|Kepala|Komisaris)$/.test(role);
    let words: string[];
    let fullRole = role;
    if (comma && (orgish || run.length <= 2) && placeTitle) {
      // jabatan + wilayah/lembaga, lalu nama setelah koma
      const second = readRun(next).run.filter((w) => !NOT_NAMES.has(w));
      if (second.length >= 1 && validName(cleanName(second.slice(0, 4).join(' ')))) {
        fullRole = `${role} ${run.join(' ')}`;
        words = second.slice(0, 4);
      } else continue;
    } else if (orgish) {
      fullRole = `${role} ${run.slice(0, -2).join(' ')}`.trim();
      words = run.slice(-2);
    } else if (placeTitle && run.length >= 3) {
      fullRole = `${role} ${run[0]}`;
      words = run.slice(1, 4);
    } else words = run.slice(0, 3);
    const name = cleanName(words.filter((w) => w !== 'H.' && w !== 'Hj.').join(' '));
    if (!validName(name)) continue;
    out.push({ name, role: fullRole, stance: sentiment });
  }
  // 2) pola pernyataan: "…," ujar Nama, Jabatan
  for (const m of text.matchAll(SPEECH_RE)) {
    const name = cleanName(m[1]);
    if (!validName(name)) continue;
    const role = m[2] && ROLEWORD.test(m[2].trim()) ? m[2].trim() : undefined;
    out.push({ name, role, stance: sentiment, quote: quoteBefore(text, m.index || 0) });
  }
  // 3) pola aposisi: Nama, Jabatan, mengatakan
  for (const m of text.matchAll(APPOS_RE)) {
    const name = cleanName(m[1]);
    if (!validName(name)) continue;
    out.push({ name, role: m[2].trim(), stance: sentiment });
  }
  // gabungkan: nama sama → ambil jabatan terpanjang & kutipan pertama
  const map = new Map<string, PersonMention>();
  for (const p of out) {
    const k = p.name.toLowerCase();
    const prev = map.get(k);
    if (!prev) map.set(k, p);
    else map.set(k, { ...prev, role: (p.role?.length || 0) > (prev.role?.length || 0) ? p.role : prev.role, quote: prev.quote || p.quote });
  }
  return [...map.values()].slice(0, 10);
}

const VERB_RE = /^(?:(?:Me|Ber|Di|Ter|Per)[a-z]{3,}|Tingkatkan|Salurkan|Resmikan|Serahkan|Lakukan|Berikan|Laporkan|Siapkan|Luncurkan|Bagikan|Sampaikan|Tegaskan|Pastikan|Kucurkan|Bukukan|Umumkan|Selesaikan|Apresiasi|Gelar|Raih|Bantu|Dukung|Bangun|Buka|Tanam|Catat|Ajak|Beri|Kembali|Hadir|Terima|Jadi|Sukses|Gandeng|Hingga|Untuk|Dan|Di|Ke|Dari|Atas|Soal|Lewat)$/;
function trimOrg(o: string) {
  const w = o.trim().split(/\s+/);
  const out: string[] = [];
  for (const x of w) {
    if (out.length && VERB_RE.test(x)) break;
    out.push(x);
  }
  return out.join(' ');
}

export function lexiconAnalyze(id: string, title: string, text = ''): ItemAnalysis {
  // Sentimen & isu dari judul + paragraf pembuka (isi lengkap terlalu bising untuk leksikon);
  // tokoh, organisasi, dan lokasi dari seluruh teks.
  const lead = text.replace(/\s+/g, ' ').slice(0, 320);
  const head = `${title}. ${title}. ${lead}`;
  const full = `${title}. ${text}`;
  const { sentiment, score, reason } = lexiconSentiment(head);
  return {
    id,
    relevant: true,
    sentiment,
    score,
    reason,
    issue: lexiconIssue(`${title} ${lead}`),
    persons: lexiconPersons(full, sentiment),
    organizations: uniq([...full.matchAll(ORG_RE)].map((m) => trimOrg(m[1]))).filter((o) => o.split(' ').length > 1 || /^(DNVB|OJK|BPOM|YLKI|KPPU|Kominfo|Komdigi|Shopee|Tokopedia|Lazada|Gojek|Grab|Meta|Google|Instagram|YouTube)$/.test(o)).slice(0, 8),
    locations: uniq([...full.matchAll(LOC_RE)].map((m) => m[1].trim())).slice(0, 8),
    engine: 'lexicon',
  };
}
