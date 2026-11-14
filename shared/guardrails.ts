// Pagar pembatas pencarian: menolak konten yang jelas bukan percakapan tentang brand,
// misalnya iklan properti, lowongan kerja, spam judi online, dan nomor kontak. Dipakai di server (collect,
// enrich) dan di klien (tampilan aturan).

/** Domain iklan baris, properti, marketplace, lowongan kerja, dan agregator spam. */
export const BLOCKED_DOMAINS = [
  'olx.co.id', 'rumah123.com', 'rumah.com', 'lamudi.co.id', '99.co', 'pinhome.id', 'dotproperty.id', 'mitula.co.id',
  'rumahdijual.com', 'jualo.com', 'travelio.com', 'mamikos.com', 'infokost.id', 'urbanindo.com', 'propertidata.com',
  'tokopedia.com', 'shopee.co.id', 'bukalapak.com', 'blibli.com', 'lazada.co.id', 'jobstreet.co.id', 'id.jobstreet.com',
  'glints.com', 'kalibrr.com', 'karir.com', 'loker.id', 'lokerbumn.com', 'jobs.talentics.id', 'cakapinterview.com',
  'indeed.com', 'linkedin.com/jobs', 'scribd.com', 'pdfcoffee.com', 'pinterest.com', 'slideshare.net',
];

/** Pola judul/cuplikan yang menandai iklan, lowongan, atau spam (bukan pemberitaan). */
export const SPAM_PATTERNS: { label: string; re: RegExp; examples: string }[] = [
  { label: 'iklan sewa/kontrakan', re: /\b(disewakan|dikontrakan|dikontrakkan|kontrakan|sewa (rumah|ruko|kantor|gudang)|kos[- ]?kosan|kost (putra|putri|pasutri|campur)|kos (putra|putri))\b/i , examples: 'disewakan, dikontrakan, kontrakan, sewa rumah/ruko, kos-kosan' },
  { label: 'iklan jual properti', re: /\b(rumah dijual|dijual (rumah|cepat|murah|tanah|ruko|kavling)|jual (rumah|tanah|ruko)|siap huni|lokasi strategis|harga nego|nego tipis|shm\b|sertifikat hak milik|cocok (buat|untuk) (rumah|kantor|usaha|tinggal))\b/i , examples: 'rumah dijual, dijual cepat, siap huni, lokasi strategis, SHM, "cocok buat rumah/kantor"' },
  { label: 'lowongan kerja', re: /^\s*(lowongan( kerja)?|loker|info loker|rekrutmen)\b|\b(candidate pool|we are hiring|job vacancy|apply now)\b/i , examples: 'judul diawali "Lowongan Kerja"/"Loker"/"Rekrutmen", candidate pool, we are hiring' },
  { label: 'spam judi online', re: /\b(slot gacor|judi (online|slot)|togel|maxwin|rtp live|situs slot|link alternatif|deposit pulsa|bandar (togel|slot))\b/i , examples: 'slot gacor, judi online, togel, maxwin, RTP live' },
  { label: 'kontak telepon/WA', re: /(\b(wa|whatsapp|hub|hubungi|call)\b[^a-z]{0,6}(\+?62|0)8\d{7,}|(\+?62|0)8\d{2}[- ]?\d{3,4}[- ]?\d{3,5})/i , examples: 'nomor HP/WA di judul atau cuplikan, mis. "hub 0812..."' },
];

/** Pengecualian yang aman ditambahkan langsung ke query mesin pencari (operator minus). */
export const QUERY_EXCLUDES = ['disewakan', 'dikontrakan', 'kontrakan', 'kos-kosan'];

export function blockedDomain(url = '') {
  const u = url.toLowerCase();
  return BLOCKED_DOMAINS.find((d) => u.includes('://' + d) || u.includes('.' + d) || u.includes('://www.' + d));
}

/** Alasan penolakan, atau null bila lolos pagar. */
export function guardrailReason(title: string, snippet = '', url = ''): string | null {
  const d = blockedDomain(url);
  if (d) return `domain ${d}`;
  const text = `${title} ${snippet}`;
  for (const p of SPAM_PATTERNS) if (p.re.test(text)) return p.label;
  return null;
}
