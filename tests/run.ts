// Uji unit & integrasi ringan (tanpa jaringan): npm test
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { parseBingRss, parseGdelt, parseGoogleNewsRss } from '../api/_lib/news';
import { lexiconAnalyze } from '../api/_lib/lexicon';
import { matchesQuery, webQuery, gdeltQuery, splitWindows } from '../api/_lib/query';
import { normalizeApify, normalizeComments } from '../api/_lib/social';
import { aggregate } from '../src/lib/aggregate';
import { groupNarrative } from '../src/lib/narrative';
import type { AnalyzedItem, Sentiment } from '../shared/types';

let n = 0;
const test = async (name: string, fn: () => unknown) => {
  try {
    await fn();
    n++;
    console.log('  ✓', name);
  } catch (e) {
    console.error('  ✗', name, '\n', e);
    process.exitCode = 1;
  }
};

const GN = `<?xml version="1.0"?><rss version="2.0"><channel><title>x</title>
<item><title>PT ABB Tingkatkan Kemampuan Literasi dan Numerasi Siswa - Barito Raya Post</title><link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link><guid isPermaLink="false">CBMiAAA</guid><pubDate>Mon, 22 Jun 2026 04:12:00 GMT</pubDate><description>&lt;a href="x"&gt;PT ABB&lt;/a&gt;</description><source url="https://www.baritorayapost.com">Barito Raya Post</source></item>
<item><title>Warga Laporkan Pencemaran Sungai oleh Perusahaan Tambang - JPNN</title><link>https://news.google.com/rss/articles/CBMiBBB?oc=5</link><guid isPermaLink="false">CBMiBBB</guid><pubDate>Tue, 23 Jun 2026 01:00:00 GMT</pubDate><source url="https://www.jpnn.com">JPNN</source></item>
</channel></rss>`;

