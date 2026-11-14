import { useState } from 'react';
import type { Topic } from '../lib/presets';

/**
 * Logo brand. Brand DNVB memakai logo resmi dari dnvbindonesia.com (public/dnvb/logo.png).
 * Brand lain: URL logo dari formulir brand, atau monogram berwarna bila kosong / gagal dimuat.
 */
export function EntityLogo({ topic, size = 28, active = false }: { topic: Pick<Topic, 'logo' | 'short' | 'name' | 'kind' | 'color' | 'id'>; size?: number; active?: boolean }) {
  const [broken, setBroken] = useState(false);
  const src = topic.logo || (topic.id === 'dnvb' ? '/dnvb/logo.png' : '');
  if (!src || broken)
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white"
        style={{ width: size, height: size, background: topic.color || '#101820', fontSize: Math.max(9, size * 0.32) }}
        aria-hidden
      >
        {(topic.short || topic.name || '?').slice(0, size >= 36 ? 4 : 2).toUpperCase()}
      </span>
    );
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${active ? 'ring-2 ring-primary' : 'ring-1 ring-line'}`}
      style={{ width: size, height: size }}
    >
      <img src={src} alt={`Logo ${topic.name}`} onError={() => setBroken(true)} className="h-full w-full object-contain" style={{ padding: size * 0.14 }} loading="lazy" />
    </span>
  );
}
