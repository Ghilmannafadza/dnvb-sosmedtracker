// /api/reach: jembatan Agent Reach.
//   GET  ?doctor=1  status CLI lokal (+ `agent-reach doctor --json` bila terpasang)
//   POST { source, query, from, to }  jalankan jalur CLI lokal untuk satu sumber
// Dipakai deploy Vercel (REACH_BRIDGE_URL) untuk meminjam CLI & sesi browser di laptop.
// Wajib header Authorization: Bearer REACH_BRIDGE_TOKEN bila token diisi; tanpa token hanya
// menerima permintaan dari localhost.
import { ALL_SOURCE_KEYS, type SourceKey, type TopicQuery } from '../shared/types.js';
import { cliJson, hasBin } from './_lib/cli.js';
import { readJson, send, type Req, type Res } from './_lib/http.js';
import { backendStatus, hasReach, reachSummary, runSource } from './_lib/reach.js';

export const config = { maxDuration: 60 };

function authorized(req: Req) {
  const token = process.env.REACH_BRIDGE_TOKEN;
  const got = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (token) return got === token;
  const ip = String(req.socket?.remoteAddress || '');
  return /^(::1|127\.|::ffff:127\.)/.test(ip) || ip === '';
}

export default async function handler(req: Req, res: Res) {
  if (req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://x');
    const out: any = { ...reachSummary(), sources: Object.fromEntries(ALL_SOURCE_KEYS.filter(hasReach).map((s) => [s, backendStatus(s)])) };
    if (url.searchParams.get('doctor') && authorized(req) && hasBin('agent-reach')) {
      try {
        out.doctor = await cliJson('agent-reach', ['doctor', '--json'], { timeoutMs: 45000 });
      } catch (e) {
        out.doctorError = String((e as Error).message);
      }
    }
    return send(res, 200, out);
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Gunakan GET atau POST' });
  if (!authorized(req)) return send(res, 401, { error: 'Token jembatan salah' });
  let b: { source: SourceKey; query: TopicQuery; from: string; to: string };
  try {
    b = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Body JSON tidak valid' });
  }
  if (!hasReach(b.source) || !b.query?.keywords?.length) return send(res, 400, { error: 'Sumber atau kata kunci tidak valid' });
  try {
    const r = await runSource(b.source, { q: b.query, from: b.from, to: b.to }, { cliOnly: true, deadline: Date.now() + 55000 });
    send(res, 200, r);
  } catch (e) {
    send(res, 200, { items: [], error: String((e as Error).message) });
  }
}
