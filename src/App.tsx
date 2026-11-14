import { CalendarDays, ChevronDown, Database, LayoutDashboard, ListChecks, Loader2, Menu, Moon, Plus, ScanSearch, Sun, X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Segmented } from './components/ui';
import { EntityLogo } from './components/EntityLogo';
import { fmtDate, PRESET_RANGES, rangeFromPreset } from './lib/format';
import { BRAND_KIND_LABEL, type BrandKind } from './lib/presets';
import GroupOverview from './pages/GroupOverview';
import { IssueSearchPage, SourcesPage, TopicPage, TopicsPage } from './pages/Pages';
import { AppProvider, navigate, useApp, useHashRoute } from './state';

/** Logo resmi dnvbindonesia.com + nama produk */
function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="/" className="flex min-w-0 items-center gap-3" aria-label="DNVB Sosmed Tracker, ke halaman depan">
      <img src="/dnvb/logo.png" alt="dnvb" width={90} height={28} className="h-[26px] w-auto shrink-0 dark:invert" />
      <span className={`min-w-0 border-l border-line pl-3 leading-[1.15] font-bold tracking-tight ${compact ? 'text-[12px]' : 'text-[13px]'}`}>
        Sosmed
        <br />
        Tracker
      </span>
    </a>
  );
}

function NavItem({ to, active, icon, children, extra }: { to: string; active: boolean; icon?: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <a
      href={'#' + to}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-10 items-center gap-2.5 rounded-full px-3.5 py-2 text-[13.5px] font-medium transition-colors duration-300 ${active ? 'bg-primary text-white' : 'text-ink-2 hover:bg-primary-soft hover:text-primary'}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {extra}
    </a>
  );
}