const BING = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0" xmlns:News="https://www.bing.com/news/search?q=x&amp;format=rss"><channel>
<item><title>Turangga Resources Raih Gold Award</title><link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;aid=&amp;tid=1&amp;url=https%3a%2f%2fkalteng.tribunnews.com%2f2026%2f06%2f12%2fturangga&amp;c=1&amp;mkt=id-id</link><description>Turangga Resources meraih penghargaan Gold Award di ISA 2026.</description><pubDate>Fri, 12 Jun 2026 07:00:00 GMT</pubDate><News:Source>Tribunkalteng.com</News:Source></item>
</channel></rss>`;

console.log('DNVB Sosmed Tracker: tests');

await test('parse Google News RSS + buang suffix media + tier', () => {
  const r = parseGoogleNewsRss(GN);
  assert.equal(r.length, 2);
  assert.equal(r[0].title, 'PT ABB Tingkatkan Kemampuan Literasi dan Numerasi Siswa');
  assert.equal(r[0].outlet, 'Barito Raya Post');
  assert.equal(r[0].domain, 'baritorayapost.com');
  assert.equal(r[0].tier, 3);
  assert.equal(r[1].tier, 1);
  assert.equal(r[0].publishedAt, '2026-06-22T04:12:00.000Z');
});

await test('parse Bing RSS → URL asli', () => {
  const r = parseBingRss(BING);
  assert.equal(r[0].url, 'https://kalteng.tribunnews.com/2026/06/12/turangga');
  assert.equal(r[0].outlet, 'Tribunkalteng.com');
  assert.equal(r[0].tier, 1);
  assert.ok(r[0].snippet?.includes('Gold Award'));
});

await test('parse GDELT', () => {
  const r = parseGdelt({ articles: [{ url: 'https://www.kontan.co.id/a', title: 'UNTR', seendate: '20260713T070000Z', domain: 'kontan.co.id' }] });
  assert.equal(r[0].publishedAt, '2026-07-13T07:00:00.000Z');
  assert.equal(r[0].tier, 1);
});

await test('query builder boolean', () => {
  const q = { keywords: ['Asmin Bara Bronang', 'PT ABB'], context: ['batubara', 'Kapuas'], exclude: ['ABB Ltd'] };
  assert.equal(webQuery(q), '("Asmin Bara Bronang" OR "PT ABB") (batubara OR Kapuas) -"ABB Ltd" -disewakan -dikontrakan -kontrakan -kos-kosan');
  assert.equal(gdeltQuery({ keywords: ['Telen Orbit Prima'] }), '"Telen Orbit Prima"');
  assert.equal(splitWindows('2026-01-01', '2026-06-23', 8).length, 8);
});

await test('filter lokal konteks & pengecualian', () => {
  const q = { keywords: ['PT ABB'], context: ['Kapuas', 'tambang'], exclude: ['robot'] };
  assert.ok(matchesQuery({ title: 'PT ABB gelar kelas ibu hamil di Kapuas' }, q));
  assert.ok(!matchesQuery({ title: 'PT ABB luncurkan robot industri' }, q));
  assert.ok(!matchesQuery({ title: 'PT ABB umumkan laba' }, q));
});

await test('leksikon brand: slang, negasi, emoji, isu, tokoh', () => {
  const neg = lexiconAnalyze('1', 'Kecewa banget sama admin DNVB, udah seminggu chat gak dibalas 😡');
  assert.equal(neg.sentiment, 'negative', JSON.stringify(neg));
  assert.equal(neg.issue, 'Layanan & Pengalaman Pelanggan');
  const pos = lexiconAnalyze('2', 'Kelas DNVB Business School daging semua, recommended banget buat founder 🔥');
  assert.equal(pos.sentiment, 'positive', JSON.stringify(pos));
  assert.equal(pos.issue, 'Edukasi & Kelas');
  const neu = lexiconAnalyze('3', 'DNVB Indonesia membuka kelas baru minggu depan di Jakarta');
  assert.equal(neu.sentiment, 'neutral', JSON.stringify(neu));
  assert.ok(neu.locations.includes('Jakarta'));
  // negasi: "gak worth" negatif, "nggak nyesel" positif, "tidak bagus" negatif
  assert.equal(lexiconAnalyze('4', 'Harganya mahal banget, gak worth').sentiment, 'negative');
  assert.equal(lexiconAnalyze('5', 'Ikut membership ini nggak nyesel sama sekali').sentiment, 'positive');
  assert.equal(lexiconAnalyze('6', 'Materinya tidak bagus dan membingungkan').sentiment, 'negative');
  // batas kata: "top" di dalam "laptop" bukan pujian
  assert.equal(lexiconAnalyze('7', 'Review laptop untuk kerja').sentiment, 'neutral');
  const p = lexiconAnalyze('8', 'Founder DNVB Indonesia Budi Santoso meluncurkan program kreator baru');
  assert.ok(p.persons.some((x) => x.name === 'Budi Santoso'), JSON.stringify(p.persons));
});

await test('normalisasi output Apify (berbagai skema)', () => {
  const r = normalizeApify('tiktok', [{ text: 'Truk batubara bikin jalan rusak #kapuas', webVideoUrl: 'https://tiktok.com/@a/video/1', createTimeISO: '2026-06-01T00:00:00Z', playCount: 1200, diggCount: 50, authorMeta: { name: 'warga' } }]);
  assert.equal(r[0].engagement?.views, 1200);
  assert.equal(r[0].author, 'warga');
  const x = normalizeApify('x', [{ fullText: 'Turangga Resources keren', url: 'https://x.com/a/status/1', createdAt: 'Mon Jun 01 10:00:00 +0000 2026', likeCount: 3, author: { userName: 'abc' } }]);
  assert.equal(x[0].author, 'abc');
  assert.equal(x[0].publishedAt.slice(0, 10), '2026-06-01');
  // Threads (headply~threads-scraper)
  const th = normalizeApify('threads', [{ text: 'Forum Gosip DNVB seru banget', url: 'https://www.threads.com/@a/post/C1', authorUsername: 'a', createdAt: '2026-11-01T03:00:00Z', likeCount: 9, replyCount: 2, repostCount: 1 }]);
  assert.equal(th[0].source, 'threads');
  assert.equal(th[0].outlet, 'Threads');
  assert.equal(th[0].author, 'a');
  assert.equal(th[0].engagement?.shares, 1);
  assert.equal(th[0].publishedAt, '2026-11-01T03:00:00.000Z');
});

await test('komentar TikTok & Instagram (Apify) dinormalisasi sebagai komentar', () => {
  const parents = [{ url: 'https://www.tiktok.com/@dnvb/video/7428000000000000000', title: 'Video DNVB' }];
  const c = normalizeComments('tiktok', [{ text: 'mantap kak', diggCount: 4, createTimeISO: '2026-11-02T00:00:00Z', uniqueId: 'u1', videoWebUrl: parents[0].url, cid: '99' }, { error: 'x', errorCode: 'E' }], parents);
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'comment');
  assert.equal(c[0].outlet, 'TikTok (komentar)');
  assert.equal(c[0].author, 'u1');
  assert.ok(c[0].snippet?.includes('Video DNVB'));
  const ig = normalizeComments('instagram', [{ text: 'kecewa', ownerUsername: 'b', timestamp: '2026-11-03T00:00:00Z', likesCount: 1, postUrl: 'https://www.instagram.com/p/X/' }], [{ url: 'https://www.instagram.com/p/X/', title: 'Post' }]);
  assert.equal(ig[0].source, 'instagram');
  assert.equal(ig[0].author, 'b');
});

// Reproduksi angka slide contoh: ABB 70/44, SMM 108/3, TOP 31/0
const mk = (prefix: string, pos: number, neg: number, neu = 0): AnalyzedItem[] => {
  const out: AnalyzedItem[] = [];
  const push = (s: Sentiment, k: number) => {
    for (let i = 0; i < k; i++)
      out.push({
        id: `${prefix}-${s}-${i}`, source: 'googlenews', channel: 'news', outlet: 'x', url: 'u', title: `${prefix} ${s} ${i}`,
        publishedAt: '2026-03-0' + ((i % 9) + 1) + 'T00:00:00Z',
        a: { id: '', relevant: true, sentiment: s, score: 0, issue: s === 'negative' ? 'Lingkungan & Limbah' : 'CSR & Pemberdayaan', persons: [{ name: 'Hendra Hutahean', role: 'Presdir' }], organizations: [], locations: [], engine: 'lexicon' },
      });
  };
  push('positive', pos);
  push('negative', neg);
  push('neutral', neu);
  return out;
};

await test('narasi grup = format slide (61,4% / 38,6% / 97,3% / 2,7% / 100% / 81,6%)', () => {
  const ents = [
    { short: 'ABB', name: 'ABB', agg: aggregate(mk('abb', 70, 44, 21)) },
    { short: 'SMM', name: 'SMM', agg: aggregate(mk('smm', 108, 3, 22)) },
    { short: 'TOP', name: 'TOP', agg: aggregate(mk('top', 31, 0, 7)) },
  ];
  const lines = groupNarrative(ents, 'TTA Group', 'news');
  console.log(lines.map((l, i) => `      (${i + 1}) ${l}`).join('\n'));
  assert.ok(lines[0].includes('61,4% (70 dari 114 berita)') && lines[0].includes('38,6% (44 dari 114 berita)'));
  assert.ok(lines[1].includes('97,3%') && lines[1].includes('2,7%'));
  assert.ok(lines[2].startsWith('TOP: 100% sentimen positif (31 dari 31 berita)'));
  assert.ok(lines[3].includes('81,6%') && lines[3].includes('(209 berita)') && lines[3].includes('18,4%') && lines[3].includes('(47 berita)'));
});

await test('agregasi: tokoh, override sentimen, relevansi', () => {
  const items = mk('t', 3, 1, 1);
  items[4].a!.relevant = false;
  const ag = aggregate(items, { sentiment: { 't-negative-0': 'positive' }, irrelevant: {}, starred: {} });
  assert.equal(ag.total, 4);
  assert.equal(ag.sent.positive, 4);
  assert.equal(ag.persons[0].name, 'Hendra Hutahean');
  assert.equal(ag.persons[0].total, 4);
});

// Integrasi handler dengan fetch tiruan
const realFetch = globalThis.fetch;
const mockReq = (body: unknown, method = 'POST') => Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method, headers: {} }) as any;
const mockRes = () => {
  const r: any = { statusCode: 0, headers: {}, body: '', setHeader(k: string, v: string) { this.headers[k] = v; }, end(b: string) { this.body = b; } };
  return r;
};

await test('handler /api/collect (googlenews, fetch tiruan)', async () => {
  globalThis.fetch = (async () => new Response(GN, { status: 200 })) as any;
  const { default: h } = await import('../api/collect');
  const res = mockRes();
  await h(mockReq({ source: 'googlenews', query: { keywords: ['Asmin Bara Bronang', 'PT ABB'] }, from: '2026-06-01', to: '2026-06-30' }), res);
  const j = JSON.parse(res.body);
  assert.equal(j.ok, true, j.error);
  assert.equal(j.items.length, 2); // dedupe lintas window
  globalThis.fetch = realFetch;
});

await test('handler /api/analyze & /api/insight (mode leksikon)', async () => {
  delete process.env.GEMINI_API_KEY;
  const { default: a } = await import('../api/analyze');
  const res = mockRes();
  await a(mockReq({ topic: 'ABB', items: [{ id: 'x', title: 'Warga protes debu hauling PT ABB', channel: 'news', outlet: 'x' }] }), res);
  const j = JSON.parse(res.body);
  assert.equal(j.engine, 'lexicon');
  assert.equal(j.results[0].sentiment, 'negative');
  const { default: ins } = await import('../api/insight');
  const r2 = mockRes();
  await ins(mockReq({ topic: 'ABB', period: { from: '2026-01-01', to: '2026-06-23' }, stats: { total: 10, news: 8, social: 2, positive: 6, neutral: 1, negative: 3, topIssues: [{ issue: 'Lingkungan & Limbah', count: 4, negative: 3 }], topPersons: [], topOutlets: [], peakDays: [] }, headlines: [] }), r2);
  const k = JSON.parse(r2.body);
  assert.equal(k.engine, 'template');
  assert.ok(k.executiveSummary.includes('ABB'));
  assert.ok(k.risks.length >= 1);
});

await test('handler /api/health', async () => {
  const { default: h } = await import('../api/health');
  const res = mockRes();
  h(mockReq({}, 'GET'), res);
  const j = JSON.parse(res.body);
  assert.equal(j.sources.googlenews.enabled, true);
  // X selalu punya jalur (Exa nol-konfigurasi); Apify hanya bila ada token
  assert.equal(j.sources.x.enabled, true);
  assert.equal(j.sources.x.backends.find((b: any) => b.id === 'apify').available, !!process.env.APIFY_TOKEN);
  assert.equal(j.sources.x.active, process.env.APIFY_TOKEN ? 'Apify' : j.sources.x.active);
  assert.ok(j.reach && 'bins' in j.reach);
});


/* ------------------------- Kualitas crawl & tokoh (v2.5) ------------------------- */
const { parseKeyword, relevanceAll, webQuery: wq } = await import('../api/_lib/query');
const { parseDecodeResponse, buildDecodePayload, parseSignature, extractArticle, isListingUrl, listingLinks, googleNewsId } = await import('../api/_lib/article');
const { lexiconPersons } = await import('../api/_lib/lexicon');
const { mergeAliases } = await import('../src/lib/aggregate');

await test('frasa vs kumpulan kata', () => {
  assert.equal(parseKeyword('Asmin Bara Bronang').phrase, true);
  assert.equal(parseKeyword('PT ABB').phrase, true);
  assert.equal(parseKeyword('tambang batubara Kapuas pencemaran').phrase, false);
  assert.ok(wq({ keywords: ['tambang batubara Kapuas pencemaran'] }).startsWith('(tambang batubara Kapuas pencemaran) -'));
  assert.ok(wq({ keywords: ['"banjir Kapuas"'] }).startsWith('"banjir Kapuas" -'));
});

await test('relevansi: judul, isi, konteks, homonim', () => {
  const qs = [{ keywords: ['Asmin Bara Bronang'] }, { keywords: ['PT ABB'], context: ['Kapuas', 'batubara'], exclude: ['robot'] }];
  assert.ok(relevanceAll('PT ABB salurkan bantuan', 'Warga Kapuas menerima bantuan dari PT ABB', qs).score >= 0.3);
  assert.ok(relevanceAll('Harga batubara naik', 'Produksi PT Asmin Bara Bronang meningkat', qs).score >= 0.3);
  assert.equal(relevanceAll('PT ABB luncurkan robot', 'robot industri baru', qs).score, 0);
  assert.ok(relevanceAll('PT ABB umumkan laba', 'laba kuartal naik di Swiss', qs).score < 0.3);
  assert.ok(relevanceAll('Gempa di Jepang', 'tidak terkait', qs).score === 0);
  // batas kata: "pt abby" bukan "pt abb"
  assert.equal(relevanceAll('PT Abby Kapuas', 'batubara', qs).score, 0);
});

await test('dekode Google News: id, tanda tangan, payload, respon', () => {
  assert.equal(googleNewsId('https://news.google.com/rss/articles/CBMiXYZ?oc=5'), 'CBMiXYZ');
  assert.deepEqual(parseSignature('<c-wiz data-n-a-sg="SIG123" data-n-a-ts="1729000000">'), { sg: 'SIG123', ts: '1729000000' });
  const body = decodeURIComponent(buildDecodePayload('CBMiXYZ', '1729000000', 'SIG123').slice(6));
  assert.ok(body.includes('garturlreq') && body.includes('CBMiXYZ') && body.includes('SIG123'));
  const resp = ')]}\'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://kalteng.antaranews.com/berita/123/abb\\",1]",null,null,null,"generic"],["di",10]]';
  assert.equal(parseDecodeResponse(resp), 'https://kalteng.antaranews.com/berita/123/abb');
});

await test('ekstraksi artikel: JSON-LD, paragraf, boilerplate', () => {
  const html = `<html><head><meta property="og:description" content="Ringkasan berita">
  <script type="application/ld+json">{"@type":"NewsArticle","headline":"PT ABB bantu warga","datePublished":"2026-08-01T03:00:00+07:00","author":{"name":"Redaksi"},"articleBody":"${'Kapuas - PT Asmin Bara Bronang menyalurkan bantuan. '.repeat(6)}\\"Kami berterima kasih atas bantuan perusahaan,\\" ujar Budi Santoso, Kepala Desa Baronang."}</script></head>
  <body><article><p>Baca juga: berita lain yang tidak relevan sama sekali dengan topik ini</p></article></body></html>`;
  const a = extractArticle(html);
  assert.ok(a.body.includes('Asmin Bara Bronang'));
  assert.equal(a.publishedAt, '2026-07-31T20:00:00.000Z');
  assert.equal(a.description, 'Ringkasan berita');
  const html2 = '<article><p>Baca juga: lain hal yang panjang sekali untuk diabaikan oleh sistem</p><p>Kepala Dinas Lingkungan Hidup Kapuas mengatakan pemantauan kualitas air dilakukan rutin setiap bulan.</p></article>';
  assert.ok(extractArticle(html2).body.startsWith('Kepala Dinas'));
});

await test('crawl lanjutan dari halaman tag', () => {
  assert.ok(isListingUrl('https://kalteng.antaranews.com/tag/pt-asmin-bara-bronang'));
  assert.ok(!isListingUrl('https://kalteng.antaranews.com/berita/123/pt-abb-bantu-warga'));
  const html = '<a href="/berita/1/pt-asmin-bara-bronang-raih-penghargaan">PT Asmin Bara Bronang raih penghargaan IPPKH</a><a href="/berita/2/x">Harga cabai naik tajam di pasar Palangka Raya</a><a href="https://lain.com/a">PT Asmin Bara Bronang di situs lain yang panjang</a>';
  const links = listingLinks(html, 'https://kalteng.antaranews.com/tag/pt-asmin-bara-bronang', (t) => relevanceAll(t, '', [{ keywords: ['Asmin Bara Bronang'] }]).inTitle);
  assert.equal(links.length, 1);
  assert.equal(links[0].url, 'https://kalteng.antaranews.com/berita/1/pt-asmin-bara-bronang-raih-penghargaan');
});

await test('tokoh dari isi berita: pernyataan, aposisi, jabatan + koma', () => {
  const t = '"Kami berterima kasih atas bantuan perusahaan untuk sekolah," ujar Budi Santoso, Kepala Desa Baronang. Sementara itu Siti Aminah, Ketua BPD Baronang, mengatakan program berjalan baik. Kepala Desa Lemo, Ahmad Yani, juga hadir.';
  const ps = lexiconPersons(t, 'positive');
  const byName = Object.fromEntries(ps.map((p) => [p.name, p]));
  assert.ok(byName['Budi Santoso'], JSON.stringify(ps));
  assert.equal(byName['Budi Santoso'].role, 'Kepala Desa Baronang');
  assert.ok(byName['Budi Santoso'].quote?.startsWith('Kami berterima kasih'));
  assert.ok(byName['Siti Aminah']?.role?.startsWith('Ketua BPD'), JSON.stringify(ps));
  assert.ok(byName['Ahmad Yani']?.role === 'Kepala Desa Lemo', JSON.stringify(ps));
});

await test('gabung alias tokoh', () => {
  const mk = (name: string, ids: string[]) => ({ name, total: ids.length, positive: ids.length, neutral: 0, negative: 0, itemIds: ids, quotes: [] });
  const m = mergeAliases([mk('Wiyatno', ['a']), mk('Muhammad Wiyatno', ['b', 'c']), mk('Budi Santoso', ['d'])]);
  assert.equal(m.length, 2);
  assert.equal(m[0].name, 'Muhammad Wiyatno');
  assert.equal(m[0].total, 3);
});

await test('handler /api/enrich: dekode Google News + baca isi + buang tidak relevan', async () => {
  const article = '<script type="application/ld+json">{"@type":"NewsArticle","articleBody":"' + 'PT Asmin Bara Bronang menanam 10.000 pohon di Kapuas. '.repeat(6) + '"}</script>';
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes('news.google.com/articles/')) return new Response('<div data-n-a-sg="S" data-n-a-ts="1">');
    if (u.includes('batchexecute')) return new Response(')]}\'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://media.id/a\\",1]"]]');
    if (u === 'https://media.id/a') return new Response(article);
    if (u === 'https://media.id/b') return new Response('<article><p>Harga cabai di pasar naik tajam minggu ini menurut pedagang setempat.</p></article>');
    return new Response('not found', { status: 404 });
  }) as any;
  const { default: h } = await import('../api/enrich');
  const res = mockRes();
  await h(mockReq({ queries: [{ keywords: ['Asmin Bara Bronang'] }], items: [
    { id: 'g1', url: 'https://news.google.com/rss/articles/CBMiAAA?oc=5', source: 'googlenews', title: 'Penghijauan di Kapuas' },
    { id: 'b1', url: 'https://media.id/b', source: 'bingnews', title: 'Harga cabai naik' },
  ] }), res);
  const j = JSON.parse(res.body);
  const g = j.results.find((r: any) => r.id === 'g1');
  assert.equal(g.originalUrl, 'https://media.id/a');
  assert.equal(g.read, 'ok');
  assert.equal(g.relevant, true);
  assert.equal(j.results.find((r: any) => r.id === 'b1').relevant, false);
  globalThis.fetch = realFetch;
});


const { articleImages } = await import('../api/_lib/article');
const { attachPhotos } = await import('../src/lib/aggregate');

await test('foto artikel: JSON-LD caption, figure/figcaption, alt, og:image', () => {
  const html = `<meta property="og:image" content="//cdn.media.id/og.jpg"><meta property="og:image:alt" content="Bupati Kapuas Muhammad Wiyatno meninjau lokasi">
  <figure><img data-src="/foto/budi.jpg" src="/lazy.gif"><figcaption>Kepala Desa Baronang Budi Santoso saat diwawancarai</figcaption></figure>
  <img src="http://cdn.media.id/logo.png" alt="logo media yang panjang sekali">`;
  const ims = articleImages(html, 'https://media.id/berita/1', [{ src: 'https://cdn.media.id/ld.jpg', caption: 'Siti Aminah memberikan keterangan' }]);
  const urls = ims.map((i) => i.url);
  assert.ok(urls.includes('https://cdn.media.id/ld.jpg'));
  assert.ok(urls.includes('https://media.id/foto/budi.jpg'), JSON.stringify(urls));
  assert.ok(urls.includes('https://cdn.media.id/og.jpg'));
  assert.ok(!urls.some((u) => u.includes('logo')));
});

await test('foto tokoh: cocok keterangan, hindari foto bersama', () => {
  const persons: any[] = [
    { name: 'Budi Santoso', total: 1, positive: 1, neutral: 0, negative: 0, itemIds: ['i1'], quotes: [] },
    { name: 'Siti Aminah', total: 1, positive: 1, neutral: 0, negative: 0, itemIds: ['i1'], quotes: [] },
  ];
  const items: any[] = [{ id: 'i1', outlet: 'Antara', sentiment: 'positive', images: [
    { url: 'https://x/bersama.jpg', caption: 'Budi Santoso dan Siti Aminah menanam pohon' },
    { url: 'https://x/budi.jpg', caption: 'Kepala Desa Budi Santoso' },
  ], a: { persons: [{ name: 'Budi Santoso' }, { name: 'Siti Aminah' }] } }];
  attachPhotos(persons, items);
  assert.equal(persons[0].photo?.url, 'https://x/budi.jpg');
  assert.equal(persons[1].photo, undefined);
});


const { guardrailReason } = await import('../shared/guardrails');
await test('pagar pembatas: iklan properti "Turangga" (Bandung) ditolak', () => {
  const t = 'Di Kontrakan Rmh Capricorn Turangga Dalam Linkungan Aman Nyaman Cocok Buat Rumah Tinggal atau Kantor';
  assert.ok(guardrailReason(t));
  const tta = [{ keywords: ['Turangga Resources', 'Tuah Turangga Agung'] }, { keywords: ['Turangga'], context: ['tambang', 'batubara', 'Turangga', 'Kalimantan'], exclude: ['kuda'] }];
  assert.equal(relevanceAll(t, 'Rumah di Jl. Turangga Bandung. Pemilik asal Kalimantan.', tta).score, 0);
  // tanpa kata iklan pun: "Turangga" + konteks jauh / konteks = kata kunci sendiri -> tidak relevan
  assert.ok(relevanceAll('Kuliner enak di Turangga Bandung', 'Jalan Turangga ramai. ' + 'kata pengisi '.repeat(40) + 'tambang emas di Papua', tta).score < 0.3);
  // berita asli tetap lolos
  assert.ok(relevanceAll('Turangga Resources raih penghargaan', '', tta).score >= 0.3);
  assert.ok(relevanceAll('CSR tambang Turangga di Kapuas', 'Turangga menyalurkan bantuan tambang batubara', tta).score >= 0.3);
  // berita rekrutmen warga lokal (bukan iklan lowongan) tidak terblokir
  assert.equal(guardrailReason('Perusahaan tambang di Kapuas buka lowongan untuk warga lokal'), null);
  assert.ok(guardrailReason('Lowongan Kerja PT Tuah Turangga Agung 2026'));
  assert.ok(guardrailReason('Ruko strategis', '', 'https://www.rumah123.com/properti/abc'));
});


await test('SumoPod: chat JSON (OpenAI-compatible) + embedding saringan makna', async () => {
  process.env.SUMOPOD_API_KEY = 'sk-test';
  const calls: string[] = [];
  // vektor sederhana: dimensi 0 = "tambang", 1 = "iklan properti", 2 = lain-lain
  const vec = (t: string) => (/kontrakan|sewa|properti|rumah tinggal/i.test(t) ? [0.1, 1, 0.1] : /tambang|batubara|Asmin|Turangga Resources/i.test(t) ? [1, 0.1, 0.1] : [0.2, 0.2, 1]);
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url);
    calls.push(u);
    const body = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, 'Bearer sk-test');
    if (u.endsWith('/chat/completions')) {
      assert.equal(body.model, 'gemini/gemini-3.1-flash-lite');
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"results":[{"id":"x","relevant":true,"sentiment":"negative","score":-0.6,"issue":"Lingkungan & Limbah","persons":[{"name":"Budi Santoso","role":"Kepala Desa"},{"name":"Nama Karangan"}],"organizations":[],"locations":[]}]}\n```' } }] }));
    }
    if (u.endsWith('/embeddings')) {
      assert.equal(body.model, 'gemini/gemini-embedding-001');
      return new Response(JSON.stringify({ data: body.input.map((t: string, index: number) => ({ index, embedding: vec(t) })) }));
    }
    return new Response('{}', { status: 404 });
  }) as any;
  const { default: an } = await import('../api/analyze');
  const r1 = mockRes();
  await an(mockReq({ topic: 'ABB', items: [{ id: 'x', title: 'Warga protes limbah', body: 'Budi Santoso, Kepala Desa, mengatakan air keruh.', channel: 'news', outlet: 'x' }] }), r1);
  const j1 = JSON.parse(r1.body);
  assert.equal(j1.engine, 'gemini');
  assert.equal(j1.results[0].sentiment, 'negative');
  assert.deepEqual(j1.results[0].persons.map((p: any) => p.name), ['Budi Santoso']); // nama karangan dibuang
  const { default: sem } = await import('../api/semantic');
  const r2 = mockRes();
  await sem(mockReq({ topic: 'Turangga Resources', context: 'tambang batubara', keywords: ['Turangga'], items: [
    { id: 'ok', text: 'Turangga Resources tambang batubara salurkan CSR' },
    { id: 'iklan', text: 'Di Kontrakan Rmh Capricorn Turangga cocok buat rumah tinggal' },
  ] }), r2);
  const j2 = JSON.parse(r2.body);
  assert.equal(j2.enabled, true);
  assert.equal(j2.results.find((x: any) => x.id === 'ok').relevant, true);
  assert.equal(j2.results.find((x: any) => x.id === 'iklan').relevant, false);
  const { default: h } = await import('../api/health');
  const r3 = mockRes();
  h(mockReq({}, 'GET'), r3);
  const j3 = JSON.parse(r3.body);
  assert.equal(j3.ai.provider, 'sumopod');
  assert.equal(j3.ai.embedModel, 'gemini/gemini-embedding-001');
  delete process.env.SUMOPOD_API_KEY;
  globalThis.fetch = realFetch;
});

