// Unduh ikon pelengkap dari The Noun Project untuk sumber yang tidak punya logo di simple-icons.
// Jalankan di laptop (butuh akses internet):
//   set NOUN_KEY=xxxx && set NOUN_SECRET=yyyy && npm run icons        (Windows CMD)
//   NOUN_KEY=xxxx NOUN_SECRET=yyyy npm run icons                      (macOS/Linux)
// Kunci TIDAK disimpan di repo. Hasil ditulis ke src/assets/noun-icons.json (PNG base64 + atribusi CC BY).
import crypto from 'node:crypto';
import fs from 'node:fs';

const KEY = process.env.NOUN_KEY;
const SECRET = process.env.NOUN_SECRET;
if (!KEY || !SECRET) {
  console.error('Isi NOUN_KEY dan NOUN_SECRET (API key & secret The Noun Project).');
  process.exit(1);
}
const WANT = { bingnews: 'bing', gdelt: 'global news' };
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

async function signedGet(url, params) {
  const o = { oauth_consumer_key: KEY, oauth_nonce: crypto.randomBytes(12).toString('hex'), oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_version: '1.0' };
  const all = { ...params, ...o };
  const qs = Object.keys(all).sort().map((k) => `${enc(k)}=${enc(all[k])}`).join('&');
  const base = ['GET', enc(url), enc(qs)].join('&');
  o.oauth_signature = crypto.createHmac('sha1', `${enc(SECRET)}&`).update(base).digest('base64');
  const auth = 'OAuth ' + Object.entries(o).map(([k, v]) => `${k}="${enc(v)}"`).join(', ');
  const r = await fetch(`${url}?${new URLSearchParams(params)}`, { headers: { Authorization: auth } });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

const out = {};
for (const [source, query] of Object.entries(WANT)) {
  try {
    const j = await signedGet('https://api.thenounproject.com/v2/icon', { query, limit: '1', thumbnail_size: '84', include_svg: '0' });
    const ic = j.icons?.[0];
    if (!ic?.thumbnail_url) throw new Error('tidak ada hasil');
    const png = Buffer.from(await (await fetch(ic.thumbnail_url)).arrayBuffer()).toString('base64');
    out[source] = { id: String(ic.id), png: `data:image/png;base64,${png}`, attribution: ic.attribution || `${ic.term} oleh ${ic.creator?.name || 'Noun Project'}` };
    console.log(`✓ ${source}: ${out[source].attribution}`);
  } catch (e) {
    console.warn(`× ${source}: ${e.message}`);
  }
}
fs.writeFileSync(new URL('../src/assets/noun-icons.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('Selesai: src/assets/noun-icons.json');
