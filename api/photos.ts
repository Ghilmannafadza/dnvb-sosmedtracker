// GET  /api/photos            daftar foto tokoh yang tersimpan permanen (Vercel Blob)
// POST /api/photos { persons: [{ name, role, org, candidates }] } (maks 3 per panggilan)
//      cari, verifikasi, dan simpan foto tokoh. Tanpa Blob, foto dikembalikan sebagai data URL
//      dan disimpan di browser (IndexedDB).
import { blobEnabled, listStored, resolvePerson, type PersonReq } from './_lib/photos.js';
import { readJson, send, type Req, type Res } from './_lib/http.js';

export const config = { maxDuration: 60 };

export default async function handler(req: Req, res: Res) {
  if (req.method === 'GET') {
    try {
      return send(res, 200, { store: blobEnabled() ? 'blob' : 'browser', photos: await listStored() });
    } catch (e) {
      return send(res, 200, { store: blobEnabled() ? 'blob' : 'browser', photos: [], error: String((e as Error).message) });
    }
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'Gunakan GET atau POST' });
  let b: { persons?: PersonReq[]; search?: boolean; exclude?: string[] };
  try {
    b = await readJson(req);
  } catch {
    return send(res, 400, { error: 'Body JSON tidak valid' });
  }
  const persons = (b.persons || []).filter((p) => p?.name?.trim()).slice(0, 3);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => (timer = setTimeout(() => r(null), 50000)));
  const results = await Promise.all(
    persons.map(async (p) => {
      const r = await Promise.race([
        resolvePerson(p, { search: b.search, exclude: (b.exclude || []).slice(0, 10) }).catch((e) => ({ key: '', name: p.name, tried: [String((e as Error).message)] })),
        timeout,
      ]);
      return r || { key: '', name: p.name, tried: ['waktu habis'] };
    }),
  );
  clearTimeout(timer);
  send(res, 200, { store: blobEnabled() ? 'blob' : 'browser', results });
}