await test('foto tokoh: unduh dengan Referer, cek AI, pencarian berita, Wikipedia, data URL', async () => {
  const realFetch = globalThis.fetch;
  process.env.SUMOPOD_API_KEY = 'sk-test';
  delete process.env.BLOB_READ_WRITE_TOKEN;
  const jpg = Buffer.alloc(8000, 1);
  const seen: { url: string; referer?: string }[] = [];
  let visionCalls = 0;
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url);
    seen.push({ url: u, referer: init?.headers?.Referer });
    const img = () => new Response(jpg, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(jpg.length) } });
    if (u.includes('cdn.media.id/hotlink.jpg')) return init?.headers?.Referer ? img() : new Response('no', { status: 403 });
    if (u.includes('cdn.media.id/logo-grafis.jpg')) return img();
    if (u.includes('upload.wikimedia.org')) return img();
    if (u.includes('/chat/completions')) {
      visionCalls++;
      const body = JSON.parse(init.body);
      const pic = body.messages[0].content[1].image_url.url as string;
      assert.ok(pic.startsWith('data:image/jpeg;base64,'));
      const cap = body.messages[0].content[0].text as string;
      const ok = !cap.includes('Infografis');
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ people: ok ? 1 : 0, main_person: ok, kind: ok ? 'portrait' : 'graphic' }) } }] }), { status: 200 });
    }
    if (u.includes('bing.com/news')) return new Response('<rss><channel></channel></rss>', { status: 200 });
    if (u.includes('wikipedia.org/w/api.php'))
      return new Response(JSON.stringify({ query: { pages: [{ title: 'Hendra Hutahean', description: 'pengusaha Indonesia, Presiden Direktur Turangga Resources', extract: 'Hendra Hutahean (lahir 1970) adalah pengusaha.', thumbnail: { source: 'https://upload.wikimedia.org/x.jpg' } }] } }), { status: 200 });
    return new Response('not found', { status: 404 });
  }) as any;
  const { resolvePerson } = await import('../api/_lib/photos');
  // 1) kandidat pertama infografis (ditolak AI), kedua hotlink (butuh Referer)
  const r = await resolvePerson(
    {
      name: 'Muhammad Wiyatno',
      role: 'Bupati Kapuas',
      candidates: [
        { url: 'https://cdn.media.id/logo-grafis.jpg', caption: 'Infografis Muhammad Wiyatno', articleUrl: 'https://media.id/a', outlet: 'Media', kind: 'caption' },
        { url: 'https://cdn.media.id/hotlink.jpg', caption: 'Bupati Kapuas Muhammad Wiyatno', articleUrl: 'https://media.id/b', outlet: 'Media B', kind: 'caption' },
      ],
    },
    { search: false },
  );
  assert.ok(r.photo, 'foto ditemukan');
  assert.equal(r.photo!.key, 'muhammad-wiyatno');
  assert.equal(r.photo!.source, 'berita');
  assert.equal(r.photo!.credit, 'Media B');
  assert.ok(r.photo!.src.startsWith('data:image/jpeg;base64,'));
  assert.equal(seen.find((x) => x.url.includes('hotlink'))?.referer, 'https://media.id/b');
  assert.equal(visionCalls, 2);
  // 2) tanpa kandidat berita: Wikipedia (nama + konteks organisasi cocok)
  const w = await resolvePerson({ name: 'Hendra Hutahean', role: 'Presiden Direktur', org: 'Turangga Resources' });
  assert.equal(w.photo?.source, 'wikipedia');
  // 3) halaman Wikipedia orang lain tidak dipakai
  const x = await resolvePerson({ name: 'Budi Santoso', role: 'Kepala Desa', org: 'Desa Buhut' });
  assert.equal(x.photo, undefined);
  // 4) foto yang ditolak analis tidak dipakai lagi
  const e = await resolvePerson({ name: 'Muhammad Wiyatno', role: 'Bupati Kapuas', candidates: [{ url: 'https://cdn.media.id/hotlink.jpg', caption: 'Bupati Kapuas Muhammad Wiyatno', articleUrl: 'https://media.id/b', kind: 'caption' }] }, { search: false, exclude: ['https://media.id/b'] });
  assert.equal(e.photo, undefined);
  const { default: ph } = await import('../api/photos');
  const res = mockRes();
  await ph(mockReq({}, 'GET'), res);
  assert.equal(JSON.parse(res.body).store, 'browser');
  delete process.env.SUMOPOD_API_KEY;
  globalThis.fetch = realFetch;
});

