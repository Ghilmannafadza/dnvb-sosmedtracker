// Katalog media untuk RSS. Dua jenis isi:
// 1. KNOWN_FEEDS: URL feed yang sudah dipakai proyek agregator berita Indonesia lain
//    (feedid / api-berita-indonesia, berita-indo-api) atau dibuat dari pola jaringan media
//    (Antara × rubrik × 36 situs, Tribun × 50 zona, Sindonews, Okezone, Tempo, CNN, CNBC, ...).
// 2. SITES: domain media yang feed-nya DITEMUKAN otomatis (beranda, /rss, /feed, tautan
//    <link rel="alternate">, halaman direktori RSS). Media baru cukup ditambahkan domainnya.
// Feed yang mati atau bukan RSS dilewati saat dibaca; tidak ada yang merusak hasil.

/* ------------------------------- jaringan Antara ------------------------------- */
export const ANTARA_TYPES = [
  'terkini', 'top-news', 'politik', 'hukum', 'ekonomi', 'ekonomi-finansial', 'ekonomi-bursa', 'ekonomi-bisnis', 'metro', 'humaniora',
  'dunia', 'warta-bumi', 'rilis-pers', 'tekno', 'otomotif', 'olahraga', 'lifestyle', 'hiburan', 'sepakbola', 'infografik',
];
export const ANTARA_REGIONS = [
  'aceh', 'sumut', 'sumbar', 'riau', 'kepri', 'jambi', 'sumsel', 'babel', 'bengkulu', 'lampung', 'banten', 'megapolitan', 'jabar', 'jateng', 'jogja',
  'jatim', 'bali', 'mataram', 'kupang', 'kalbar', 'kalteng', 'kalsel', 'kaltim', 'kaltara', 'manado', 'gorontalo', 'sulteng', 'sulbar', 'makassar',
  'sultra', 'ambon', 'malut', 'papua', 'papuabarat', 'en',
];

/* ------------------------------- jaringan Tribun ------------------------------- */
export const TRIBUN_ZONES = [
  'jakarta', 'wartakota', 'jabar', 'bogor', 'bekasi', 'depok', 'tangerang', 'banten', 'cirebon', 'pantura', 'jateng', 'banyumas', 'solo', 'jogja',
  'jatim', 'surabaya', 'suryamalang', 'madura', 'mataraman', 'bali', 'lombok', 'mataram', 'kupang', 'flores', 'medan', 'aceh', 'prohaba', 'padang',
  'pekanbaru', 'batam', 'jambi', 'palembang', 'sumsel', 'bangka', 'belitung', 'babel', 'lampung', 'pontianak', 'kalteng', 'banjarmasin', 'kaltim',
  'kaltara', 'makassar', 'sulbar', 'palu', 'sultra', 'manado', 'ternate', 'ambon', 'papua', 'papuabarat',
];
export const TRIBUN_TYPES = ['bisnis', 'nasional', 'regional', 'sport', 'techno', 'otomotif', 'lifestyle', 'travel', 'kesehatan', 'seleb', 'superskor', 'parapuan'];

