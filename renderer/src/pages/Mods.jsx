import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconCheck, IconTrash, IconDownload, IconChevron, IconAlert } from '../icons.jsx';
import { Toggle, ProfileGlyph, Confirm } from '../components.jsx';
import { formatCount, loaderLabel, profileColor } from '../lib.js';

const api = window.hexrona;

const TYPES = [
  { id: 'mod', label: 'Modlar' },
  { id: 'shader', label: 'Shader' },
  { id: 'resourcepack', label: 'Kaynak paketleri' },
  { id: 'modpack', label: "Modpack'ler" },
  { id: 'installed', label: 'Yüklü' },
];

const SORTS = [
  { id: 'relevance', label: 'En alakalı' },
  { id: 'downloads', label: 'En çok indirilen' },
  { id: 'follows', label: 'En çok takip edilen' },
  { id: 'newest', label: 'En yeni' },
  { id: 'updated', label: 'Son güncellenen' },
];

export default function Mods({ profiles, jobs, onToast }) {
  const [profileId, setProfileId] = useState(profiles.activeId);
  const profile = profiles.profiles.find((p) => p.id === profileId) || profiles.profiles[0];
  const [type, setType] = useState('mod');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('relevance');
  const [results, setResults] = useState({ loading: true, hits: [], total: 0, error: null });
  const [installed, setInstalled] = useState([]);
  const [pending, setPending] = useState({}); // projectId -> true
  const [conflict, setConflict] = useState(null); // { hit, conflicts }
  const searchSeq = useRef(0);

  const refreshInstalled = useCallback(async () => {
    if (!profile) return;
    const res = await api.mods.installed(profile.id);
    setInstalled(res.ok ? res.data : []);
  }, [profile?.id]);

  useEffect(() => { refreshInstalled(); }, [refreshInstalled]);

  const runSearch = useCallback(async (offset = 0) => {
    if (!profile || type === 'installed') return;
    const seq = ++searchSeq.current;
    setResults((r) => ({ ...r, loading: true, error: null, ...(offset === 0 ? { hits: [] } : {}) }));
    const res = await api.mods.search({ query, type, mcVersion: profile.mcVersion, loader: profile.loader, sort, offset });
    if (seq !== searchSeq.current) return;
    if (!res.ok) return setResults({ loading: false, hits: [], total: 0, error: 'Modrinth\'e ulaşılamadı. İnternet bağlantını kontrol et.' });
    setResults((r) => ({ loading: false, error: null, total: res.data.total, hits: offset === 0 ? res.data.hits : [...r.hits, ...res.data.hits] }));
  }, [profile?.id, profile?.mcVersion, profile?.loader, type, query, sort]);

  // Debounce typing; react instantly to tab/sort/profile changes.
  useEffect(() => {
    const t = setTimeout(() => runSearch(0), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [runSearch]);

  const installedIds = useMemo(() => new Set(installed.map((i) => i.projectId).filter(Boolean)), [installed]);

  const install = async (hit, force = false) => {
    if (hit.type === 'modpack') {
      await api.mods.installModpack({ projectId: hit.id, title: hit.title, icon: hit.icon });
      return onToast({ tone: 'success', title: `${hit.title} kuruluyor`, message: 'Yeni bir profil olarak hazırlanıyor; ilerlemeyi sağ altta görebilirsin.' });
    }
    setPending((p) => ({ ...p, [hit.id]: true }));
    const res = await api.mods.install(profile.id, { projectId: hit.id, type: hit.type, title: hit.title, icon: hit.icon, slug: hit.slug, force });
    setPending((p) => ({ ...p, [hit.id]: false }));
    if (!res.ok) return onToast({ tone: 'error', title: `${hit.title} yüklenemedi`, message: res.message });
    if (res.data.conflicts.length) return setConflict({ hit, conflicts: res.data.conflicts });
    const extra = res.data.installed.slice(1);
    onToast({ tone: 'success', title: `${hit.title} yüklendi`, message: extra.length ? `Gerekli bağımlılıklar da yüklendi: ${extra.join(', ')}` : `${profile.name} profiline eklendi.` });
    refreshInstalled();
  };
  const packJobs = new Set((jobs || []).filter((j) => j.status === 'running').map((j) => j.title));

  if (!profile) {
    return (
      <section className="mods">
        <div className="empty"><strong>Önce bir profil oluştur</strong><p>Modlar bir profile yüklenir.</p></div>
      </section>
    );
  }

  const vanillaMods = type === 'mod' && profile.loader === 'vanilla';

  return (
    <section className="mods">
      <header className="page-head">
        <div>
          <h2>Mod Mağazası</h2>
          <p className="muted">{type === 'modpack' ? 'Modpack\'ler kendi sürümleriyle yeni bir profil olarak kurulur.' : 'Modrinth\'teki içerikler, seçili profilin sürümüne göre filtrelenir.'}</p>
        </div>
        {type !== 'modpack' && <ProfileSelect profiles={profiles.profiles} value={profile.id} onChange={setProfileId} />}
      </header>

      <div className="versions-toolbar">
        <div className="tabs" role="tablist">
          {TYPES.map((t) => (
            <button key={t.id} role="tab" aria-selected={type === t.id} className={type === t.id ? 'active' : ''} onClick={() => setType(t.id)}>
              {t.label}
              {t.id === 'installed' && <span className="tab-count">{installed.length}</span>}
            </button>
          ))}
        </div>
        {type !== 'installed' && (
          <div className="toolbar-right">
            <select className="select" value={sort} aria-label="Sıralama" onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <div className="search">
              <IconSearch size={16} />
              <input placeholder={type === 'mod' ? 'Sodium, JEI, Xaero…' : 'Ara'} aria-label="Modrinth'te ara" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      {vanillaMods && (
        <div className="notice">
          <strong>{profile.name} bir Vanilla profili.</strong> Mod yüklemek için profili Fabric, Quilt, Forge ya da NeoForge ile düzenle veya yeni bir profil oluştur.
        </div>
      )}

      {type === 'installed' ? (
        <InstalledList items={installed} profile={profile} onChanged={refreshInstalled} onToast={onToast} />
      ) : (
        <div className="store-list">
          {results.error && (
            <div className="empty"><strong>Sonuçlar yüklenemedi</strong><p>{results.error}</p><button className="ghost-btn" onClick={() => runSearch(0)}>Tekrar dene</button></div>
          )}
          {!results.error && results.loading && results.hits.length === 0 && Array.from({ length: 6 }, (_, i) => <div key={i} className="store-card skeleton" />)}
          {!results.error && !results.loading && results.hits.length === 0 && (
            <div className="empty"><strong>Sonuç yok</strong><p>{query ? `"${query}" için ${profile.mcVersion} sürümüne uygun içerik bulunamadı.` : `${profile.mcVersion} için bu kategoride içerik bulunamadı.`}</p></div>
          )}
          {results.hits.map((hit, i) => {
            const isPack = hit.type === 'modpack';
            const isInstalled = !isPack && installedIds.has(hit.id);
            const busy = pending[hit.id] || (isPack && packJobs.has(hit.title));
            return (
              <article key={hit.id} className="store-card" style={{ '--i': Math.min(i % 24, 12) }}>
                {hit.icon ? <img className="store-icon" src={hit.icon} alt="" loading="lazy" /> : <span className="store-icon placeholder">{hit.title[0]}</span>}
                <div className="store-text">
                  <div className="store-title">
                    <button className="link-title" onClick={() => api.shell.openExternal(`https://modrinth.com/${hit.type}/${hit.slug}`)}>{hit.title}</button>
                    <span className="muted small">{hit.author}</span>
                  </div>
                  <p className="store-desc">{hit.description}</p>
                  <div className="store-meta">
                    <span><IconDownload size={13} /> {formatCount(hit.downloads)}</span>
                    {isPack && hit.versions.length > 0 && <span className="tag">{hit.versions[hit.versions.length - 1]}</span>}
                    {hit.categories.slice(0, 3).map((c) => <span key={c} className="tag">{c}</span>)}
                  </div>
                </div>
                <button
                  className={`install-btn ${isInstalled ? 'done' : ''}`}
                  disabled={busy || isInstalled || (hit.type === 'mod' && profile.loader === 'vanilla')}
                  onClick={() => install(hit)}
                >
                  {busy ? <><span className="spinner small" /> {isPack ? 'Kuruluyor' : 'Yükleniyor'}</> : isInstalled ? <><IconCheck size={15} /> Yüklü</> : isPack ? 'Profil olarak kur' : 'Yükle'}
                </button>
              </article>
            );
          })}
          {conflict && (
            <Confirm
              title={`${conflict.hit.title} uyumsuz olabilir`}
              message={`${profile.name} profilindeki şu modlarla sorun çıkarabilir:`}
              confirmLabel={`${conflict.hit.title} yine de yükle`}
              onCancel={() => setConflict(null)}
              onConfirm={() => { const { hit } = conflict; setConflict(null); install(hit, true); }}
            >
              <ul className="conflict-list">
                {conflict.conflicts.map((c) => <li key={c.title}><strong>{c.title}</strong><span className="muted"> — {c.reason}</span></li>)}
              </ul>
            </Confirm>
          )}
          {!results.error && results.hits.length > 0 && results.hits.length < results.total && (
            <button className="ghost-btn load-more" disabled={results.loading} onClick={() => runSearch(results.hits.length)}>
              {results.loading ? 'Yükleniyor…' : 'Daha fazla göster'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function InstalledList({ items, profile, onChanged, onToast }) {
  const [issues, setIssues] = useState({});
  useEffect(() => {
    let alive = true;
    api.mods.analyze(profile.id).then((res) => alive && setIssues(res.ok ? res.data : {}));
    return () => { alive = false; };
  }, [items, profile.id]);
  const problemCount = Object.keys(issues).length;

  if (items.length === 0) {
    return (
      <div className="empty">
        <strong>{profile.name} profilinde içerik yok</strong>
        <p>Modlar, shader'lar ve kaynak paketleri yüklediğinde burada görünür. Klasöre elle attığın dosyalar da listelenir.</p>
      </div>
    );
  }
  const groups = [
    ['mod', 'Modlar'],
    ['shader', 'Shader paketleri'],
    ['resourcepack', 'Kaynak paketleri'],
  ];
  return (
    <div className="store-list">
      {problemCount > 0 && (
        <div className="notice warn-notice"><IconAlert size={16} /> {problemCount} modda olası sorun bulundu. Oyun çökerse önce bunlara bak.</div>
      )}
      {groups.map(([type, label]) => {
        const list = items.filter((i) => i.type === type);
        if (!list.length) return null;
        return (
          <div key={type} className="installed-group">
            <h3 className="group-title">{label} <span className="muted">{list.length}</span></h3>
            {list.map((item) => (
              <div key={item.file} className={`installed-row ${item.enabled ? '' : 'off'}`}>
                {item.icon ? <img className="store-icon small" src={item.icon} alt="" loading="lazy" /> : <span className="store-icon small placeholder">{item.title[0]}</span>}
                <div className="installed-text">
                  <strong>{item.title}</strong>
                  <span className="muted small">{item.version || item.file}</span>
                  {issues[item.file]?.map((text) => <span key={text} className="issue"><IconAlert size={12} /> {text}</span>)}
                </div>
                <Toggle
                  checked={item.enabled}
                  label={`${item.title} ${item.enabled ? 'devre dışı bırak' : 'etkinleştir'}`}
                  onChange={async (on) => { await api.mods.toggle(profile.id, item.type, item.file, on); onChanged(); }}
                />
                <button
                  className="icon-btn"
                  aria-label={`${item.title} kaldır`}
                  title="Kaldır"
                  onClick={async () => {
                    const res = await api.mods.remove(profile.id, item.type, item.file);
                    if (!res.ok) onToast({ tone: 'error', title: 'Kaldırılamadı', message: res.message });
                    onChanged();
                  }}
                >
                  <IconTrash size={16} />
                </button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ProfileSelect({ profiles, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = profiles.find((p) => p.id === value);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  if (!current) return null;
  return (
    <div className="pselect" ref={ref}>
      <button className="pselect-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ProfileGlyph profile={current} size={28} color={profileColor(current)} />
        <span className="pselect-text">
          <span className="muted small">Yüklenecek profil</span>
          <strong>{current.name}</strong>
        </span>
        <span className="muted small">{current.mcVersion} · {loaderLabel(current.loader)}</span>
        <IconChevron size={16} className={`picker-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <ul className="pselect-pop" role="listbox">
          {profiles.map((p) => (
            <li key={p.id}>
              <button role="option" aria-selected={p.id === value} className={p.id === value ? 'selected' : ''} onClick={() => { onChange(p.id); setOpen(false); }}>
                <ProfileGlyph profile={p} size={24} color={profileColor(p)} />
                <span className="pselect-name">{p.name}</span>
                <span className="muted small">{p.mcVersion} · {loaderLabel(p.loader)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export { ProfileSelect };
