import { EntityLogo } from '../components/EntityLogo';
import { Pencil, Plus, RotateCcw, Save, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { BLOCKED_DOMAINS, SPAM_PATTERNS } from '../../shared/guardrails';
import { SOURCE_META, type SourceKey, type TopicQuery } from '../../shared/types';
import { nounAttributions, SourceIcon } from '../components/SourceIcon';
import TopicDashboard, { TOPIC_TABS, type TopicTab } from '../components/TopicDashboard';
import { QueryEditor, SourcePicker, TopicForm } from '../components/TopicForm';
import { ArrowButton, Empty, Modal, Panel, Reveal } from '../components/ui';
import { fmtDate, nf } from '../lib/format';
import { ALL_SOURCES, BRAND_KIND_LABEL, PRESET_TOPICS, blankBrand, type Topic } from '../lib/presets';
import { deleteResult, getPref, setPref } from '../lib/store';
import { discoverAllFeeds, rssCacheInfo } from '../lib/pipeline';
import { navigate, useApp } from '../state';

/* --------------------------------- Detail brand --------------------------------- */
export function TopicPage({ id, tab }: { id: string; tab?: string }) {
  const { topics } = useApp();
  const topic = topics.find((t) => t.id === id);
  if (!topic)
    return (
      <Panel>
        <Empty title="Brand tidak ditemukan" action={<button className="btn btn-primary" onClick={() => navigate('/topics')}>Buka daftar brand</button>}>
          Brand mungkin sudah dihapus atau tautannya salah.
        </Empty>
      </Panel>
    );
  const t = (TOPIC_TABS as string[]).includes(tab || '') ? (tab as TopicTab) : 'ringkasan';
  return <TopicDashboard topic={topic} tab={t} onTab={(x) => navigate(`/topic/${id}${x === 'ringkasan' ? '' : '/' + x}`)} />;
}

/* --------------------------------- Cek sentimen cepat --------------------------------- */
const slugId = (s: string) =>
  'adhoc-' +
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

export function IssueSearchPage() {
  const { topics, setTopics, run, results } = useApp();
  const [queries, setQueries] = useState<TopicQuery[]>([{ keywords: [] }]);
  const [name, setName] = useState('');
  const [context, setContext] = useState('');
  const [sources, setSources] = useState<SourceKey[]>(ALL_SOURCES);
  const [active, setActive] = useState<Topic | null>(() => getPref<Topic | null>('lastAdhoc', null));
  const [history, setHistory] = useState<Topic[]>(() => getPref<Topic[]>('adhocHistory', []));

  const start = () => {
    const kws = queries.flatMap((q) => q.keywords);
    if (!kws.length) return;
    const title = name.trim() || kws.slice(0, 3).join(' / ');
    const t: Topic = {
      id: slugId(title),
      name: title,
      short: title.slice(0, 8).toUpperCase(),
      color: '#346BC8',
      context: context || `Kata kunci yang dipantau: ${kws.join(', ')}. Nilai sentimen percakapan warganet dan media terhadap brand, produk, kampanye, atau isu ini.`,
      kind: 'client',
      queries: queries.filter((q) => q.keywords.length),
      sources,
      inGroup: false,
      createdAt: new Date().toISOString(),
    };
    setActive(t);
    setPref('lastAdhoc', t);
    const h = [t, ...history.filter((x) => x.id !== t.id)].slice(0, 12);
    setHistory(h);
    setPref('adhocHistory', h);
    run(t);
  };

  const savedId = active?.id.replace('adhoc-', 'isu-');
  const saveAsTopic = () => {
    if (!active || topics.some((t) => t.id === savedId)) return;
    setTopics([...topics, { ...active, id: savedId! }]);
    navigate('/topic/' + savedId);
  };

  const QUICK = ['DNVB Indonesia', 'Forum Gosip DNVB', 'DNVB Business School', 'dnvbindonesia kelas', '#dnvbindonesia'];

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <span className="eyebrow">Sekali cek</span>
          <h1 className="display mt-3 text-[30px] leading-tight sm:text-[40px]">Cek Sentimen Cepat</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">Ketik nama brand, produk, kampanye, hashtag, atau isu. Sistem mencari di Instagram, TikTok, Threads, YouTube, dan media web, lalu menilai sentimen positif, netral, dan negatif tiap sebutan.</p>
        </div>
      </header>

      {(
        <Panel title="Apa yang ingin dicek?" className="mb-6">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="isu-name">
                  Nama pencarian (opsional)
                </label>
                <input id="isu-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: kampanye 12.12 brand X" />
              </div>
              <QueryEditor queries={queries} onChange={setQueries} />
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="meta mr-1">Contoh:</span>
                {QUICK.map((q) => (
                  <button key={q} className="chip hover:bg-accent hover:text-accent-ink" onClick={() => setQueries([{ keywords: [q] }])}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label" htmlFor="isu-ctx">
                  Konteks untuk AI (opsional)
                </label>
                <textarea id="isu-ctx" className="input h-24 py-2" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Brand apa, produknya apa, dan hal yang BUKAN brand ini (homonim)" />
              </div>
              <div>
                <span className="label">Sumber</span>
                <SourcePicker value={sources} onChange={setSources} />
              </div>
              <ArrowButton className="w-full justify-center" onClick={start} disabled={!queries.some((q) => q.keywords.length)}>
                <Search size={15} /> Cek sentimen sekarang
              </ArrowButton>
            </div>
          </div>
        </Panel>
      )}

      {history.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <span className="meta mr-1">Riwayat</span>
          {history.map((h) => (
            <button
              key={h.id}
              aria-pressed={active?.id === h.id}
              className={`chip ${active?.id === h.id ? 'bg-primary text-white' : 'hover:text-primary'}`}
              onClick={() => (setActive(h), setPref('lastAdhoc', h))}
            >
              {h.name}
              {results[h.id] ? ` (${results[h.id].items.length})` : ''}
            </button>
          ))}
        </div>
      )}

      {active && (
        <>
          {!topics.some((t) => t.id === savedId) && results[active.id] && (
            <div className="no-print mb-4 flex justify-end">
              <button className="btn btn-sm" onClick={saveAsTopic}>
                <Save size={13} /> Simpan sebagai brand pantauan
              </button>
            </div>
          )}
          <TopicDashboard topic={active} />
        </>
      )}
    </div>
  );
}

/* --------------------------------- Kelola brand --------------------------------- */
export function TopicsPage({ openNew = false }: { openNew?: boolean }) {
  const { topics, setTopics, results } = useApp();
  const [edit, setEdit] = useState<Topic | null>(null);
  useEffect(() => {
    if (openNew) {
      setEdit(blankBrand('client'));
      navigate('/topics');
    }
  }, [openNew]);
  const [error, setError] = useState('');
  const isNew = edit && !topics.some((t) => t.id === edit.id);

  const save = () => {
    if (!edit) return;
    if (!edit.name.trim() || !edit.short.trim()) return setError('Nama dan singkatan wajib diisi.');
    if (!edit.queries.some((q) => q.keywords.length)) return setError('Isi minimal satu kata kunci.');
    setTopics(isNew ? [...topics, edit] : topics.map((t) => (t.id === edit.id ? edit : t)));
    setEdit(null);
    setError('');
  };

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-3xl">
          <span className="eyebrow">Portofolio</span>
          <h1 className="display mt-3 text-[30px] leading-tight sm:text-[40px]">Brand & Kata Kunci</h1>
          <p className="mt-2 text-[14px] text-ink-2">Mulai dari brand DNVB sendiri, lalu tambahkan brand klien dan kompetitor. Atur kata kunci, akun resmi, konteks AI, dan kanal yang dipantau.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            onClick={() => {
              if (confirm('Kembalikan daftar brand ke preset (DNVB Indonesia saja)? Brand yang Anda tambahkan akan hilang.')) setTopics(PRESET_TOPICS);
            }}
          >
            <RotateCcw size={15} /> Kembalikan preset
          </button>
          <ArrowButton onClick={() => setEdit(blankBrand('client'))}>
            <Plus size={15} /> Tambah brand
          </ArrowButton>
        </div>
      </header>

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="text-[12px] text-muted">
              <tr>
                <th className="pb-3 font-normal">Brand</th>
                <th className="pb-3 font-normal">Kata kunci</th>
                <th className="pb-3 font-normal">Jenis & komparasi</th>
                <th className="pb-3 font-normal">Sumber</th>
                <th className="pb-3 font-normal">Pantauan terakhir</th>
                <th className="pb-3 text-right font-normal">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.id} className="border-t border-line align-top">
                  <td className="py-3 pr-4">
                    <a href={'#/topic/' + t.id} className="inline-flex items-center gap-2 font-semibold hover:text-primary">
                      <EntityLogo topic={t} size={26} />
                      {t.name}
                    </a>
                    {t.handles?.length ? <div className="mt-0.5 text-ink-2">{t.handles.map((h) => '@' + h).join(', ')}</div> : null}
                  </td>
                  <td className="py-3 pr-4">
                    <div className="flex max-w-sm flex-wrap gap-1">
                      {t.queries.flatMap((q) => q.keywords).map((k) => (
                        <span key={k} className="chip">
                          {k}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="mb-1 text-ink-2">{BRAND_KIND_LABEL[t.kind || 'client']}</div>
                    <label className="inline-flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={t.inGroup} onChange={() => setTopics(topics.map((x) => (x.id === t.id ? { ...x, inGroup: !x.inGroup } : x)))} />
                      <span>Ikut komparasi</span>
                    </label>
                  </td>
                  <td className="py-3 pr-4"><div className="flex flex-wrap gap-1">{t.sources.filter((x) => SOURCE_META[x].channel === 'social').map((x) => <SourceIcon key={x} source={x} size={15} />)}<span className="ml-1 text-ink-2 tabular-nums">+{t.sources.filter((x) => SOURCE_META[x].channel === 'news').length} web</span></div></td>
                  <td className="py-3 pr-4 text-ink-2 tabular-nums">{results[t.id] ? `${fmtDate(results[t.id].runAt, true)}, ${nf(results[t.id].items.length)} sebutan` : 'Belum pernah'}</td>
                  <td className="py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button className="btn btn-sm" onClick={() => setEdit(structuredClone(t))}>
                        <Pencil size={13} /> Ubah
                      </button>
                      <button
                        className="btn btn-sm"
                        aria-label={`Hapus ${t.name}`}
                        onClick={() => {
                          if (confirm(`Hapus brand ${t.name}? Hasil pantauannya juga akan dihapus dari browser ini.`)) {
                            setTopics(topics.filter((x) => x.id !== t.id));
                            deleteResult(t.id);
                          }
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!topics.length && <Empty title="Belum ada brand">Tambahkan brand baru atau kembalikan preset DNVB Indonesia.</Empty>}
        </div>
      </Panel>

      <Panel title="Pagar pembatas pencarian" className="mt-4">
        <p className="text-[13.5px] leading-relaxed text-ink-2">Berlaku untuk semua brand dan semua kanal, sebelum dan sesudah isi artikel dibaca. Hasil pantauan lama yang tersimpan juga ikut disaring ulang.</p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="tile p-4 text-[13px]">
            <div className="font-medium">Kata kunci ambigu wajib berkonteks</div>
            <p className="mt-1 text-ink-2">Satu kata atau singkatan (mis. DNVB) harus disertai kata konteks di judul yang sama atau dalam 30 kata di isi. Kata konteks yang sama dengan kata kunci tidak dihitung.</p>
          </div>
          {SPAM_PATTERNS.map((p) => (
            <div key={p.label} className="tile p-4 text-[13px]">
              <div className="font-medium">Tolak {p.label}</div>
              <p className="mt-1 text-ink-2">Contoh: {p.examples}</p>
            </div>
          ))}
          <div className="tile p-4 text-[13px]">
            <div className="font-medium">Tolak domain iklan, properti, marketplace, lowongan</div>
            <p className="mt-1 text-ink-2">{BLOCKED_DOMAINS.slice(0, 14).join(', ')}, dan {BLOCKED_DOMAINS.length - 14} lainnya.</p>
          </div>
        </div>
        <p className="meta mt-3">Untuk pengecualian khusus per brand (mis. nama brand luar negeri yang mirip), isi kolom Kecualikan saat mengubah brand.</p>
      </Panel>

      {edit && (
        <Modal onClose={() => (setEdit(null), setError(''))} title={isNew ? 'Tambah brand' : `Ubah ${edit.name}`} width={820}>
          <TopicForm topic={edit} onChange={setEdit} />
          {error && (
            <p className="mt-4 text-[13px] text-neg-text" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn" onClick={() => (setEdit(null), setError(''))}>
              Batal
            </button>
            <button className="btn btn-primary" onClick={save}>
              <Save size={15} /> Simpan brand
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* --------------------------------- Sumber data --------------------------------- */
const SOURCE_INFO: Record<SourceKey, string> = {
  instagram: 'Unggahan berdasarkan hashtag dan kata kunci (Apify), atau unggahan akun yang namanya cocok (OpenCLI), plus komentar dari unggahan teramai.',
  tiktok: 'Video TikTok dari pencarian kata kunci, plus komentar dari video dengan komentar terbanyak (Apify).',
  threads: 'Post Threads terbaru dari pencarian kata kunci (Apify), cadangan Firecrawl dan Exa (threads.net / threads.com).',
  youtube: 'Video dan komentar publik pada video yang paling ramai (YouTube Data API), cadangan yt-dlp / OpenCLI / Exa.',
  googlenews: 'Agregator berita. Tiap kata kunci dicari terpisah di 3 edisi (Indonesia, Inggris-Indonesia, Inggris global); rentang dipecah per minggu dan minggu yang jenuh dipecah lagi sampai per hari.',
  bingnews: 'Melengkapi Google News dengan URL asli dan cuplikan berita. Hanya berita terbaru.',
  gdelt: 'Basis data media global, termasuk media Indonesia, sekitar tiga bulan terakhir.',
  web: 'Pencarian web Firecrawl (bila kunci diisi) lalu Exa: blog, review, siaran pers, dan media yang tidak terindeks Google News.',
  firecrawl: 'Crawl media dengan Firecrawl: berita + web Indonesia sesuai rentang tanggal, media bisnis/marketing/startup & gaya hidup, media nasional, lalu peta URL situs prioritas.',
  rss: 'Feed ditemukan otomatis dari halaman direktori RSS media nasional, ditambah media bisnis, marketing, startup, teknologi, gaya hidup, dan kreator, serta feed pencarian WordPress untuk arsip lama.',
  x: 'Tweet terbaru (opsional). Jalur Apify, twitter-cli/OpenCLI (sesi login sendiri), atau Exa.',
  facebook: 'Post publik Facebook dari pencarian (opsional).',
  reddit: 'Diskusi forum publik (opsional).',
  linkedin: 'Post, artikel, dan halaman perusahaan LinkedIn publik lewat Exa (opsional).',
};

const GROUP_TITLE = { social: 'Kanal utama: media sosial', news: 'Media web (portal berita, blog, RSS)', other: 'Media sosial tambahan (opsional)' } as const;

function RssPanel() {
  const [info, setInfo] = useState(() => rssCacheInfo());
  const [run, setRun] = useState<string | null>(null);
  const rediscover = async () => {
    setRun('mulai');
    try {
      await discoverAllFeeds((d, t, n) => setRun(`bagian ${d}/${t}, ${n} feed`), true);
    } finally {
      setRun(null);
      setInfo(rssCacheInfo());
    }
  };
  return (
    <Panel title="Katalog RSS" className="mb-4">
      <p className="text-[14px] leading-relaxed">
        Feed RSS ditemukan otomatis dari ratusan situs media: nasional, jaringan Antara, Tribun, dan iNews daerah, media bisnis, marketing, startup, teknologi, gaya hidup, kreator, serta media internasional yang meliput Indonesia. Setiap situs diperiksa (beranda, /rss, /feed, halaman direktori RSS), semua feed di dalamnya diambil, lalu seluruhnya dibaca setiap pemantauan.
      </p>
      <p className="meta mt-2">
        {info ? `${nf(info.feeds)} feed dari ${nf(info.sites)} situs (${nf(info.reachable)} terjangkau), ditemukan ${fmtDate(info.at)}. Penemuan diulang otomatis tiap 3 hari.` : 'Belum ada katalog: feed akan ditemukan otomatis saat pemantauan pertama.'}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm" onClick={rediscover} disabled={Boolean(run)}>
          {run ? `Menemukan… ${run}` : 'Temukan ulang semua feed'}
        </button>
        <span className="meta">Tambah media: RSS_SITES (domain), RSS_DIRECTORIES, RSS_FEEDS di environment.</span>
      </div>
    </Panel>
  );
}

function ReachPanel() {
  const { health } = useApp();
  const [doc, setDoc] = useState<{ loading: boolean; text?: string }>({ loading: false });
  const r = health?.reach;
  const runDoctor = async () => {
    setDoc({ loading: true });
    try {
      const j = await fetch('/api/reach?doctor=1').then((x) => x.json());
      setDoc({ loading: false, text: j.doctor ? JSON.stringify(j.doctor, null, 2) : j.doctorError || 'agent-reach belum terpasang di komputer yang menjalankan server.' });
    } catch (e) {
      setDoc({ loading: false, text: String((e as Error).message) });
    }
  };
  return (
    <Panel title="Agent Reach" className="mb-4">
      <p className="text-[14px] leading-relaxed">
        Media sosial dibaca lewat jalur pilihan{' '}
        <a className="underline" href="https://github.com/Panniantong/agent-reach" target="_blank" rel="noreferrer">
          Agent Reach
        </a>
        : tiap sumber punya daftar jalur berurutan, jalur pertama yang tersedia dan memberi hasil dipakai. Jalur CLI (OpenCLI, twitter-cli, rdt-cli, yt-dlp) memakai sesi login Anda sendiri dan hanya jalan di laptop
        {r?.bridge ? `, atau lewat jembatan ${r.bridge}` : ''}. Firecrawl {r?.firecrawl === 'self' ? '(self-host)' : r?.firecrawl === 'cloud' ? '(FIRECRAWL_API_KEY)' : '(belum aktif)'} dan Exa {r?.exa === 'api' ? '(EXA_API_KEY)' : '(MCP publik, tanpa kunci)'} menjadi jalur cadangan yang juga jalan di Vercel.
      </p>
      {r && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(r.bins).map(([k, v]) => (
            <span key={k} className={`badge ${v ? 'badge-positive' : 'badge-muted'}`}>
              {k} {v ? 'terpasang' : r.local ? 'belum' : 'n/a'}
            </span>
          ))}
        </div>
      )}
      <details className="mt-3 text-[13px] text-ink-2">
        <summary className="cursor-pointer font-medium text-ink">Cara memasang di laptop (Windows CMD)</summary>
        <pre className="tile mt-2 overflow-x-auto p-3 text-[12px] leading-relaxed">{`pipx install https://github.com/Panniantong/agent-reach/archive/main.zip
agent-reach install --env=local
npm install -g @jackwener/opencli      (lalu pasang ekstensi OpenCLI di Chrome & login platform)
pipx install twitter-cli               (isi TWITTER_AUTH_TOKEN dan TWITTER_CT0 di .env.local)
pipx install "git+https://github.com/public-clis/rdt-cli.git"
pipx install yt-dlp
agent-reach doctor`}</pre>
        <p className="mt-2">Untuk deploy Vercel: isi REACH_BRIDGE_TOKEN di .env.local, jalankan <code>npm run reach</code>, buka dengan tunnel (mis. cloudflared), lalu isi REACH_BRIDGE_URL dan REACH_BRIDGE_TOKEN di Vercel.</p>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-sm" onClick={runDoctor} disabled={doc.loading}>
          {doc.loading ? 'Memeriksa…' : 'Jalankan agent-reach doctor'}
        </button>
      </div>
      {doc.text && <pre className="tile mt-3 max-h-72 overflow-auto p-3 text-[11.5px]">{doc.text}</pre>}
    </Panel>
  );
}

export function SourcesPage() {
  const { health, photos, photoJob, findPhotos } = useApp();
  const nPhotos = Object.keys(photos).length;
  const keys = Object.keys(SOURCE_META) as SourceKey[];
  const groups = useMemo(() => ({ social: keys.filter((s) => SOURCE_META[s].group === 'social'), news: keys.filter((s) => SOURCE_META[s].group === 'news'), other: keys.filter((s) => SOURCE_META[s].group === 'other') }), []);
  return (
    <div>
      <header className="mb-6 max-w-3xl">
        <span className="eyebrow">Konfigurasi</span>
        <h1 className="display mt-3 text-[30px] leading-tight sm:text-[40px]">Sumber Data & Mesin Analisis</h1>
        <p className="mt-2 text-[14px] text-ink-2">Status dibaca dari environment variables server: Vercel, Settings, Environment Variables, atau file .env.local saat dijalankan lokal.</p>
      </header>

      {!health && (
        <Panel className="mb-4">
          <Empty title="Status server tidak terbaca">Endpoint /api/health tidak menjawab. Jalankan aplikasi dengan npm run dev, atau periksa deploy Vercel.</Empty>
        </Panel>
      )}

      <Panel title="Mesin analisis" className="mb-4">
        {health && health.ai.provider !== 'lexicon' ? (
          <p className="text-[14px] leading-relaxed">
            AI aktif lewat <b className="font-semibold">{health.ai.provider === 'sumopod' ? 'SumoPod' : 'Google Gemini'}</b>, model analisis <b className="font-semibold">{health.ai.model}</b>
            {health.ai.embedModel && (
              <>
                , model saringan makna <b className="font-semibold">{health.ai.embedModel}</b>
              </>
            )}
            : sentimen kontekstual (paham slang, sarkasme, dan emoji warganet), ekstraksi tokoh/kreator dan sub-isu, ringkasan eksekutif, dan pertanyaan bebas di Tanya Data.
          </p>
        ) : (
          <p className="text-[14px] leading-relaxed">
            Mode leksikon (tanpa AI). Isi <b className="font-semibold">SUMOPOD_API_KEY</b> (atau GEMINI_API_KEY) untuk analisis AI yang jauh lebih akurat.
          </p>
        )}
      </Panel>
      <Panel title="Foto tokoh & kreator" className="mb-4">
        <p className="text-[14px] leading-relaxed">
          <b className="font-semibold">{nPhotos}</b> foto tokoh tersimpan{' '}
          {health?.photos?.store === 'blob' ? 'permanen di server (Vercel Blob), dipakai bersama semua pengguna' : 'di browser ini (IndexedDB)'}. Foto dicari dari keterangan foto artikel
          pantauan, lalu pencarian berita khusus nama tokoh, lalu Wikipedia; gambar diunduh lewat server
          {health?.photos?.vision ? ' dan diperiksa AI (satu orang sebagai subjek utama)' : ''}, lalu disimpan sehingga tidak dicari ulang.
          {health?.photos?.store !== 'blob' && (
            <>
              {' '}Agar tersimpan di server untuk semua perangkat, buat Blob store di Vercel (Storage, Blob) sehingga <b className="font-semibold">BLOB_READ_WRITE_TOKEN</b> terisi.
            </>
          )}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" className="btn" disabled={photoJob?.running} onClick={() => findPhotos(undefined, true)}>
            {photoJob?.running ? 'Mencari foto…' : 'Cari foto tokoh sekarang'}
          </button>
          {photoJob && !photoJob.running && <span className="meta">Terakhir: {photoJob.found} foto baru dari {photoJob.asked} tokoh yang dicari.</span>}
        </div>
      </Panel>
      <RssPanel />
      <ReachPanel />
      {(['social', 'news', 'other'] as const).map((g) => (
        <Panel key={g} title={GROUP_TITLE[g]} className="mb-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groups[g].map((s) => {
              const st = health?.sources[s];
              return (
                <div key={s} className="tile p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[14px] font-medium">
                      <SourceIcon source={s} size={18} />
                      {SOURCE_META[s].label}
                    </div>
                    <span className={`badge ${st?.enabled ? 'badge-positive' : 'badge-muted'}`}>{st?.enabled ? 'Aktif' : 'Nonaktif'}</span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-ink-2">{SOURCE_INFO[s]}</p>
                  {st?.backends ? (
                    <ol className="mt-2 space-y-1" aria-label="Jalur berurutan">
                      {st.backends.map((b) => (
                        <li key={b.id} className="flex items-start gap-2 text-[12px]" title={b.available ? b.setup : `${b.reason}. ${b.setup || ''}`}>
                          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${b.label === st.active ? 'bg-pos' : b.available ? 'bg-ink-2' : 'bg-line-strong'}`} aria-hidden />
                          <span className={b.available ? 'text-ink' : 'text-muted'}>
                            {b.label}
                            {b.label === st.active ? ' (dipakai)' : b.available ? ' (cadangan)' : `: ${b.reason}`}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    SOURCE_META[s].needsKey && <div className="meta mt-2">Env: {SOURCE_META[s].needsKey}</div>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
      ))}

      <p className="meta mb-4">
        Logo platform dari paket simple-icons (CC0); merek dagang milik masing-masing pemilik, dipakai hanya untuk menandai sumber.
        {nounAttributions().map((a) => ` Ikon ${SOURCE_META[a.source].label}: ${a.text} (The Noun Project, CC BY).`).join('')}
      </p>
      <Panel title="Metodologi">
        <ul className="grid gap-x-10 gap-y-3 text-[13.5px] leading-relaxed text-ink-2 md:grid-cols-2">
          <li>Alur: kata kunci & akun brand, pengumpulan dari Instagram, TikTok, Threads, YouTube (termasuk komentar) dan media web, pembacaan isi artikel, penyaringan relevansi, analisis sentimen per sebutan, agregasi, ringkasan.</li>
          <li>Sentimen dinilai terhadap brand, bukan nada umum unggahan. AI membaca slang, sarkasme, campuran Indonesia-Inggris, dan emoji. Tanpa AI, leksikon bahasa warganet dengan penanganan negasi ("nggak worth", "gak nyesel") dipakai sebagai cadangan.</li>
          <li>Koreksi manual analis (ubah sentimen, tandai tidak relevan) langsung mengubah semua grafik, narasi, dan laporan.</li>
          <li>Net sentiment = (positif − negatif) ÷ total × 100, dihitung per brand dan per kanal. Rasio positif/negatif pada narasi dihitung dari sebutan berpolaritas (netral dikecualikan).</li>
          <li>Singkatan ambigu (mis. DNVB sebagai istilah umum "digitally native vertical brand") wajib disertai kata konteks, dan saringan makna (embedding) membuang konten yang lebih mirip spam, iklan, atau homonim.</li>
          <li>Tier media web: 1 media nasional, 2 media bisnis/marketing/startup dan gaya hidup, 3 lainnya.</li>
          <li>Peringatan dini: hari dengan sebutan negatif di atas rata-rata ditambah dua simpangan baku, isu dengan 40% atau lebih negatif, berita negatif di Tier 1, dan unggahan negatif yang ramai.</li>
          <li>Hasil pantauan disimpan di browser masing-masing pengguna (IndexedDB), belum dibagi antarpengguna.</li>
        </ul>
      </Panel>
    </div>
  );
}
