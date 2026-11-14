import type { ViewItem } from './aggregate';
import { SENT_LABEL } from './format';

const esc = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}

export function exportCsv(name: string, items: ViewItem[]) {
  const head = [
    'Tanggal', 'Kanal', 'Sumber', 'Media/Platform', 'Tier', 'Judul/Teks', 'Ringkasan', 'Penulis', 'URL', 'Sentimen', 'Skor',
    'Alasan', 'Kategori Isu', 'Sub Isu', 'Tokoh', 'Organisasi', 'Lokasi', 'Views', 'Likes', 'Komentar', 'Share', 'Mesin',
  ];
  const rows = items.map((i) => [
    i.publishedAt.slice(0, 16).replace('T', ' '),
    i.channel === 'news' ? 'Media web' : 'Media Sosial',
    i.source,
    i.outlet,
    i.channel === 'news' ? i.tier : '',
    i.title,
    i.snippet,
    i.author,
    i.url,
    SENT_LABEL[i.sentiment],
    i.a?.score,
    i.a?.reason,
    i.a?.issue,
    i.a?.subIssue,
    (i.a?.persons || []).map((p) => `${p.name}${p.role ? ' (' + p.role + ')' : ''}`).join('; '),
    (i.a?.organizations || []).join('; '),
    (i.a?.locations || []).join('; '),
    i.engagement?.views,
    i.engagement?.likes,
    i.engagement?.comments,
    i.engagement?.shares,
    i.a?.engine,
  ]);
  const csv = '﻿' + [head, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  download(`${name}.csv`, csv, 'text/csv;charset=utf-8');
}

export function exportJson(name: string, data: unknown) {
  download(`${name}.json`, JSON.stringify(data, null, 2), 'application/json');
}

export const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