function Sidebar({ route }: { route: string }) {
  const { topics, results, progress } = useApp();
  const [showBrands, setShowBrands] = useState(true);
  const groups: [BrandKind, typeof topics][] = (['own', 'client', 'competitor'] as BrandKind[]).map((k) => [k, topics.filter((t) => (t.kind || 'client') === k)]);
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pt-6 pb-4">
        <Logo />
      </div>
      <nav aria-label="Navigasi utama" className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        <NavItem to="/" active={route === '/'} icon={<LayoutDashboard size={15} />}>
          Ringkasan Brand
        </NavItem>
        <NavItem to="/search" active={route === '/search'} icon={<ScanSearch size={15} />}>
          Cek Sentimen Cepat
        </NavItem>
        <button type="button" className="flex w-full items-center justify-between px-3.5 pt-4 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase" onClick={() => setShowBrands(!showBrands)} aria-expanded={showBrands}>
          Brand dipantau <ChevronDown size={13} className={`transition-transform ${showBrands ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {showBrands &&
          groups.map(([kind, list]) =>
            list.length ? (
              <div key={kind}>
                <div className="px-3.5 pt-2 pb-1 text-[10.5px] text-muted">{BRAND_KIND_LABEL[kind]}</div>
                {list.map((t) => {
                  const p = progress[t.id];
                  const running = p && !['done', 'error'].includes(p.phase);
                  const r = results[t.id];
                  const active = route === '/topic/' + t.id || route.startsWith('/topic/' + t.id + '/');
                  return (
                    <NavItem
                      key={t.id}
                      to={'/topic/' + t.id}
                      active={active}
                      icon={<EntityLogo topic={t} size={24} active={active} />}
                      extra={running ? <Loader2 size={13} className="animate-spin" /> : r ? <span className="text-[11.5px] tabular-nums opacity-70">{r.items.length}</span> : null}
                    >
                      <span title={t.name}>{t.name}</span>
                    </NavItem>
                  );
                })}
              </div>
            ) : null,
          )}
        <a href="#/topics?new=1" className="mt-1 flex min-h-10 items-center gap-2.5 rounded-full px-3.5 py-2 text-[13.5px] font-semibold text-primary transition-colors hover:bg-primary-soft">
          <Plus size={15} /> Tambah brand
        </a>
        <div className="pt-3" />
        <NavItem to="/topics" active={route.startsWith('/topics')} icon={<ListChecks size={15} />}>
          Brand & Kata Kunci
        </NavItem>
        <NavItem to="/sources" active={route === '/sources'} icon={<Database size={15} />}>
          Sumber Data
        </NavItem>
      </nav>
      <div className="meta border-t border-line px-5 py-3">v4.0 · DNVB Indonesia</div>
    </div>
  );
}

function RangePicker() {
  const { range, setRange } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const click = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    window.addEventListener('keydown', key);
    window.addEventListener('mousedown', click);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('mousedown', click);
    };
  }, [open]);
  const label = range.preset === 'custom' ? `${fmtDate(range.from)} sampai ${fmtDate(range.to)}` : PRESET_RANGES.find((p) => p.key === range.preset)?.label;
  return (
    <div className="relative" ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog">
        <CalendarDays size={15} /> {label}
      </button>
      {open && (
        <div role="dialog" aria-label="Pilih periode" className="absolute right-0 z-40 mt-2 w-[300px] rounded-[20px] border border-line bg-panel p-4 shadow-[0_12px_32px_rgba(16,24,32,.14)] [animation:dnvb-rise_.25s_ease_both]">
          <div className="flex flex-wrap gap-1.5">
            {PRESET_RANGES.map((p) => (
              <button
                key={p.key}
                className={`btn btn-sm ${range.preset === p.key ? 'btn-primary' : ''}`}
                onClick={() => {
                  setRange({ ...rangeFromPreset(p.key), preset: p.key });
                  setOpen(false);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="r-from">
                Dari
              </label>
              <input id="r-from" type="date" className="input" value={range.from} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value, preset: 'custom' })} />
            </div>
            <div>
              <label className="label" htmlFor="r-to">
                Sampai
              </label>
              <input id="r-to" type="date" className="input" value={range.to} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value, preset: 'custom' })} />
            </div>
          </div>
          <p className="meta mt-3 leading-relaxed">Periode menentukan rentang pencarian saat pemantauan dijalankan dan filter tampilan dashboard.</p>
        </div>
      )}
    </div>
  );
}

/** Bilah progres pink di atas layar selama ada brand yang sedang dipantau (gaya nprogress dnvbindonesia.com). */
function TopProgress() {
  const { progress } = useApp();
  const running = Object.values(progress).filter((p) => !['done', 'error'].includes(p.phase));
  if (!running.length) return null;
  const frac =
    running.reduce((acc, p) => {
      const base = { collect: 0.1, enrich: 0.35, analyze: 0.6, insight: 0.92, done: 1, error: 1 }[p.phase];
      const inner = p.phase === 'analyze' && p.total ? (p.analyzed / p.total) * 0.3 : p.phase === 'enrich' && p.read?.total ? (p.read.done / p.read.total) * 0.25 : 0;
      return acc + base + inner;
    }, 0) / running.length;
  return <div className="top-progress no-print" style={{ transform: `scaleX(${Math.min(0.98, frac)})` }} role="progressbar" aria-label="Progres pemantauan" aria-valuenow={Math.round(frac * 100)} />;
}

function Shell() {
  const route = useHashRoute();
  const { channel, setChannel, dark, setDark } = useApp();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    document.getElementById('main')?.scrollTo({ top: 0 });
    setMenu(false);
  }, [route]);
  useEffect(() => {
    if (!menu) return;
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [menu]);

  const path = route.split('?')[0];
  let page: ReactNode;
  if (path.startsWith('/topic/')) {
    const [id, tab] = path.slice(7).split('/');
    page = <TopicPage id={decodeURIComponent(id)} tab={tab} />;
  } else if (path === '/search') page = <IssueSearchPage />;
  else if (path === '/topics') page = <TopicsPage openNew={route.includes('new=1')} />;
  else if (path === '/sources') page = <SourcesPage />;
  else page = <GroupOverview />;

  return (
    <div className="flex h-full">
      <TopProgress />
      <aside className="no-print hidden w-[268px] shrink-0 border-r border-line bg-panel lg:block">
        <Sidebar route={route} />
      </aside>
      {menu && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/40 [animation:dnvb-fade_.25s_ease_both]" onClick={() => setMenu(false)} />
          <aside className="absolute inset-y-0 left-0 w-[290px] bg-panel shadow-[0_0_40px_rgba(16,24,32,.2)] [animation:dnvb-fade_.25s_ease_both]" role="dialog" aria-modal="true" aria-label="Menu navigasi">
            <button className="btn btn-icon absolute top-5 right-4 w-10" onClick={() => setMenu(false)} aria-label="Tutup menu">
              <X size={16} />
            </button>
            <Sidebar route={route} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex flex-wrap items-center gap-2 border-b border-line bg-canvas/90 px-4 py-3 backdrop-blur sm:px-6">
          <button className="btn btn-icon w-10 lg:hidden" onClick={() => setMenu(true)} aria-label="Buka menu">
            <Menu size={16} />
          </button>
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Segmented
              label="Kanal"
              value={channel}
              onChange={setChannel}
              options={[
                { value: 'all', label: 'Semua kanal' },
                { value: 'social', label: 'Media sosial' },
                { value: 'news', label: 'Media web' },
              ]}
            />
            <RangePicker />
            <button className="btn btn-icon w-10" onClick={() => setDark(!dark)} aria-label={dark ? 'Pakai tema terang' : 'Pakai tema gelap'} title={dark ? 'Tema terang' : 'Tema gelap'}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>
        <main id="main" className="print-full page-wash scroll-thin flex-1 overflow-y-auto">
          <div id="content" className="mx-auto max-w-[1600px] p-4 sm:p-6">
            {page}
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

export { navigate };