/* ---------------------------------- feed pasti ---------------------------------- */
export const KNOWN_FEEDS: string[] = [
  // Antara nasional (semua rubrik) + rubrik utama di semua situs daerah
  ...ANTARA_TYPES.map((t) => `https://www.antaranews.com/rss/${t}.xml`),
  ...ANTARA_REGIONS.flatMap((r) => ['terkini', 'top-news', 'ekonomi', 'hukum', 'politik', 'daerah'].map((t) => `https://${r}.antaranews.com/rss/${t}.xml`)),
  // Tribun: nasional per rubrik + semua zona daerah
  'https://www.tribunnews.com/rss',
  ...TRIBUN_TYPES.map((t) => `https://www.tribunnews.com/rss/${t}`),
  ...TRIBUN_ZONES.map((z) => `https://${z}.tribunnews.com/rss`),
  ...['kalteng', 'banjarmasin', 'kaltim', 'kaltara', 'pontianak'].flatMap((z) => ['bisnis', 'regional', 'nasional'].map((t) => `https://${z}.tribunnews.com/rss/${t}`)),
  // CNN Indonesia
  'https://www.cnnindonesia.com/rss',
  ...['nasional', 'internasional', 'ekonomi', 'olahraga', 'teknologi', 'hiburan', 'gaya-hidup'].map((t) => `https://www.cnnindonesia.com/${t}/rss`),
  // CNBC Indonesia
  'https://www.cnbcindonesia.com/rss',
  ...['news', 'market', 'investment', 'entrepreneur', 'syariah', 'tech', 'lifestyle', 'opini', 'profil', 'research'].map((t) => `https://www.cnbcindonesia.com/${t}/rss`),
  // Republika
  'https://www.republika.co.id/rss',
  ...['news', 'nusantara', 'daerah', 'ekonomi', 'internasional', 'khazanah', 'islam-digest', 'dunia-islam', 'leisure', 'sepakbola'].map((t) => `https://www.republika.co.id/rss/${t}`),
  // Tempo
  'https://rss.tempo.co/',
  ...['nasional', 'bisnis', 'metro', 'dunia', 'nusantara', 'tekno', 'otomotif', 'bola', 'sport', 'gaya', 'seleb', 'cantik', 'travel', 'difabel', 'inforial', 'creativelab', 'event'].map((t) => `https://rss.tempo.co/${t}`),
  // Okezone (sindikasi semua kanal)
  ...Array.from({ length: 20 }, (_, i) => `https://sindikasi.okezone.com/index.php/rss/${i}/RSS2.0`),
  // Sindonews per subdomain
  'https://www.sindonews.com/rss',
  ...['nasional', 'daerah', 'ekbis', 'metro', 'international', 'edukasi', 'sains', 'tekno', 'otomotif', 'sports', 'lifestyle', 'kalam'].map((s) => `https://${s}.sindonews.com/rss`),
  // Suara
  'https://www.suara.com/rss',
  ...['news', 'bisnis', 'lifestyle', 'entertainment', 'otomotif', 'tekno', 'health', 'bola', 'pressrelease', 'wawancara', 'mostpopular'].map((t) => `https://www.suara.com/rss/${t}`),
  // Merdeka
  'https://www.merdeka.com/feed/',
  ...['peristiwa', 'politik', 'uang', 'dunia', 'jakarta', 'jabar', 'jateng', 'jatim', 'sumut', 'teknologi', 'gaya', 'sehat', 'otomotif', 'olahraga'].map((t) => `https://www.merdeka.com/feed/${t}`),
  // Lainnya yang polanya diketahui
  'https://www.jpnn.com/index.php?mib=rss',
  'https://lapi.kumparan.com/v2.0/rss/',
  'https://lapi.kumparan.com/v3.0/rss/',
  'https://feed.liputan6.com/rss',
  ...['news', 'bisnis', 'regional', 'global', 'tekno', 'health', 'otomotif', 'bola'].map((t) => `https://feed.liputan6.com/rss/${t}`),
  'https://rss.detik.com/index.php/detikcom',
  ...['detikcom_nasional', 'finance', 'inet', 'hot', 'sport', 'oto', 'travel', 'food', 'health', 'edu', 'news'].map((t) => `https://rss.detik.com/index.php/${t}`),
  'https://feeds.bbci.co.uk/indonesia/rss.xml',
  'https://rss.dw.com/xml/rss-ind-all',
  'https://theconversation.com/id/articles.atom',
  'https://www.vice.com/id/rss?locale=id_id',
  // Bisnis, marketing, startup, teknologi, gaya hidup & kreator (WordPress /feed)
  'https://www.marketeers.com/feed/',
  'https://swa.co.id/feed',
  'https://mix.co.id/feed/',
  'https://dailysocial.id/feed',
  'https://id.techinasia.com/feed',
  'https://www.techinasia.com/feed',
  'https://e27.co/feed/',
  'https://kr-asia.com/feed',
  'https://www.hipwee.com/feed/',
  'https://www.popbela.com/feed',
  'https://www.whiteboardjournal.com/feed/',
  'https://manual.co.id/feed/',
  'https://www.greatmind.id/feed',
  'https://www.cxomedia.id/feed',
  'https://www.goodnewsfromindonesia.id/feed',
  'https://infobrand.id/feed',
  'https://www.selular.id/feed/',
  'https://teknojurnal.com/feed/',
  'https://www.trenasia.com/feed',
  'https://pophariini.com/feed/',
  'https://creativedisc.com/feed/',
];