await test('Agent Reach: normalisasi twitter-cli, OpenCLI, rdt, yt-dlp, RSS', async () => {
  const R = await import('../api/_lib/reach');
  const tw = R.fromTwitterCli({ ok: true, data: [{ id: '19', text: 'PT Asmin Bara Bronang tanam pohon', author: { screenName: 'kaltengpos', name: 'Kalteng Pos' }, metrics: { likes: 12, replies: 3, retweets: 4, views: 900 }, createdAtISO: '2026-10-10T02:00:00Z', media: [] }] }.data);
  assert.equal(tw[0].url, 'https://x.com/kaltengpos/status/19');
  assert.equal(tw[0].engagement?.likes, 12);
  assert.equal(tw[0].source, 'x');
  const fb = R.fromOpencli('facebook', 'facebook', [{ index: 1, title: 'Turangga Resources', text: 'Turangga Resources salurkan bantuan banjir Kapuas', url: 'https://facebook.com/p/1' }]);
  assert.match(fb[0].title, /Turangga/);
  const tt = R.fromOpencli('tiktok', 'tiktok', [{ desc: 'tambang batubara Kapuas', author: 'warga', url: 'https://www.tiktok.com/@warga/video/7428000000000000000', plays: '1.2K', likes: '35' }]);
  assert.equal(tt[0].engagement?.views, 1200);
  assert.ok(tt[0].publishedAt.startsWith('2024'), 'tanggal dari ID TikTok');
  const rd = R.fromOpencli('reddit', 'reddit', [{ id: 'abc', title: 'Coal mining Kalimantan', subreddit: 'indonesia', author: 'u1', score: 10, comments: 4, url: 'https://www.reddit.com/r/indonesia/comments/abc/x/', created_utc: 1760000000 }]);
  assert.equal(rd[0].outlet, 'Reddit r/indonesia');
  const yt = R.fromOpencli('youtube', 'youtube', [{ title: 'Reklamasi tambang', channel: 'Kanal', video_id: 'v1', views: '3 rb', published: '2 minggu yang lalu' }]);
  assert.equal(yt[0].url, 'https://www.youtube.com/watch?v=v1');
  assert.ok(Date.now() - new Date(yt[0].publishedAt).getTime() > 13 * 86400000);
  const rl = R.fromRedditListing({ kind: 'Listing', data: { children: [{ data: { id: 'z', title: 'Turangga coal', permalink: '/r/a/comments/z/t/', subreddit: 'a', created_utc: 1760000000, ups: 2, num_comments: 1 } }] } });
  assert.equal(rl[0].url, 'https://www.reddit.com/r/a/comments/z/t/');
  assert.equal(R.fromYtDlp([{ id: 'q', title: 'Video', channel: 'C', upload_date: '20261001' }])[0].publishedAt.slice(0, 10), '2026-10-01');
  const feed = R.fromFeed('<rss><channel><title>Antara</title><item><title>Turangga Resources raih penghargaan</title><link>https://kalteng.antaranews.com/berita/9</link><pubDate>Mon, 12 Oct 2026 01:00:00 GMT</pubDate><description>Isi</description></item></channel></rss>', 'https://kalteng.antaranews.com/rss/terkini.xml');
  assert.equal(feed[0].source, 'rss');
  assert.equal(feed[0].channel, 'news');
  assert.equal(feed[0].outlet, 'kalteng.antaranews.com');
  const atom = R.fromFeed('<feed><title>Blog</title><entry><title>Coal post</title><link href="https://b.id/1"/><updated>2026-10-01T00:00:00Z</updated></entry></feed>', 'https://b.id/feed');
  assert.equal(atom[0].url, 'https://b.id/1');
});

