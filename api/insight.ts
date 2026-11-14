// POST /api/insight: ringkasan eksekutif, temuan, isu utama, risiko, rekomendasi, peta pemangku kepentingan.
import type { Insight, InsightRequest, Sentiment } from '../shared/types.js';
import { geminiJson, hasGemini } from './_lib/gemini.js';
import { methodGuard, readJson, send, type Req, type Res } from './_lib/http.js';

export const config = { maxDuration: 60 };

const SENT = { type: 'STRING', enum: ['positive', 'neutral', 'negative'] };
const schema = {
  type: 'OBJECT',
  properties: {
    executiveSummary: { type: 'STRING' },
    keyFindings: { type: 'ARRAY', items: { type: 'STRING' } },
    mainIssues: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { issue: { type: 'STRING' }, description: { type: 'STRING' }, sentiment: SENT },
        required: ['issue', 'description', 'sentiment'],
      },
    },
    risks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          level: { type: 'STRING', enum: ['tinggi', 'sedang', 'rendah'] },
          description: { type: 'STRING' },
        },
        required: ['title', 'level', 'description'],
      },
    },
    recommendations: { type: 'ARRAY', items: { type: 'STRING' } },
    stakeholders: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, position: { type: 'STRING' }, note: { type: 'STRING' } },
        required: ['name', 'position', 'note'],
      },
    },
  },
  required: ['executiveSummary', 'keyFindings', 'mainIssues', 'risks', 'recommendations', 'stakeholders'],
};

const tgl = (s: string) => {
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
};

const pct = (a: number, b: number) => (b ? ((a / b) * 100).toFixed(1).replace('.', ',') : '0');

export function templateInsight(r: InsightRequest): Insight {
  const s = r.stats;
  const net = s.total ? Math.round(((s.positive - s.negative) / s.total) * 100) : 0;
  const tone = net >= 30 ? 'cenderung positif' : net <= -10 ? 'cenderung negatif' : 'relatif berimbang';
  const negIssues = [...s.topIssues].sort((a, b) => b.negative - a.negative).filter((i) => i.negative > 0);
  const peak = s.peakDays[0];
  const findings = [
    `Total ${s.total} sebutan: ${s.news} dari media online dan ${s.social} dari media sosial.`,
    `Sentimen positif ${pct(s.positive, s.total)}% (${s.positive}), netral ${pct(s.neutral, s.total)}% (${s.neutral}), negatif ${pct(s.negative, s.total)}% (${s.negative}).`,
  ];
  if (s.topIssues[0]) findings.push(`Isu paling banyak dibicarakan: ${s.topIssues[0].issue} (${s.topIssues[0].count} sebutan).`);
  if (negIssues[0]) findings.push(`Kontributor sentimen negatif terbesar: ${negIssues[0].issue} (${negIssues[0].negative} sebutan negatif).`);
  if (s.topOutlets[0]) findings.push(`Akun/media paling aktif: ${s.topOutlets.slice(0, 3).map((o) => `${o.outlet} (${o.count})`).join(', ')}.`);
  if (peak) findings.push(`Puncak percakapan pada ${tgl(peak.date)} dengan ${peak.count} sebutan.`);
  if (s.topPersons[0]) findings.push(`Tokoh paling sering disebut: ${s.topPersons.slice(0, 3).map((p) => p.name).join(', ')}.`);

  const risks: Insight['risks'] = negIssues.slice(0, 4).map((i) => {
    const ratio = i.count ? i.negative / i.count : 0;
    return {
      title: i.issue,
      level: (ratio > 0.5 && i.negative >= 3 ? 'tinggi' : ratio > 0.25 ? 'sedang' : 'rendah') as Insight['risks'][number]['level'],
      description: `${i.negative} dari ${i.count} sebutan bernada negatif (${pct(i.negative, i.count)}%).`,
    };
  });

  const recs = [
    negIssues[0]
      ? `Siapkan holding statement dan klarifikasi berbasis data untuk isu ${negIssues[0].issue}.`
      : 'Pertahankan ritme konten dan respons komunitas yang sudah berjalan baik.',
    'Amplifikasi percakapan positif: repost testimoni, gandeng kreator yang sudah membicarakan brand secara organik.',
    'Tindak lanjuti akun dan media yang paling sering membawa sentimen negatif: balas, klarifikasi, atau ajak diskusi.',
    'Aktifkan peringatan dini: pantau harian lonjakan sebutan negatif dan balas komentar/keluhan dalam 24 jam.',
  ];

  const sentOf = (pos: number, neg: number): Sentiment => (neg > pos ? 'negative' : pos > neg ? 'positive' : 'neutral');
  return {
    executiveSummary: `Selama ${tgl(r.period.from)} sampai ${tgl(r.period.to)}, percakapan tentang ${r.topic} ${tone} (net sentiment ${net > 0 ? '+' : ''}${net}). ${
      negIssues[0] ? `Perhatian utama ada pada isu ${negIssues[0].issue}.` : 'Tidak ditemukan isu negatif yang menonjol.'
    }`,
    keyFindings: findings,
    mainIssues: s.topIssues.slice(0, 5).map((i) => ({
      issue: i.issue,
      description: `${i.count} sebutan, ${i.negative} negatif.`,
      sentiment: i.negative / Math.max(1, i.count) > 0.4 ? 'negative' : 'neutral',
    })),
    risks,
    recommendations: recs,
    stakeholders: s.topPersons.slice(0, 6).map((p) => ({
      name: p.name,
      position: p.role || '-',
      note: `Disebut ${p.count}x (${p.positive} positif, ${p.negative} negatif), ${sentOf(p.positive, p.negative) === 'negative' ? 'perlu pendekatan' : 'potensi pendukung'}.`,
    })),
    engine: 'template',
    generatedAt: new Date().toISOString(),
  };
}

