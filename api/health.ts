// GET /api/health: status konektor & mesin AI (tanpa membocorkan nilai kunci)
import { SOURCE_META, type HealthResponse, type SourceKey } from '../shared/types.js';
import { backendStatus, hasReach, reachSummary } from './_lib/reach.js';
import { aiProvider, geminiModel, hasEmbeddings, hasVision, sumoEmbedModel } from './_lib/gemini.js';
import { blobEnabled } from './_lib/photos.js';
import { send, type Req, type Res } from './_lib/http.js';

export default function handler(_req: Req, res: Res) {
  const sources = {} as HealthResponse['sources'];
  (Object.keys(SOURCE_META) as SourceKey[]).forEach((k) => {
    if (hasReach(k)) {
      const backends = backendStatus(k);
      const active = backends.find((b) => b.available);
      sources[k] = { enabled: Boolean(active), active: active?.label, backends, reason: active ? undefined : backends.map((b) => b.reason).filter(Boolean).join('; ') };
      return;
    }
    const need = SOURCE_META[k].needsKey;
    const enabled = !need || Boolean(process.env[need]);
    sources[k] = { enabled, reason: enabled ? undefined : `Isi ${need} di environment variables` };
  });
  const out: HealthResponse = {
    ai: aiProvider() === 'lexicon' ? { provider: 'lexicon' } : { provider: aiProvider(), model: geminiModel(), embedModel: hasEmbeddings() ? sumoEmbedModel() : undefined },
    sources,
    reach: reachSummary(),
    photos: { store: blobEnabled() ? 'blob' : 'browser', vision: hasVision() },
    version: '4.0.0',
  };
  send(res, 200, out);
}
