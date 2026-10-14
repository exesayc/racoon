import { useCallback, useEffect, useRef, useState } from 'react';
import { logoUrl, backgroundUrl } from './assets.js';
import {
  IconHome, IconGrid, IconBox, IconServer, IconNews, IconSettings, IconTerminal, IconUsers, IconBug,
  IconMinus, IconSquare, IconX, IconAlert, IconCheck, IconDownload,
} from './icons.jsx';
import { formatSpeed } from './lib.js';
import ProfileMenu from './ProfileMenu.jsx';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import Profiles from './pages/Profiles.jsx';
import Mods from './pages/Mods.jsx';
import Servers from './pages/Servers.jsx';
import News from './pages/News.jsx';
import Settings from './pages/Settings.jsx';
import Console from './pages/Console.jsx';
import Friends from './pages/Friends.jsx';
import BugReport from './pages/BugReport.jsx';

const api = window.hexrona;

const NAV = [
  { id: 'home', label: 'Ana sayfa', Icon: IconHome },
  { id: 'profiles', label: 'Profiller', Icon: IconGrid },
  { id: 'mods', label: 'Mod Mağazası', Icon: IconBox },
  { id: 'servers', label: 'Sunucular', Icon: IconServer },
  { id: 'friends', label: 'Arkadaşlar', Icon: IconUsers },
  { id: 'news', label: 'Güncellemeler', Icon: IconNews },
];
const NAV_BOTTOM = [
  { id: 'bugreport', label: 'Hata Bildir', Icon: IconBug },
  { id: 'console', label: 'Konsol', Icon: IconTerminal },
  { id: 'settings', label: 'Ayarlar', Icon: IconSettings },
];

const LOG_LIMIT = 5000;

