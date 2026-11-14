// Exa (pencarian web semantik) dan Jina Reader (baca halaman apa pun), dua jalur nol-konfigurasi
// Agent Reach yang juga jalan di Vercel.
// - Tanpa kunci: Exa lewat server MCP publik (https://mcp.exa.ai/mcp, tool web_search_exa).
// - Dengan EXA_API_KEY: REST API Exa (bisa dibatasi domain dan tanggal, isi teks ikut diambil).
import { fetchText } from './http.js';

export const exaMode = (): 'api' | 'mcp' | 'off' => (process.env.REACH_EXA === '0' ? 'off' : process.env.EXA_API_KEY ? 'api' : 'mcp');

export interface ExaResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  image?: string;
}

const MCP_URL = () => process.env.EXA_MCP_URL || 'https://mcp.exa.ai/mcp';
let session: string | null = null;

/** Balasan MCP bisa JSON biasa atau SSE ("event: message\ndata: {...}") */
export function parseMcpBody(text: string): any {
  const t = text.trim();
  if (t.startsWith('{')) return JSON.parse(t);
  const datas = t
    .split(/\r?\n/)
    .filter((l) => l.startsWith('data:'))
    .map((l) => l.slice(5).trim())
    .filter(Boolean);
  for (const d of datas.reverse()) {
    try {
      const j = JSON.parse(d);
      if (j.result || j.error) return j;
    } catch {
      /* lanjut */
    }
  }
  throw new Error('Balasan MCP tidak terbaca');
}

async function mcpPost(body: object, timeoutMs = 25000) {
  const r = await fetch(MCP_URL(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(session ? { 'Mcp-Session-Id': session } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const sid = r.headers.get('mcp-session-id');
  if (sid) session = sid;
  const text = await r.text();
  if (!r.ok && !text.trim()) throw new Error(`Exa MCP HTTP ${r.status}`);
  return { status: r.status, json: text.trim() ? parseMcpBody(text) : {} };
}

async function mcpInit() {
  session = null;
  await mcpPost({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'sosmedtracker', version: '2.10' } } });
  await mcpPost({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => null);
}

/** Hasil tool Exa: teks JSON ({results:[...]}) atau teks berformat "Title: ...\nURL: ..." */
export function parseExaText(text: string): ExaResult[] {
  const t = text.trim();
  if (/^[{[]/.test(t)) {
    try {
      const j = JSON.parse(t);
      const rows: any[] = Array.isArray(j) ? j : j.results || j.data || [];
      return rows
        .map((r) => ({ title: r.title || '', url: r.url || r.id || '', publishedDate: r.publishedDate || r.published, author: r.author, text: r.text || r.summary || (r.highlights || []).join(' '), image: r.image }))
        .filter((r) => r.url);
    } catch {
      /* format teks */
    }
  }
  const blocks = t.split(/\n(?=\s*(?:\[\d+\]\s*)?Title:)/i);
  const out: ExaResult[] = [];
  for (const b of blocks) {
    const get = (k: string) => b.match(new RegExp(`^\\s*(?:\\[\\d+\\]\\s*)?${k}:\\s*(.*)$`, 'im'))?.[1]?.trim();
    const url = get('URL');
    if (!url) continue;
    const textPart = b.match(/^\s*(?:Text|Highlights|Summary|Content):\s*([\s\S]*)$/im)?.[1]?.trim();
    out.push({ title: get('Title') || '', url, publishedDate: get('Published(?: Date)?'), author: get('Author'), text: textPart, image: get('Image') });
  }
  return out;
}

export async function exaSearch(
  query: string,
  opts: { num?: number; domains?: string[]; from?: string; to?: string; dateWindow?: boolean; location?: string } = {},
): Promise<ExaResult[]> {
  const mode = exaMode();
  if (mode === 'off') throw new Error('Exa dimatikan (REACH_EXA=0)');
  const num = Math.min(opts.num ?? 10, 100);
  if (mode === 'api') {
    // Mengikuti panduan build-with-exa: query + type auto + contents.highlights; parameter lain hanya
    // bila tugasnya menuntut. Di sini: includeDomains = daftar platform per sumber (X, Facebook, ...),
    // tanggal = periode pantauan yang dipilih analis (hanya untuk sumber berita, karena filter
    // tanggal membuang halaman tanpa tanggal seperti banyak unggahan media sosial),
    // userLocation ID = pemantauan media Indonesia, numResults = jumlah per istilah yang diputuskan.
    const body: Record<string, unknown> = { query, type: 'auto', contents: { highlights: true } };
    if (opts.num) body.numResults = num;
    if (opts.domains?.length) body.includeDomains = opts.domains;
    if (opts.dateWindow && opts.from) body.startPublishedDate = new Date(opts.from).toISOString();
    if (opts.dateWindow && opts.to) body.endPublishedDate = new Date(opts.to).toISOString();
    if (opts.location) body.userLocation = opts.location;
    const r = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.EXA_API_KEY! },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Exa ${r.status}: ${j?.error || j?.message || ''}`);
    return (j.results || []).map((x: any) => ({
      title: x.title || '',
      url: x.url,
      publishedDate: x.publishedDate,
      author: x.author,
      text: Array.isArray(x.highlights) ? x.highlights.join(' … ') : x.text,
      image: x.image,
    }));
  }
  // MCP publik: batasi domain lewat kata kunci, lalu saring hasilnya
  const q = opts.domains?.length ? `${query} site:${opts.domains[0]}` : query;
  const call = () => mcpPost({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name: 'web_search_exa', arguments: { query: q, numResults: num } } });
  let res = await call().catch(() => null);
  if (!res || res.status >= 400 || res.json?.error) {
    await mcpInit();
    res = await call();
  }
  if (res.json?.error) throw new Error(`Exa MCP: ${res.json.error.message || 'gagal'}`);
  const content: any[] = res.json?.result?.content || [];
  if (res.json?.result?.isError) throw new Error(`Exa MCP: ${content.map((c) => c.text).join(' ').slice(0, 160)}`);
  const all = content.filter((c) => c.type === 'text').flatMap((c) => parseExaText(c.text || ''));
  return opts.domains?.length ? all.filter((r) => opts.domains!.some((d) => hostOf(r.url).endsWith(d))) : all;
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/* --------------------------------- Jina Reader --------------------------------- */

/** Baca halaman lewat r.jina.ai (merender JS, menembus sebagian blokir). Mengembalikan teks polos. */
export async function jinaRead(url: string, timeoutMs = 15000): Promise<{ title: string; text: string; image?: string } | null> {
  if (process.env.REACH_JINA === '0') return null;
  try {
    const raw = await fetchText(`https://r.jina.ai/${url}`, {
      timeoutMs,
      headers: { Accept: 'text/plain', 'X-With-Images-Summary': 'true', ...(process.env.JINA_API_KEY ? { Authorization: `Bearer ${process.env.JINA_API_KEY}` } : {}) },
    });
    return parseJina(raw);
  } catch {
    return null;
  }
}

export function parseJina(raw: string) {
  const title = raw.match(/^Title:\s*(.*)$/m)?.[1]?.trim() || '';
  const md = raw.split(/^Markdown Content:\s*$/m)[1] ?? raw;
  const image = md.match(/!\[[^\]]*\]\((https?:[^)\s]+)\)/)?.[1];
  const text = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/[*_`>|]+/g, ' ')
    .replace(/^\s*[-=]{3,}\s*$/gm, '')
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 40 && !/^(baca juga|advertisement|iklan|share|bagikan)/i.test(l))
    .join('\n');
  return { title, text, image };
}