await test('Agent Reach: CLI sungguhan (opencli tiruan di PATH), amplop JSON, urutan jalur', async () => {
  const { mkdtempSync, writeFileSync, chmodSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'reach-'));
  const fake = join(dir, 'opencli');
  writeFileSync(
    fake,
    `#!/usr/bin/env node
const a = process.argv.slice(2);
if (a[0] === 'twitter' && a[1] === 'search') console.log('log baris lain\\n' + JSON.stringify({ ok: true, data: [{ id: '7', author: 'warga_kapuas', text: a[2] + ' cemari sungai Kapuas', created_at: new Date().toISOString(), likes: 5, url: 'https://x.com/warga_kapuas/status/7' }] }));
else if (a[0] === 'facebook') console.log(JSON.stringify({ ok: false, error: { code: 'AUTH_REQUIRED', message: 'login facebook.com dulu' } }));
else console.log(JSON.stringify({ ok: true, data: [] }));
`,
  );
  chmodSync(fake, 0o755);
  const oldPath = process.env.PATH;
  process.env.PATH = `${dir}:${oldPath}`;
  delete process.env.APIFY_TOKEN;
  process.env.REACH_EXA = '0';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response('{}', { status: 500 })) as any;
  const { runSource, backendStatus } = await import('../api/_lib/reach');
  (await import('../api/_lib/cli')).clearBinCache();
  const ctx = { q: { keywords: ['Asmin Bara Bronang'] }, from: new Date(Date.now() - 30 * 86400000).toISOString(), to: new Date().toISOString() };
  const st = backendStatus('x');
  assert.deepEqual(st.map((b) => b.id), ['apify', 'twitter-cli', 'opencli', 'bridge', 'firecrawl', 'exa']);
  assert.equal(st.find((b) => b.id === 'opencli')?.available, true);
  const r = await runSource('x', ctx);
  assert.equal(r.via, 'OpenCLI');
  assert.equal(r.items[0].author, 'warga_kapuas');
  assert.match(r.items[0].title, /Asmin Bara Bronang cemari/);
  // jalur gagal dilaporkan dengan pesan CLI
  await assert.rejects(() => runSource('facebook', ctx), /AUTH_REQUIRED: login facebook.com dulu/);
  // collect memakai jalur yang sama dan melaporkan "via"
  const { default: collect } = await import('../api/collect');
  const res = mockRes();
  await collect(mockReq({ source: 'x', query: { keywords: ['Asmin Bara Bronang'] }, from: ctx.from, to: ctx.to }), res);
  const j = JSON.parse(res.body);
  assert.equal(j.ok, true);
  assert.equal(j.via, 'OpenCLI');
  assert.equal(j.items.length, 1);
  process.env.PATH = oldPath;
  delete process.env.REACH_EXA;
  globalThis.fetch = realFetch;
});