export default function App() {
  const [page, setPage] = useState('home');
  const [settings, setSettings] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [profiles, setProfiles] = useState(null);
  const [addingAccount, setAddingAccount] = useState(false);
  const [system, setSystem] = useState(null);
  const [catalog, setCatalog] = useState({ versions: [], latest: null, offline: false, loading: true });
  const [game, setGame] = useState({ status: 'idle' });
  const [progress, setProgress] = useState(null);
  const [logs, setLogs] = useState([]);
  const [updater, setUpdater] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [social, setSocial] = useState(null);
  const [speed, setSpeed] = useState(0);
  const [toast, setToast] = useState(null);
  const [maximized, setMaximized] = useState(false);
  const toastTimer = useRef(null);
  const announcedJobs = useRef(new Set());

  const showToast = useCallback((next) => {
    clearTimeout(toastTimer.current);
    setToast({ ...next, key: Date.now() });
    if (!next.sticky) toastTimer.current = setTimeout(() => setToast(null), next.tone === 'success' ? 3500 : 6000);
  }, []);

  const loadVersions = useCallback(async () => {
    setCatalog((c) => ({ ...c, loading: true }));
    const result = await api.versions.list();
    setCatalog({ ...result, loading: false });
  }, []);

  useEffect(() => {
    api.settings.get().then(setSettings);
    api.accounts.list().then(setAccounts);
    api.profiles.list().then(setProfiles);
    api.system.info().then(setSystem);
    api.game.status().then(setGame);
    api.game.logs().then(setLogs);
    api.updater.state().then(setUpdater);
    api.jobs.list().then(setJobs);
    api.social.state().then(setSocial);
    loadVersions();

    const offs = [
      api.game.onState((state) => {
        setGame(state);
        if (state.status !== 'installing') setProgress(null);
        if (state.status === 'error') {
          showToast({ tone: 'error', title: 'Oyun başlatılamadı', message: state.message, crash: state.crashReportLocation, logs: true, sticky: true });
        }
        if (state.status === 'running' || (state.status === 'idle' && state.exited)) loadVersions();
      }),
      api.game.onProgress(setProgress),
      api.game.onLog((line) =>
        setLogs((prev) => {
          const next = prev.length >= LOG_LIMIT ? prev.slice(-LOG_LIMIT + 1) : prev.slice();
          next.push(line);
          return next;
        }),
      ),
      api.profiles.onChanged(setProfiles),
      api.jobs.onUpdate((list) => {
        setJobs(list);
        for (const j of list) {
          if (j.status === 'error' && !announcedJobs.current.has(j.id)) {
            announcedJobs.current.add(j.id);
            showToast({ tone: 'error', title: `${j.title} kurulamadı`, message: j.message });
          }
        }
      }),
      api.social.onState(setSocial),
      api.social.onNotify((msg) => {
        if (msg.kind === 'error') showToast({ tone: 'error', title: 'Arkadaşlar', message: msg.message });
        if (msg.kind === 'request') showToast({ tone: 'success', title: 'Yeni arkadaşlık isteği', message: `${msg.name} seni eklemek istiyor.` });
        if (msg.kind === 'accepted') showToast({ tone: 'success', title: `${msg.name} isteğini kabul etti` });
      }),
      api.net.onSpeed(({ bps }) => setSpeed(bps)),
      api.nav.onGo(setPage),
      api.updater.onState(setUpdater),
      api.window.onMaximized(setMaximized),
    ];
    return () => offs.forEach((off) => off());
  }, [loadVersions, showToast]);

  const updateSettings = useCallback(async (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    const saved = await api.settings.set(patch);
    setSettings(saved);
    if ('gameDir' in patch) loadVersions();
  }, [loadVersions]);

  const play = useCallback(
    async (profileId, server) => {
      setPage('home');
      const res = await api.game.play({ profileId, server });
      if (!res.ok) showToast({ tone: 'error', title: 'Oyun başlatılamadı', message: res.message });
      else setProfiles(await api.profiles.list());
    },
    [showToast],
  );

  const onLoggedIn = (res) => {
    setAccounts({ activeId: res.activeId, accounts: res.accounts });
    setAddingAccount(false);
  };

  const logout = async (account) => setAccounts(await api.accounts.remove(account.id));

  // Theme: data attribute drives the light palette; accent is a single CSS variable everything derives from.
  useEffect(() => {
    if (!settings) return;
    document.documentElement.dataset.theme = settings.theme || 'dark';
    document.documentElement.style.setProperty('--accent', settings.accent || '#e2252e');
  }, [settings?.theme, settings?.accent]);

  if (!settings || !accounts || !profiles) return <div className="boot"><img src={logoUrl} alt="" className="boot-logo" /></div>;

  const busy = game.status === 'installing' || game.status === 'launching' || game.status === 'running';
  const needsLogin = accounts.accounts.length === 0 || addingAccount;
  const activeProfile = profiles.profiles.find((p) => p.id === profiles.activeId) || profiles.profiles[0];
  const homeBackground = settings.background ? `hexrona-media://bg/${encodeURIComponent(settings.background)}` : backgroundUrl;
  const pendingRequests = social?.incoming?.length || 0;

  const windowControls = (
    <div className="window-controls">
      <button aria-label="Küçült" onClick={api.window.minimize}><IconMinus size={16} /></button>
      <button aria-label={maximized ? 'Önceki boyut' : 'Büyüt'} onClick={api.window.toggleMaximize}><IconSquare size={13} /></button>
      <button aria-label="Kapat" className="close" onClick={api.window.close}><IconX size={16} /></button>
    </div>
  );

  if (needsLogin) {
    return (
      <div className="login-shell">
        <header className="titlebar overlay">{windowControls}</header>
        <Login version={system?.version} onDone={onLoggedIn} onBack={accounts.accounts.length > 0 ? () => setAddingAccount(false) : null} />
      </div>
    );
  }

  const navButton = ({ id, label, Icon }) => (
    <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)} aria-current={page === id ? 'page' : undefined}>
      <Icon size={20} />
      <span className="nav-tip">{label}</span>
      {id === 'console' && game.status === 'running' && <span className="nav-dot" />}
      {id === 'news' && updater?.status === 'ready' && <span className="nav-dot accent" />}
      {id === 'friends' && pendingRequests > 0 && <span className="nav-count">{pendingRequests}</span>}
    </button>
  );

  return (
    <div className={`app page-${page}`}>
      <div className="backdrop" aria-hidden="true">
        {homeBackground && <img key={homeBackground} className="backdrop-image" src={homeBackground} alt="" />}
        <div className="backdrop-shade" />
      </div>

      <header className="titlebar">
        <div className="brand">
          <img src={logoUrl} alt="" className="brand-logo" />
          <span className="brand-name">HEXRONA</span>
        </div>
        <div className="titlebar-right">
          {updater?.status === 'ready' && (
            <button className="update-pill" onClick={api.updater.install}><IconDownload size={14} /> v{updater.version} hazır · Yeniden başlat</button>
          )}
          {updater?.status === 'downloading' && <span className="update-pill quiet">Güncelleme indiriliyor %{updater.percent || 0}</span>}
          <ProfileMenu
            accounts={accounts.accounts}
            activeId={accounts.activeId}
            disabled={busy}
            onSelect={async (id) => setAccounts(await api.accounts.select(id))}
            onAdd={() => setAddingAccount(true)}
            onLogout={logout}
          />
          {windowControls}
        </div>
      </header>

      <nav className="sidebar" aria-label="Ana menü">
        {NAV.map(navButton)}
        <span className="nav-spacer" />
        {NAV_BOTTOM.map(navButton)}
      </nav>

      <main className="content">
        <div key={page} className="page-enter">
          {page === 'home' && (
            <Home
              profiles={profiles}
              game={game}
              progress={progress}
              speed={speed}
              onPlay={(id) => play(id)}
              onCancel={api.game.cancel}
              onSelectProfile={async (id) => setProfiles(await api.profiles.select(id))}
              onManageProfiles={() => setPage('profiles')}
            />
          )}
          {page === 'profiles' && (
            <Profiles profiles={profiles} catalog={catalog} system={system} busy={busy} jobs={jobs} activeGameProfile={busy ? game.profileId : null} onChange={setProfiles} onPlay={(id) => play(id)} onToast={showToast} />
          )}
          {page === 'mods' && <Mods profiles={profiles} jobs={jobs} onToast={showToast} />}
          {page === 'servers' && <Servers activeProfile={activeProfile} busy={busy} onToast={showToast} onJoin={(address) => play(activeProfile?.id, address)} />}
          {page === 'friends' && <Friends social={social} system={system} busy={busy} onJoin={(address) => play(activeProfile?.id, address)} onAddAccount={() => setAddingAccount(true)} />}
          {page === 'bugreport' && <BugReport system={system} />}
          {page === 'news' && <News system={system} updater={updater} />}
          {page === 'console' && <Console logs={logs} onClear={() => { api.game.clearLogs(); setLogs([]); }} />}
          {page === 'settings' && (
            <Settings
              settings={settings}
              system={system}
              accounts={accounts}
              busy={busy}
              onChange={updateSettings}
              onToast={showToast}
              onAddAccount={() => setAddingAccount(true)}
              onSelectAccount={async (id) => setAccounts(await api.accounts.select(id))}
              onRemoveAccount={logout}
            />
          )}
        </div>
      </main>

      {jobs.length > 0 && (
        <div className="jobs-panel" aria-live="polite">
          {jobs.map((j) => {
            const pct = j.total ? Math.min(100, (j.done / j.total) * 100) : null;
            return (
              <div key={j.id} className={`job ${j.status}`}>
                <div className="job-head">
                  <strong>{j.title}</strong>
                  {j.status !== 'running' && <button className="icon-btn small" aria-label="Kapat" onClick={() => api.jobs.dismiss(j.id)}><IconX size={14} /></button>}
                </div>
                <span className="job-stage">
                  {j.status === 'error' ? j.message : j.stage}
                  {j.status === 'running' && speed > 0 && <span className="muted"> · {formatSpeed(speed)}</span>}
                </span>
                {j.status === 'running' && (
                  <div className={`progress-track ${pct === null ? 'indeterminate' : ''}`}><div className="progress-fill" style={{ width: pct === null ? undefined : `${pct}%` }} /></div>
                )}
                {j.status === 'done' && j.result?.profileId && (
                  <button className="link-btn" onClick={() => { setPage('profiles'); api.jobs.dismiss(j.id); }}>
                    Profile git{j.result.skipped?.length ? ` · ${j.result.skipped.length} içerik bu sürüm için yoktu` : ''}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div key={toast.key} className={`toast toast-${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          {toast.tone === 'success' ? <IconCheck size={20} className="toast-icon" /> : <IconAlert size={20} className="toast-icon" />}
          <div className="toast-body">
            <strong>{toast.title}</strong>
            {toast.message && <p>{toast.message}</p>}
            {(toast.logs || toast.crash) && (
              <div className="toast-actions">
                {toast.logs && <button onClick={() => { setPage('console'); setToast(null); }}>Konsolu aç</button>}
                {toast.crash && <button onClick={() => api.shell.showItem(toast.crash)}>Çökme raporunu göster</button>}
              </div>
            )}
          </div>
          <button className="toast-close" aria-label="Bildirimi kapat" onClick={() => setToast(null)}><IconX size={16} /></button>
        </div>
      )}
    </div>
  );
}