export default async function handler(req: Req, res: Res) {
  if (!methodGuard(req, res, 'POST')) return;
  let body: InsightRequest;
  try {
    body = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Body JSON tidak valid' });
  }
  if (!hasGemini() || !body.stats?.total) return send(res, 200, templateInsight(body));

  const p = `Anda adalah strategist social listening & brand reputation di DNVB Indonesia.
Buat analisis sentimen percakapan media sosial (Instagram, TikTok, Threads, YouTube) dan media web (Bahasa Indonesia formal, ringkas, tajam, berbasis data, jangan mengarang fakta di luar data, jangan gunakan karakter em dash).

Brand: ${body.topic}
${body.context ? 'Konteks: ' + body.context : ''}
Periode: ${body.period.from} s.d. ${body.period.to}
Statistik: ${JSON.stringify(body.stats)}
Contoh judul (maks 60) beserta sentimen & isu:
${body.headlines.slice(0, 60).map((h) => `- [${h.date}] [${h.sentiment}] [${h.issue}] ${h.title} (${h.outlet})`).join('\n')}

Hasilkan:
- executiveSummary: 3-5 kalimat untuk pimpinan brand / klien.
- keyFindings: 5-7 temuan kunci dengan angka (persentase memakai koma desimal, mis. 61,4%).
- mainIssues: 3-6 isu utama (nama isu spesifik, deskripsi 1-2 kalimat, sentimen dominan).
- risks: 2-5 risiko reputasi brand (keluhan berulang, potensi viral negatif, krisis) dengan level tinggi/sedang/rendah.
- recommendations: 4-6 rekomendasi aksi konkret (konten, respons admin/CS, kolaborasi kreator, klarifikasi, amplifikasi).
- stakeholders: tokoh/kreator/akun kunci dari data (nama, peran, catatan sikap terhadap brand).`;
  try {
    const out = await geminiJson<Omit<Insight, 'engine' | 'generatedAt'>>(p, schema, { temperature: 0.35 });
    return send(res, 200, { ...out, engine: 'gemini', generatedAt: new Date().toISOString() } satisfies Insight);
  } catch (e: any) {
    return send(res, 200, { ...templateInsight(body), error: String(e?.message || e) });
  }
}