await test('Agent Reach: Exa MCP (SSE + sesi), Exa teks, Jina Reader, shim npm Windows', async () => {
  delete process.env.REACH_EXA;
  const E = await import('../api/_lib/exa');
  const realFetch = globalThis.fetch;
  let calls = 0;
  const bodies: any[] = [];
  globalThis.fetch = (async (url: any, init?: any) => {
    const u = String(url);
    if (u.includes('mcp.exa.ai')) {
      calls++;
      const b = JSON.parse(init.body);
      bodies.push(b);
      if (b.method === 'tools/call' && !init.headers['Mcp-Session-Id']) return new Response(JSON.stringify({ jsonrpc: '2.0', id: b.id, error: { code: -32000, message: 'Bad Request: No valid session ID' } }), { status: 400 });
      if (b.method === 'initialize') return new Response('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: 0, result: { protocolVersion: '2025-03-26' } }) + '\n\n', { status: 200, headers: { 'mcp-session-id': 'S1', 'content-type': 'text/event-stream' } });
      if (b.method === 'notifications/initialized') return new Response('', { status: 202 });
      const text = 'Title: Warga protes debu batubara Asmin Bara Bronang\nURL: https://x.com/warga/status/1\nPublished Date: 2026-10-05T00:00:00.000Z\nAuthor: warga\nText: Debu dari hauling PT Asmin Bara Bronang mengganggu.\n\nTitle: Halaman lain\nURL: https://example.com/a\nText: tidak relevan';
      return new Response('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: b.id, result: { content: [{ type: 'text', text }] } }) + '\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (u.startsWith('https://r.jina.ai/')) return new Response('Title: Judul\nURL Source: https://a.id/x\n\nMarkdown Content:\n# Judul\n\n![foto](https://a.id/f.jpg)\n\nPT Asmin Bara Bronang menyalurkan bantuan kepada warga Desa Baronang pada Senin pagi. [Baca juga](https://a.id/y)\n\nBaca juga: berita lain yang tidak relevan untuk isi', { status: 200 });
    return new Response('no', { status: 404 });
  }) as any;
  const res = await E.exaSearch('"Asmin Bara Bronang"', { domains: ['x.com', 'twitter.com'] });
  assert.equal(res.length, 1, 'hasil di luar domain disaring');
  assert.equal(res[0].author, 'warga');
  assert.ok(bodies.some((b) => b.method === 'initialize'));
  assert.match(bodies.at(-1).params.arguments.query, /site:x\.com/);
  const { fromExa } = await import('../api/_lib/reach');
  const items = fromExa('x', res);
  assert.match(items[0].title, /Warga protes debu/);
  assert.equal(items[0].publishedAt.slice(0, 10), '2026-10-05');
  assert.equal(E.parseExaText(JSON.stringify({ results: [{ title: 'A', url: 'https://a.id', text: 't' }] }))[0].url, 'https://a.id');
  const j = await E.jinaRead('https://a.id/x');
  assert.equal(j?.title, 'Judul');
  assert.equal(j?.image, 'https://a.id/f.jpg');
  assert.match(j!.text, /menyalurkan bantuan/);
  assert.ok(!/Baca juga:/.test(j!.text));
  globalThis.fetch = realFetch;
  // shim npm Windows → skrip JS (tanpa shell)
  const { mkdtempSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const d = mkdtempSync(join(tmpdir(), 'shim-'));
  mkdirSync(join(d, 'node_modules/@jackwener/opencli/dist/src'), { recursive: true });
  writeFileSync(join(d, 'node_modules/@jackwener/opencli/dist/src/main.js'), '');
  writeFileSync(join(d, 'opencli.cmd'), '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\n"%_prog%"  "%dp0%\\node_modules\\@jackwener\\opencli\\dist\\src\\main.js" %*\r\n');
  const { npmShimTarget, parseJsonOut, unwrap } = await import('../api/_lib/cli');
  assert.equal(npmShimTarget(join(d, 'opencli.cmd')), join(d, 'node_modules/@jackwener/opencli/dist/src/main.js'));
  assert.deepEqual(unwrap(parseJsonOut('warn\n{"ok":true,"schema_version":"1","data":[1]}\n  ▸ More')), [1]);
  assert.equal(parseJsonOut('{"a":1}\n{"a":2}').length, 2);
});

await test('Exa API (EXA_API_KEY): bentuk permintaan sesuai build-with-exa, highlights → teks', async () => {
  const realFetch = globalThis.fetch;
  process.env.EXA_API_KEY = 'exa-test';
  let sent: any;
  let headers: any;
  globalThis.fetch = (async (url: any, init?: any) => {
    assert.equal(String(url), 'https://api.exa.ai/search');
    sent = JSON.parse(init.body);
    headers = init.headers;
    return new Response(JSON.stringify({ requestId: 'r', results: [{ title: 'Warga keluhkan debu', url: 'https://x.com/a/status/1', publishedDate: '2026-10-02T00:00:00.000Z', author: 'a', highlights: ['Debu hauling PT Asmin Bara Bronang', 'mengganggu warga Desa Baronang'] }] }), { status: 200 });
  }) as any;
  const { BACKENDS } = await import('../api/_lib/reach');
  const exaX = BACKENDS.x!.find((b) => b.id === 'exa')!;
  const items = await exaX.run({ q: { keywords: ['Asmin Bara Bronang'] }, from: '2026-09-01T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z' });
  assert.equal(headers['x-api-key'], 'exa-test');
  assert.equal(sent.type, 'auto');
  assert.deepEqual(sent.contents, { highlights: true });
  assert.deepEqual(sent.includeDomains, ['x.com', 'twitter.com']);
  assert.equal(sent.startPublishedDate, undefined, 'sosial: tanpa filter tanggal (unggahan tanpa tanggal tidak hilang)');
  assert.equal(sent.userLocation, 'ID');
  assert.ok(!('text' in sent) && !('category' in sent));
  assert.match(items[0].title, /Debu hauling PT Asmin Bara Bronang … mengganggu/);
  const exaWeb = BACKENDS.web!.find((b) => b.id === 'exa')!;
  await exaWeb.run({ q: { keywords: ['Turangga Resources'] }, from: '2026-09-01T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z' });
  assert.equal(sent.startPublishedDate, '2026-09-01T00:00:00.000Z', 'web: periode pantauan ditegakkan');
  assert.equal(sent.includeDomains, undefined);
  delete process.env.EXA_API_KEY;
  globalThis.fetch = realFetch;
});

await test('Firecrawl: search v2 (web+news, Indonesia, rentang tanggal), jalur sosial, crawl media, scrape', async () => {
  const realFetch = globalThis.fetch;
  process.env.FIRECRAWL_API_KEY = 'fc-test';
  process.env.FIRECRAWL_MAP_SITES = 'kalteng.antaranews.com';
  const calls: { url: string; body: any; auth: string }[] = [];
  globalThis.fetch = (async (url: any, init?: any) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, auth: init.headers.Authorization });
    if (String(url).endsWith('/v2/map'))
      return new Response(JSON.stringify({ success: true, links: [{ url: 'https://kalteng.antaranews.com/berita/123456/asmin-bara-bronang-salurkan-bantuan', title: 'ABB salurkan bantuan', description: 'PT Asmin Bara Bronang menyalurkan bantuan' }, { url: 'https://kalteng.antaranews.com/tag/abb', title: 'tag' }] }), { status: 200 });
    if (String(url).endsWith('/v2/scrape'))
      return new Response(JSON.stringify({ success: true, data: { markdown: '# Judul\n\n![img](https://img.example/a.jpg)\n\nPT Asmin Bara Bronang menyalurkan bantuan pendidikan kepada warga Desa Baronang, Kabupaten Kapuas, Kalimantan Tengah.\n\nBaca juga: lainnya yang tidak relevan sama sekali di sini ya', metadata: { title: 'ABB salurkan bantuan', publishedTime: '2026-10-01T02:00:00Z' } } }), { status: 200 });
    if (body.includeDomains?.[0] === 'x.com')
      return new Response(JSON.stringify({ success: true, data: { web: [{ url: 'https://x.com/warga/status/1', title: 'warga di X', description: 'Debu hauling Asmin Bara Bronang ganggu warga' }] } }), { status: 200 });
    return new Response(JSON.stringify({ success: true, data: { news: [{ title: 'Asmin Bara Bronang raih penghargaan', url: 'https://kalteng.tribunnews.com/2026/10/02/abb', snippet: 'PT Asmin Bara Bronang meraih penghargaan', date: '3 days ago' }], web: [{ url: 'https://kalteng.tribunnews.com/2026/10/02/abb', title: 'dup', description: 'dup' }, { url: 'https://abb.co.id/csr', title: 'CSR ABB', description: 'Program CSR PT Asmin Bara Bronang', markdown: 'x' }] } }), { status: 200 });
  }) as any;
  const F = await import('../api/_lib/firecrawl');
  assert.equal(F.tbsRange('2026-09-01T00:00:00.000Z', '2026-10-19T00:00:00.000Z'), 'cdr:1,cd_min:9/1/2026,cd_max:10/19/2026');
  const { BACKENDS, firecrawlMedia } = await import('../api/_lib/reach');
  const ctx = { q: { keywords: ['Asmin Bara Bronang'] }, from: '2026-09-01T00:00:00.000Z', to: '2026-10-19T00:00:00.000Z' };
  // sosial: Firecrawl sebelum Exa, dibatasi domain platform
  const xs = BACKENDS.x!.map((b) => b.id);
  assert.ok(xs.indexOf('firecrawl') >= 0 && xs.indexOf('firecrawl') < xs.indexOf('exa'));
  const xi = await BACKENDS.x!.find((b) => b.id === 'firecrawl')!.run(ctx);
  assert.equal(calls[0].url, 'https://api.firecrawl.dev/v2/search');
  assert.equal(calls[0].auth, 'Bearer fc-test');
  assert.deepEqual(calls[0].body.includeDomains, ['x.com', 'twitter.com']);
  assert.equal(calls[0].body.country, 'ID');
  assert.equal(calls[0].body.lang, 'id');
  assert.equal(calls[0].body.tbs, 'cdr:1,cd_min:9/1/2026,cd_max:10/19/2026');
  assert.equal(xi[0].source, 'x');
  assert.match(xi[0].title, /Debu hauling/);
  // crawl media: search web+news, TIER2, TIER1, map situs
  calls.length = 0;
  const items = await firecrawlMedia(ctx);
  assert.deepEqual(calls[0].body.sources, ['news', 'web']);
  assert.ok(calls.some((c) => c.body.includeDomains?.includes('marketeers.com')), 'media bisnis & marketing');
  assert.ok(calls.some((c) => c.url.endsWith('/v2/map') && c.body.search === 'Asmin Bara Bronang'));
  assert.ok(calls.length <= 8, 'anggaran FIRECRAWL_MAX_REQUESTS');
  const urls = items.map((i) => i.url);
  assert.equal(new Set(urls).size, urls.length, 'tanpa duplikat');
  assert.ok(urls.includes('https://kalteng.antaranews.com/berita/123456/asmin-bara-bronang-salurkan-bantuan'));
  assert.ok(!urls.includes('https://kalteng.antaranews.com/tag/abb'), 'halaman tag dibuang');
  const news = items.find((i) => i.url.includes('tribunnews'))!;
  assert.equal(news.source, 'firecrawl');
  assert.equal(news.tier, 1);
  assert.ok(news.publishedAt && Date.now() - new Date(news.publishedAt).getTime() < 4 * 86400000);
  // scrape (pembaca artikel cadangan)
  const sc = await F.fcScrape('https://kalteng.antaranews.com/berita/123456/x');
  assert.match(sc!.text, /Desa Baronang/);
  assert.ok(!/Baca juga|!\[/.test(sc!.text));
  assert.equal(sc!.image, 'https://img.example/a.jpg');
  assert.equal(sc!.publishedAt, '2026-10-01T02:00:00Z');
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.FIRECRAWL_MAP_SITES;
  assert.equal(F.fcMode(), 'off');
  globalThis.fetch = realFetch;
});

await test('RSS maksimal: penemuan semua feed dari direktori (gaya antaranews.com/rss), baca & saring', async () => {
  const R = await import('../api/_lib/rss');
  const dir = `<html><head><link rel="alternate" type="application/rss+xml" href="/rss/terkini.xml"></head><body>
    <a href="https://www.antaranews.com/rss/top-news.xml">Top</a><a href="/rss/ekonomi.xml">Ekonomi</a><a href="/rss/ekonomi-bisnis.xml">Bisnis</a>
    <a href="/rss/warta-bumi.xml">Warta Bumi</a><a href="https://kalteng.antaranews.com/rss/terkini.xml">Kalteng</a>
    <a href="/berita/123/judul">bukan feed</a><a href="https://facebook.com/antaranews/rss.xml">luar situs</a></body></html>`;
  const found = R.discoverFeeds(dir, 'https://www.antaranews.com/rss');
  assert.ok(found.includes('https://www.antaranews.com/rss/terkini.xml'));
  assert.ok(found.includes('https://www.antaranews.com/rss/ekonomi-bisnis.xml'));
  assert.ok(found.includes('https://kalteng.antaranews.com/rss/terkini.xml'), 'subdomain situs yang sama ikut');
  assert.ok(!found.some((u) => u.includes('/berita/') || u.includes('facebook')));
  assert.equal(found.length, 6);
  assert.ok(R.looksLikeFeed('<?xml version="1.0"?>\n<rss version="2.0">'));
  assert.ok(!R.looksLikeFeed('<!doctype html><html>'));
  assert.ok(R.DEFAULT_DIRECTORIES.includes('https://kalteng.antaranews.com/rss'));
  assert.ok(R.DEFAULT_DIRECTORIES.filter((d) => d.includes('antaranews.com')).length >= 30, 'semua situs Antara daerah');
  const sf = R.searchFeedUrls([{ keywords: ['Asmin Bara Bronang'] }]);
  assert.ok(sf.includes('https://www.marketeers.com/?s=Asmin%20Bara%20Bronang&feed=rss2'));

  const realFetch = globalThis.fetch;
  const now = new Date();
  const d = (n: number) => new Date(now.getTime() - n * 86400000).toUTCString();
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    if (u.endsWith('/rss/ekonomi.xml'))
      return new Response(`<?xml version="1.0"?><rss><channel><title>Antara Ekonomi</title>
        <item><title>PT Asmin Bara Bronang salurkan beasiswa</title><link>https://www.antaranews.com/berita/1</link><pubDate>${d(2)}</pubDate><description>Kabupaten Kapuas</description></item>
        <item><title>Harga cabai naik</title><link>https://www.antaranews.com/berita/2</link><pubDate>${d(1)}</pubDate></item>
        <item><title>Asmin Bara Bronang lama sekali</title><link>https://www.antaranews.com/berita/3</link><pubDate>${d(400)}</pubDate></item>
      </channel></rss>`, { status: 200 });
    if (u.endsWith('/rss/terkini.xml'))
      return new Response(`<rss><channel><item><title>PT Asmin Bara Bronang salurkan beasiswa</title><link>https://www.antaranews.com/berita/1</link><pubDate>${d(2)}</pubDate></item></channel></rss>`, { status: 200 });
    if (u.includes('marketeers')) return new Response(`<rss><channel><item><title>Sungai tercemar di sekitar konsesi Asmin Bara Bronang</title><link>https://www.mongabay.co.id/2026/x</link><pubDate>${d(20)}</pubDate></item></channel></rss>`, { status: 200 });
    return new Response('<html>bukan feed</html>', { status: 200 });
  }) as any;
  const r = await R.readFeeds(['https://www.antaranews.com/rss/ekonomi.xml', 'https://www.antaranews.com/rss/terkini.xml', 'https://x.id/html', ...sf.slice(0, 1)], [{ keywords: ['Asmin Bara Bronang'] }], new Date(now.getTime() - 90 * 86400000).toISOString(), now.toISOString());
  assert.equal(r.stats.read, 3);
  assert.equal(r.stats.failed, 1, 'halaman HTML bukan feed');
  assert.deepEqual(r.items.map((i) => i.url).sort(), ['https://www.antaranews.com/berita/1', 'https://www.mongabay.co.id/2026/x']);
  assert.equal(r.items[0].source, 'rss');
  // endpoint /api/rss
  const { default: h } = await import('../api/rss');
  const res = mockRes();
  await h(mockReq({ feeds: ['https://www.antaranews.com/rss/ekonomi.xml'], search: true, queries: [{ keywords: ['Asmin Bara Bronang'] }], from: new Date(now.getTime() - 90 * 86400000).toISOString(), to: now.toISOString() }), res);
  const j = JSON.parse(res.body);
  assert.equal(j.items.length, 2);
  assert.ok(j.stats.feeds > 10, 'feed pencarian ikut');
  globalThis.fetch = realFetch;
});

