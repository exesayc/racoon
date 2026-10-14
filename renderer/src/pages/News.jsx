import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { Drawer } from '../components.jsx';
import { IconRefresh, IconExternal, IconDownload, IconCheck } from '../icons.jsx';
import { formatDate, typeLabel } from '../lib.js';

const api = window.hexrona;

// Links in patch notes open in the browser (main process intercepts navigation).
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noreferrer');
  }
});

export default function News({ system, updater }) {
  const [tab, setTab] = useState('minecraft');
  return (
    <section className="news">
      <header className="page-head">
        <div>
          <h2>Güncellemeler</h2>
          <p className="muted">Minecraft yama notları ve Hexrona'daki yenilikler.</p>
        </div>
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'minecraft'} className={tab === 'minecraft' ? 'active' : ''} onClick={() => setTab('minecraft')}>Minecraft</button>
          <button role="tab" aria-selected={tab === 'hexrona'} className={tab === 'hexrona' ? 'active' : ''} onClick={() => setTab('hexrona')}>
            Hexrona {updater?.status === 'ready' && <span className="nav-badge" />}
          </button>
        </div>
      </header>
      {tab === 'minecraft' ? <MinecraftNews /> : <HexronaUpdates system={system} updater={updater} />}
    </section>
  );
}

function MinecraftNews() {
  const [state, setState] = useState({ loading: true, items: [], error: null });
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    api.news.minecraft().then((res) => setState({ loading: false, items: res.ok ? res.data : [], error: res.ok ? null : 'Yama notları yüklenemedi. İnternet bağlantını kontrol et.' }));
  };
  useEffect(load, []);

  const items = state.items.filter((n) => filter === 'all' || n.type === filter);

  if (state.error) {
    return <div className="empty"><strong>Haberlere ulaşılamadı</strong><p>{state.error}</p><button className="ghost-btn" onClick={load}><IconRefresh size={16} /> Tekrar dene</button></div>;
  }

  return (
    <>
      <div className="filter-row">
        {[['all', 'Tümü'], ['release', 'Sürümler'], ['snapshot', 'Snapshot']].map(([id, label]) => (
          <button key={id} className={`chip ${filter === id ? 'on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="news-grid">
        {state.loading && Array.from({ length: 6 }, (_, i) => <div key={i} className="news-card skeleton" />)}
        {items.map((n, i) => (
          <button key={n.id} className="news-card" style={{ '--i': Math.min(i, 12) }} onClick={() => setOpen(n)}>
            <div className="news-img">{n.image && <img src={n.image} alt="" loading="lazy" />}</div>
            <div className="news-body">
              <span className="news-meta"><span className={`badge badge-${n.type === 'release' ? 'release' : 'snapshot'}`}>{typeLabel(n.type)}</span>{formatDate(n.date)}</span>
              <strong>{n.title}</strong>
              <p>{n.summary}</p>
            </div>
          </button>
        ))}
      </div>
      {open && <Article item={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function Article({ item, onClose }) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.news.body(item.contentPath).then((res) => (res.ok ? setHtml(res.data) : setError('Yazı yüklenemedi.')));
  }, [item.contentPath]);
  const clean = useMemo(() => (html ? DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'iframe', 'form'] }) : ''), [html]);

  return (
    <Drawer wide title={item.title} subtitle={`${typeLabel(item.type)} · ${formatDate(item.date)}`} onClose={onClose}>
      {item.image && <img className="article-hero" src={item.image} alt="" />}
      {error && <p className="form-error">{error}</p>}
      {!html && !error && <p className="muted">Yükleniyor…</p>}
      {/* Sanitised with DOMPurify above. */}
      {html && <article className="article" dangerouslySetInnerHTML={{ __html: clean }} />}
    </Drawer>
  );
}

function HexronaUpdates({ system, updater }) {
  const [state, setState] = useState({ loading: true, releases: [], configured: true, error: null });
  useEffect(() => {
    api.news.hexrona().then((res) =>
      setState({ loading: false, releases: res.ok ? res.data.releases : [], configured: res.ok ? res.data.configured : true, error: res.ok ? null : 'Sürüm notları yüklenemedi.' }),
    );
  }, []);

  return (
    <div className="hexrona-updates">
      <UpdateCard system={system} updater={updater} />
      {!state.configured ? (
        <div className="notice">
          GitHub deposu henüz bağlanmadı. <code>package.json</code> içindeki <code>build.publish</code> alanına GitHub kullanıcı adını yazınca sürüm notları ve otomatik güncelleme çalışır.
        </div>
      ) : state.error ? (
        <p className="form-error">{state.error}</p>
      ) : state.loading ? (
        <p className="muted">Yükleniyor…</p>
      ) : state.releases.length === 0 ? (
        <div className="empty"><strong>Henüz yayınlanmış sürüm yok</strong><p>GitHub'da ilk sürümü yayınladığında notları burada görünür.</p></div>
      ) : (
        <ol className="release-list">
          {state.releases.map((r) => (
            <li key={r.tag} className="release">
              <div className="release-head">
                <strong>{r.name}</strong>
                {r.tag.replace(/^v/, '') === system?.version && <span className="active-pill">Kullandığın sürüm</span>}
                {r.prerelease && <span className="badge badge-snapshot">Ön sürüm</span>}
                <span className="muted small">{formatDate(r.date)}</span>
                <button className="icon-btn" aria-label="GitHub'da aç" title="GitHub'da aç" onClick={() => api.shell.openExternal(r.url)}><IconExternal size={15} /></button>
              </div>
              <pre className="release-body">{r.body.trim() || 'Not eklenmemiş.'}</pre>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function UpdateCard({ system, updater }) {
  const s = updater || { status: 'idle' };
  let title = `Hexrona v${system?.version || ''}`;
  let text = '';
  let action = null;
  switch (s.status) {
    case 'disabled':
      text = s.reason === 'dev' ? 'Geliştirme modunda otomatik güncelleme kapalı. Kurulum dosyasıyla yüklenen sürümde çalışır.' : 'GitHub deposu bağlanınca otomatik güncelleme açılır.';
      break;
    case 'checking':
      text = 'Güncellemeler kontrol ediliyor…';
      break;
    case 'downloading':
      title = `v${s.version} indiriliyor`;
      text = `%${s.percent || 0} tamamlandı. İndirme bitince yeniden başlatman istenecek.`;
      break;
    case 'ready':
      title = `v${s.version} kurulmaya hazır`;
      text = 'Launcher kapanıp güncellenmiş haliyle yeniden açılır.';
      action = <button className="primary-btn" onClick={api.updater.install}><IconDownload size={16} /> Yeniden başlat ve güncelle</button>;
      break;
    case 'latest':
      text = 'En güncel sürümü kullanıyorsun.';
      action = <button className="ghost-btn" onClick={api.updater.check}><IconRefresh size={16} /> Tekrar kontrol et</button>;
      break;
    case 'error':
      text = `Güncelleme kontrol edilemedi: ${s.message}`;
      action = <button className="ghost-btn" onClick={api.updater.check}><IconRefresh size={16} /> Tekrar dene</button>;
      break;
    default:
      action = <button className="ghost-btn" onClick={api.updater.check}><IconRefresh size={16} /> Güncellemeleri kontrol et</button>;
  }
  return (
    <div className={`update-card ${s.status}`}>
      <span className="update-icon">{s.status === 'latest' ? <IconCheck size={18} /> : <IconDownload size={18} />}</span>
      <div className="update-text">
        <strong>{title}</strong>
        <p className="muted">{text}</p>
        {s.status === 'downloading' && <div className="progress-track"><div className="progress-fill" style={{ width: `${s.percent || 0}%` }} /></div>}
      </div>
      {action}
    </div>
  );
}
