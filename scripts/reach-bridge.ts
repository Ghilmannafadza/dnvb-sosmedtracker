// Jembatan Agent Reach untuk deploy Vercel: jalankan di laptop yang punya CLI & sesi Chrome.
//   npm run reach            (port 8787, ubah dengan REACH_PORT)
// Lalu buka ke internet, mis.: cloudflared tunnel --url http://localhost:8787
// dan isi di Vercel: REACH_BRIDGE_URL=https://xxxx.trycloudflare.com  REACH_BRIDGE_TOKEN=<sama dengan .env.local>
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';

for (const f of ['.env', '.env.local']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
delete process.env.REACH_BRIDGE_URL; // jembatan tidak memanggil jembatan lain

if (!process.env.REACH_BRIDGE_TOKEN) {
  console.error('Isi REACH_BRIDGE_TOKEN di .env.local dulu (string acak panjang), lalu jalankan ulang.');
  process.exit(1);
}

const { default: handler } = await import('../api/reach.ts');
const { reachSummary } = await import('../api/_lib/reach.ts');
const port = Number(process.env.REACH_PORT || 8787);

createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/reach' || path === '/api/reach') return handler(req as any, res);
  res.writeHead(path === '/' ? 200 : 404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(path === '/' ? { name: 'sosmedtracker reach bridge', ...reachSummary() } : { error: 'not found' }));
}).listen(port, () => {
  const s = reachSummary();
  console.log(`Jembatan Agent Reach aktif di http://localhost:${port}`);
  console.log('CLI terdeteksi:', Object.entries(s.bins).map(([k, v]) => `${k}${v ? ' ✓' : ' ✗'}`).join('  '));
});