await test('Google News maksimal: per kata kunci, 3 edisi, jendela jenuh dipecah sampai harian', async () => {
  const { googleNews } = await import('../api/_lib/news');
  const realFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = (async (url: any) => {
    const u = decodeURIComponent(String(url));
    urls.push(u);
    const m = u.match(/after:(\d{4}-\d{2}-\d{2}) before:(\d{4}-\d{2}-\d{2})/)!;
    const days = (new Date(m[2]).getTime() - new Date(m[1]).getTime()) / 86400000;
    // Edisi Indonesia "Turangga": 40 berita per hari → jendela > 2 hari jenuh (dibatasi 100)
    const ed = u.includes('ceid=ID:id') && u.includes('Turangga') ? 'id' : 'x';
    const n = ed === 'id' ? Math.min(100, Math.round(days * 40)) : 3;
    const items = Array.from({ length: n }, (_, i) => `<item><title>Berita ${m[1]} ${i} ${ed}</title><link>https://news.google.com/rss/articles/${m[1]}${i}${ed}${u.length}</link><guid>${m[1]}-${i}-${ed}-${u.includes('ID:en') ? 'en' : u.includes('US:en') ? 'us' : 'id'}</guid><pubDate>${new Date(m[1]).toUTCString()}</pubDate><source url="https://antaranews.com">Antara</source></item>`).join('');
    return new Response(`<rss><channel>${items}</channel></rss>`, { status: 200 });
  }) as any;
  const to = new Date('2026-10-14T00:00:00Z');
  const from = new Date('2026-09-30T00:00:00Z');
  const g = await googleNews({ keywords: ['Turangga', 'Asmin Bara Bronang'], context: ['batubara'] }, from.toISOString(), to.toISOString(), { budget: 200 });
  assert.equal(g.stats.queries, 2, 'tiap kata kunci dicari terpisah');
  assert.ok(urls.some((u) => u.includes('ceid=US:en')) && urls.some((u) => u.includes('ceid=ID:en')));
  assert.ok(g.stats.split >= 4, `jendela jenuh dipecah (${g.stats.split})`);
  // 14 hari × 40/hari = 560 berita edisi Indonesia; tanpa pemecahan hanya 200 (2 minggu × 100)
  const idItems = g.items.filter((i) => i.title.endsWith(' id'));
  assert.ok(idItems.length >= 500, `cakupan penuh (${idItems.length})`);
  globalThis.fetch = realFetch;
});

