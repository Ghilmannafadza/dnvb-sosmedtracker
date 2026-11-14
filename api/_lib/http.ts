import type { IncomingMessage, ServerResponse } from 'node:http';

export type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> };
export type Res = ServerResponse;

export async function readJson<T = any>(req: Req): Promise<T> {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') return JSON.parse(req.body) as T;
    if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8')) as T;
    return req.body as T;
  }
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return (raw ? JSON.parse(raw) : {}) as T;
}

export function send(res: Res, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

export function methodGuard(req: Req, res: Res, method: 'GET' | 'POST') {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return false;
  }
  if (req.method !== method) {
    send(res, 405, { error: `Gunakan ${method}` });
    return false;
  }
  return true;
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';

export async function fetchText(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  try {
    const r = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8', ...(init.headers || {}) },
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status} dari ${new URL(url).host}: ${text.slice(0, 160)}`);
    return text;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson<T = any>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const text = await fetchText(url, init);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Respon bukan JSON dari ${new URL(url).host}: ${text.slice(0, 160)}`);
  }
}

export function hashId(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function stripHtml(s = '') {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export function toIso(d: unknown): string {
  if (d === undefined || d === null || d === '') return new Date().toISOString();
  if (typeof d === 'number') return new Date(d < 1e12 ? d * 1000 : d).toISOString();
  const s = String(d);
  // GDELT: 20260713T070000Z
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})(\d{2})(\d{2})Z?$/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`).toISOString();
  if (/^\d+$/.test(s)) return toIso(Number(s));
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

export function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').replace(/^m\./, '');
  } catch {
    return '';
  }
}
