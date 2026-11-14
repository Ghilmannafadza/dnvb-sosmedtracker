// Narasi otomatis gaya laporan sentimen brand DNVB Sosmed Tracker.
import type { Agg } from './aggregate';
import { pct1 } from './format';

export interface EntityStat {
  short: string;
  name: string;
  agg: Agg;
}

const unit = (channel: 'all' | 'news' | 'social') => (channel === 'social' ? 'unggahan' : channel === 'news' ? 'berita' : 'sebutan');

export function entitySentence(e: EntityStat, channel: 'all' | 'news' | 'social' = 'all') {
  const u = unit(channel);
  const { positive, negative } = e.agg.sent;
  const base = positive + negative;
  if (!e.agg.total) return `${e.short}: Belum ada ${u} pada periode ini.`;
  if (!base) return `${e.short}: Seluruh ${e.agg.total} ${u} bersentimen netral; tidak ada sentimen positif maupun negatif.`;
  const pp = (positive / base) * 100;
  const np = (negative / base) * 100;
  if (negative === 0) return `${e.short}: 100% sentimen positif (${positive} dari ${base} ${u}). Tidak ada sentimen negatif sama sekali.`;
  if (positive === 0) return `${e.short}: Seluruh ${u} berpolaritas negatif (${negative} dari ${base} ${u}). Perlu respons dan klarifikasi segera.`;
  if (pp >= 90)
    return `${e.short}: Didominasi oleh ${pct1(pp)} sentimen positif (${positive} dari ${base} ${u}), dengan rasio negatif yang sangat kecil yaitu ${pct1(np)} (${negative} ${u} dari ${base} ${u}).`;
  if (pp >= 50) {
    const lvl = np >= 30 ? 'cukup signifikan' : np >= 15 ? 'moderat' : 'relatif kecil';
    return `${e.short}: Rasio sentimen positif berada di angka ${pct1(pp)} (${positive} dari ${base} ${u}), namun memiliki eksposur sentimen negatif yang ${lvl} di angka ${pct1(np)} (${negative} dari ${base} ${u}).`;
  }
  return `${e.short}: Sentimen negatif mendominasi dengan ${pct1(np)} (${negative} dari ${base} ${u}), sementara sentimen positif hanya ${pct1(pp)} (${positive} ${u}). Brand ini memerlukan perhatian prioritas.`;
}

export function groupNarrative(entities: EntityStat[], groupName: string, channel: 'all' | 'news' | 'social' = 'all') {
  const u = unit(channel);
  const lines = entities.map((e) => entitySentence(e, channel));
  const pos = entities.reduce((a, e) => a + e.agg.sent.positive, 0);
  const neg = entities.reduce((a, e) => a + e.agg.sent.negative, 0);
  const base = pos + neg;
  if (base) {
    const pp = (pos / base) * 100;
    lines.push(
      `Secara keseluruhan (${groupName}), sentimen percakapan menunjukkan ${pp >= 50 ? 'didominasi' : 'tertekan'} oleh ${pct1(pp >= 50 ? pp : 100 - pp)} ${u} ${pp >= 50 ? 'positif' : 'negatif'} (${pp >= 50 ? pos : neg} ${u}), berbanding ${pct1(pp >= 50 ? 100 - pp : pp)} ${u} ${pp >= 50 ? 'negatif' : 'positif'} (${pp >= 50 ? neg : pos} ${u}).`,
    );
  }
  const worst = [...entities].filter((e) => e.agg.sent.negative > 0).sort((a, b) => b.agg.polarity.negativePct - a.agg.polarity.negativePct)[0];
  if (worst) {
    const iss = [...worst.agg.issues].sort((a, b) => b.negative - a.negative)[0];
    if (iss?.negative)
      lines.push(`Fokus mitigasi: ${worst.short}, isu "${iss.name}" menyumbang ${iss.negative} ${u} negatif.`);
  }
  return lines;
}
