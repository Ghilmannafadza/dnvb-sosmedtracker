// Klasifikasi tier media. Tier 1 = media nasional arus utama, Tier 2 = media bisnis, marketing, startup,
// teknologi, dan gaya hidup (yang paling sering meliput brand DNVB & klien), Tier 3 = lainnya.

export const TIER1 = [
  'kompas.com', 'kompas.id', 'detik.com', 'cnnindonesia.com', 'cnbcindonesia.com', 'kontan.co.id', 'bisnis.com',
  'tempo.co', 'antaranews.com', 'liputan6.com', 'tribunnews.com', 'kumparan.com', 'idxchannel.com', 'katadata.co.id',
  'okezone.com', 'sindonews.com', 'republika.co.id', 'mediaindonesia.com', 'beritasatu.com', 'jpnn.com', 'suara.com',
  'merdeka.com', 'viva.co.id', 'inews.id', 'metrotvnews.com', 'tvonenews.com', 'kompas.tv', 'idntimes.com',
  'investor.id', 'thejakartapost.com', 'jakartaglobe.id', 'reuters.com', 'bloomberg.com', 'bloombergtechnoz.com',
  'jawapos.com', 'cnn.com', 'bbc.com', 'voaindonesia.com', 'tirto.id', 'narasi.tv', 'kompasiana.com',
];

export const TIER2 = [
  // bisnis, marketing, startup, teknologi
  'marketeers.com', 'swa.co.id', 'mix.co.id', 'dailysocial.id', 'techinasia.com', 'id.techinasia.com', 'kr-asia.com',
  'e27.co', 'wartaekonomi.co.id', 'majalahfranchise.com', 'ukmindonesia.id', 'entrepreneur.bisnis.com',
  'infobrand.id', 'brandingindonesia.com', 'marketing.co.id', 'tekno.kompas.com', 'inet.detik.com',
  'selular.id', 'teknojurnal.com', 'trenasia.com', 'emitennews.com', 'goodnewsfromindonesia.id',
  // gaya hidup, hiburan, kreator
  'popbela.com', 'fimela.com', 'hai.grid.id', 'kapanlagi.com', 'hipwee.com', 'vice.com', 'whiteboardjournal.com',
  'cxomedia.id', 'manual.co.id', 'greatmind.id', 'grid.id', 'era.id', 'insertlive.com', 'wolipop.detik.com', 'hot.detik.com',
  'hits.grid.id', 'pophariini.com', 'creativedisc.com', 'medium.com',
];

export function tierOf(domain: string): 1 | 2 | 3 {
  const d = domain.toLowerCase().replace(/^www\./, '');
  if (TIER2.some((t) => d === t || d.endsWith('.' + t))) return 2;
  if (TIER1.some((t) => d === t || d.endsWith('.' + t))) return 1;
  return 3;
}

/** Nama media → domain kira-kira (untuk Google News yang hanya memberi nama media + URL situs). */
export function outletName(domain: string, fallback?: string) {
  if (fallback) return fallback;
  return domain || 'Tidak diketahui';
}