await test('RSS katalog: ratusan situs, penemuan per situs (beranda, /rss, direktori bertingkat, pola umum)', async () => {
  const R = await import('../api/_lib/rss');
  const info = R.discoveryInfo();
  assert.ok(info.known.length >= 400, `feed pasti ${info.known.length}`);
  assert.ok(info.sites >= 180, `situs ${info.sites}`);
  assert.ok(info.known.some((u) => u === 'https://kalteng.tribunnews.com/rss'));
  assert.ok(info.known.some((u) => u.startsWith('https://sindikasi.okezone.com/')));
  assert.ok(info.known.some((u) => u === 'https://rss.tempo.co/bisnis'));
  const realFetch = globalThis.fetch;
  const html = (b: string) => new Response(`<html><head>${b}</head><body></body></html>`, { status: 200 });
  const feed = new Response('<?xml version="1.0"?><rss><channel></channel></rss>', { status: 200 });
  globalThis.fetch = (async (url: any) => {
    const u = String(url);
    // situs A: beranda punya <link alternate> + tautan footer ke halaman direktori RSS
    if (u === 'https://media-a.id/') return html('<link rel="alternate" type="application/rss+xml" href="/feed/"><a href="/rss-feed">RSS</a>');
    if (u === 'https://media-a.id/rss-feed') return html('<a href="/rss/nasional.xml">n</a><a href="/rss/daerah.xml">d</a><a href="/rss/ekonomi.xml">e</a>');
    // situs B: tidak ada tautan sama sekali, tapi /index.xml adalah feed
    if (u === 'https://media-b.id/index.xml') return feed.clone();
    if (u.startsWith('https://media-b.id')) return html('');
    return new Response('x', { status: 404 });
  }) as any;
  const a = await R.discoverEntry('media-a.id');
  assert.deepEqual(a.feeds.sort(), ['https://media-a.id/feed/', 'https://media-a.id/rss/daerah.xml', 'https://media-a.id/rss/ekonomi.xml', 'https://media-a.id/rss/nasional.xml']);
  const b = await R.discoverEntry('media-b.id');
  assert.deepEqual(b.feeds, ['https://media-b.id/index.xml']);
  const c = await R.discoverEntry('mati.id');
  assert.equal(c.reachable, false);
  globalThis.fetch = realFetch;
});

console.log(`\n${n} test lulus${process.exitCode ? ' (ADA YANG GAGAL)' : ''}`);