/* ------------------------- domain untuk penemuan otomatis ------------------------- */
export const SITES: string[] = [
  // Nasional
  'antaranews.com', 'kompas.com', 'kompas.id', 'kompas.tv', 'detik.com', 'tempo.co', 'en.tempo.co', 'cnnindonesia.com', 'cnbcindonesia.com',
  'liputan6.com', 'kumparan.com', 'tirto.id', 'idntimes.com', 'merdeka.com', 'okezone.com', 'sindonews.com', 'viva.co.id', 'suara.com',
  'republika.co.id', 'jpnn.com', 'tribunnews.com', 'inews.id', 'beritasatu.com', 'mediaindonesia.com', 'rmol.id', 'gatra.com', 'medcom.id',
  'metrotvnews.com', 'tvonenews.com', 'kompasiana.com', 'rri.co.id', 'tvrinews.com', 'voaindonesia.com', 'jawapos.com', 'jakartaglobe.id',
  'thejakartapost.com', 'en.antaranews.com', 'koran-jakarta.com', 'rm.id', 'jurnas.com', 'harianterbit.com', 'law-justice.co', 'hukumonline.com',
  'asumsi.co', 'narasi.tv', 'akurat.co', 'fajar.co.id', 'pikiran-rakyat.com', 'ayobandung.com', 'solopos.com', 'harianjogja.com', 'surya.co.id',
  'kabar24.bisnis.com', 'wartaekonomi.co.id', 'idn.media', 'katadata.co.id', 'kontan.co.id', 'bisnis.com', 'investor.id', 'idxchannel.com',
  'emitennews.com', 'neraca.co.id', 'bisnisindonesia.id', 'trenasia.com', 'bloombergtechnoz.com', 'cnbc.com', 'investing.com', 'ipotnews.com',
  'infobanknews.com', 'marketeers.com', 'swa.co.id', 'industry.co.id', 'kabarbisnis.com', 'ekbis.sindonews.com', 'money.kompas.com',
  'finance.detik.com', 'economy.okezone.com', 'ekonomi.bisnis.com', 'market.bisnis.com', 'industri.kontan.co.id', 'investasi.kontan.co.id',
  'nasional.kontan.co.id', 'regional.kompas.com', 'nasional.kompas.com', 'nasional.sindonews.com', 'daerah.sindonews.com', 'news.detik.com',
  // Bisnis, marketing, startup, teknologi
  'marketeers.com', 'swa.co.id', 'mix.co.id', 'dailysocial.id', 'techinasia.com', 'id.techinasia.com', 'kr-asia.com', 'e27.co',
  'infobrand.id', 'brandingindonesia.com', 'marketing.co.id', 'majalahfranchise.com', 'ukmindonesia.id', 'selular.id', 'teknojurnal.com',
  'tekno.kompas.com', 'inet.detik.com', 'tekno.tempo.co', 'tekno.sindonews.com', 'tekno.okezone.com', 'teknologi.bisnis.com', 'startupbisnis.com',
  // Gaya hidup, hiburan, kreator, anak muda
  'hipwee.com', 'popbela.com', 'fimela.com', 'kapanlagi.com', 'hai.grid.id', 'hits.grid.id', 'grid.id', 'era.id', 'insertlive.com',
  'wolipop.detik.com', 'hot.detik.com', 'whiteboardjournal.com', 'manual.co.id', 'greatmind.id', 'cxomedia.id', 'pophariini.com',
  'creativedisc.com', 'goodnewsfromindonesia.id', 'idntimes.com', 'popmama.com', 'yoursay.suara.com', 'lifestyle.kompas.com', 'lifestyle.okezone.com',
  // Pulau lain (regional besar)
  'harianhaluan.com', 'padangekspres.co.id', 'riaupos.jawapos.com', 'batampos.co.id', 'sumeks.co', 'lampost.co', 'radarlampung.disway.id',
  'radarbogor.jawapos.com', 'radarsurabaya.jawapos.com', 'jatimnet.com', 'balipost.com', 'nusabali.com', 'lombokpost.jawapos.com',
  'tribun-timur.com', 'fajar.co.id', 'manadopost.jawapos.com', 'gorontalopost.jawapos.com', 'kendaripos.fajar.co.id', 'cenderawasihpos.jawapos.com',
  'malukupost.com', 'disway.id', 'harian.disway.id', 'times.co.id', 'timesindonesia.co.id', 'ngopibareng.id', 'beritajatim.com', 'jatimtimes.com',
  ...['aceh', 'sumut', 'sumbar', 'riau', 'kepri', 'jambi', 'sumsel', 'babel', 'bengkulu', 'lampung', 'banten', 'jabar', 'jateng', 'jogja', 'jatim', 'bali',
    'ntb', 'ntt', 'sulut', 'gorontalo', 'sulteng', 'sulsel', 'sultra', 'maluku', 'papua'].map((p) => `${p}.inews.id`),
  // Internasional (liputan Indonesia & Asia Tenggara)
  'thediplomat.com', 'asiatimes.com', 'straitstimes.com', 'businesstimes.com.sg', 'channelnewsasia.com', 'scmp.com', 'theedgemalaysia.com',
  'nikkei.com', 'aljazeera.com', 'theguardian.com', 'bbc.com', 'dw.com', 'abc.net.au', 'jakartaglobe.id', 'indonesiabusinesspost.com',
  'thejakartapost.com', 'en.tempo.co', 'globalindonesianvoices.com', 'eastasiaforum.org', 'lowyinstitute.org', 'fulcrum.sg',
];
