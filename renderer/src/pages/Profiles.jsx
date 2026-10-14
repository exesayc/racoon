import { useEffect, useState } from 'react';
import { IconPlay, IconPlus, IconFolder, IconEdit, IconTrash, IconClock, IconSparkle } from '../icons.jsx';
import { Drawer, Confirm, ProfileGlyph } from '../components.jsx';
import VersionList from '../VersionList.jsx';
import Stats from './Stats.jsx';
import { LOADERS, loaderLabel, profileColor, relativeTime, formatDuration, PROFILE_COLORS } from '../lib.js';

const api = window.hexrona;

export default function Profiles({ profiles, catalog, system, busy, activeGameProfile, jobs, onChange, onPlay, onToast }) {
  const [tab, setTab] = useState('list');
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // profile object, or {} for new
  const [deleting, setDeleting] = useState(null);
  const [deleteFiles, setDeleteFiles] = useState(true);

  const sorted = [...profiles.profiles].sort((a, b) => (b.lastPlayed || b.createdAt) - (a.lastPlayed || a.createdAt));
  useEffect(() => { api.templates.list().then(setTemplates); }, []);
  const runningTemplates = new Set((jobs || []).filter((j) => j.status === 'running').map((j) => j.title));

  const useTemplate = async (t) => {
    await api.templates.install(t.id);
    onToast({ tone: 'success', title: `${t.name} hazırlanıyor`, message: 'Modlar arka planda yükleniyor; ilerlemeyi sağ altta görebilirsin.' });
  };

  return (
    <section className="profiles">
      <header className="page-head">
        <div>
          <h2>Profiller</h2>
          <p className="muted">Her profilin kendi sürümü, mod yükleyicisi, modları ve dünyaları olur.</p>
        </div>
        <div className="head-actions">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'list'} className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>Profiller</button>
            <button role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>İstatistikler</button>
          </div>
          <button className="primary-btn" onClick={() => setEditing({})}><IconPlus size={16} /> Yeni profil</button>
        </div>
      </header>

      {tab === 'stats' ? (
        <Stats profiles={profiles.profiles} />
      ) : (
      <>
      {templates.length > 0 && (
        <div className="templates">
          <h3 className="group-title"><IconSparkle size={14} /> Hızlı başla</h3>
          <div className="template-grid">
            {templates.map((t, i) => {
              const pending = runningTemplates.has(t.name);
              return (
                <button key={t.id} className="template-card" style={{ '--c': t.color, '--i': i }} disabled={pending} onClick={() => useTemplate(t)}>
                  <span className="template-bar" />
                  <strong>{t.name}</strong>
                  <span className="template-desc">{t.description}</span>
                  <span className="template-meta">{pending ? 'Hazırlanıyor…' : t.loader === 'vanilla' ? `Vanilla ${t.mcVersion}` : `${loaderLabel(t.loader)} · ${t.contentCount} içerik`}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="empty">
          <strong>Henüz profil yok</strong>
          <p>Bir sürüm ve mod yükleyici seçerek ilk profilini oluştur.</p>
          <button className="primary-btn" onClick={() => setEditing({})}><IconPlus size={16} /> Profil oluştur</button>
        </div>
      ) : (
        <div className="profile-grid">
          {sorted.map((p, i) => {
            const isActive = p.id === profiles.activeId;
            const running = activeGameProfile === p.id;
            return (
              <article key={p.id} className={`pcard ${isActive ? 'active' : ''}`} style={{ '--i': i, '--c': profileColor(p) }}>
                <button className="pcard-main" onClick={() => api.profiles.select(p.id).then(onChange)} aria-pressed={isActive}>
                  <ProfileGlyph profile={p} size={44} color={profileColor(p)} />
                  <span className="pcard-text">
                    <strong>{p.name}</strong>
                    <span>{p.mcVersion || 'Sürüm seçilmedi'} · {loaderLabel(p.loader)}{p.modpack ? ' · Modpack' : ''}</span>
                  </span>
                  {isActive && <span className="active-pill">Seçili</span>}
                </button>
                <div className="pcard-foot">
                  <span className="muted small pcard-time">
                    {running ? 'Şu an açık' : relativeTime(p.lastPlayed)}
                    {p.playTimeMs > 0 && <><span className="dot" /><IconClock size={12} /> {formatDuration(p.playTimeMs)}</>}
                  </span>
                  <div className="pcard-actions">
                    <button className="icon-btn" title="Klasörü aç" aria-label={`${p.name} klasörünü aç`} onClick={() => api.profiles.openDir(p.id)}><IconFolder size={16} /></button>
                    <button className="icon-btn" title="Düzenle" aria-label={`${p.name} profilini düzenle`} onClick={() => setEditing(p)}><IconEdit size={16} /></button>
                    <button className="icon-btn" title="Sil" aria-label={`${p.name} profilini sil`} disabled={running} onClick={() => { setDeleteFiles(!p.shared); setDeleting(p); }}><IconTrash size={16} /></button>
                    <button className="row-play" disabled={busy} onClick={() => onPlay(p.id)}><IconPlay size={13} /> Oyna</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      </>
      )}

      {editing && (
        <ProfileEditor
          profile={editing.id ? editing : null}
          catalog={catalog}
          system={system}
          onClose={() => setEditing(null)}
          onSaved={(next) => { onChange(next); setEditing(null); }}
        />
      )}

      {deleting && (
        <Confirm
          title={`"${deleting.name}" silinsin mi?`}
          message="Profil listeden kaldırılır. Bu işlem geri alınamaz."
          confirmLabel={`${deleting.name} profilini sil`}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            onChange(await api.profiles.remove(deleting.id, deleteFiles));
            setDeleting(null);
          }}
        >
          {!deleting.shared && (
            <label className="check-row">
              <input type="checkbox" checked={deleteFiles} onChange={(e) => setDeleteFiles(e.target.checked)} />
              Dünyaları, modları ve ayarları da sil
            </label>
          )}
        </Confirm>
      )}
    </section>
  );
}

function ProfileEditor({ profile, catalog, system, onClose, onSaved }) {
  const isNew = !profile;
  const [name, setName] = useState(profile?.name || '');
  const [mcVersion, setMcVersion] = useState(profile?.mcVersion || catalog.latest?.release || '');
  const [loader, setLoader] = useState(profile?.loader || 'vanilla');
  const [loaderVersion, setLoaderVersion] = useState(profile?.loaderVersion || null);
  const [loaderList, setLoaderList] = useState({ loading: false, versions: [], error: null });
  const [ramMb, setRamMb] = useState(profile?.ramMb || 0);
  const [jvmArgs, setJvmArgs] = useState(profile?.jvmArgs || '');
  const [color, setColor] = useState(profile?.color || '');
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Load loader versions whenever the game version or loader changes.
  useEffect(() => {
    if (loader === 'vanilla' || !mcVersion) {
      setLoaderList({ loading: false, versions: [], error: null });
      return;
    }
    let alive = true;
    setLoaderList({ loading: true, versions: [], error: null });
    api.profiles.loaderVersions(loader, mcVersion).then((res) => {
      if (!alive) return;
      if (!res.ok) return setLoaderList({ loading: false, versions: [], error: res.message });
      setLoaderList({ loading: false, versions: res.data, error: null });
      setLoaderVersion((current) =>
        res.data.some((v) => v.version === current) ? current : (res.data.find((v) => v.stable) || res.data[0])?.version || null,
      );
    });
    return () => { alive = false; };
  }, [loader, mcVersion]);

  const unsupported = loader !== 'vanilla' && !loaderList.loading && !loaderList.error && loaderList.versions.length === 0;
  const canSave = mcVersion && (loader === 'vanilla' || loaderVersion) && !saving;
  const fallbackName = loader === 'vanilla' ? `Minecraft ${mcVersion}` : `${loaderLabel(loader)} ${mcVersion}`;
  const totalMb = system?.totalMemMb || 8192;
  const maxRam = Math.max(2048, Math.floor((totalMb * 0.75) / 512) * 512);
  const visibleLoaderVersions = showAll ? loaderList.versions : loaderList.versions.filter((v, i) => v.stable || i < 1).slice(0, 12);

  const save = async () => {
    setSaving(true);
    const data = { name: name.trim() || fallbackName, mcVersion, loader, loaderVersion: loader === 'vanilla' ? null : loaderVersion, ramMb: ramMb || null, jvmArgs, color };
    const next = isNew ? await api.profiles.create(data) : await api.profiles.update(profile.id, data);
    onSaved(next);
  };

  return (
    <Drawer
      wide
      title={isNew ? 'Yeni profil' : `${profile.name} profilini düzenle`}
      subtitle={isNew ? 'Sürümü ve mod yükleyiciyi seç; dosyalar ilk açılışta indirilir.' : 'Sürüm değişirse gerekli dosyalar bir sonraki açılışta indirilir.'}
      onClose={onClose}
      footer={
        <>
          <button className="ghost-btn" onClick={onClose}>Vazgeç</button>
          <button className="primary-btn" disabled={!canSave} onClick={save}>{isNew ? 'Profili oluştur' : 'Değişiklikleri kaydet'}</button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label htmlFor="profile-name">Profil adı</label>
          <input id="profile-name" maxLength={40} value={name} placeholder={fallbackName} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <span className="field-label">Renk</span>
          <div className="swatches" role="radiogroup" aria-label="Profil rengi">
            {PROFILE_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={`swatch ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
      </div>

      <div className="field">
        <span className="field-label">Mod yükleyici</span>
        <div className="segmented five" role="radiogroup" aria-label="Mod yükleyici">
          {LOADERS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={loader === l.id} className={loader === l.id ? 'active' : ''} onClick={() => setLoader(l.id)}>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field-label">Minecraft sürümü <strong className="field-value">{mcVersion || '—'}</strong></span>
        <VersionList catalog={catalog} selected={mcVersion} onSelect={setMcVersion} />
      </div>

      {loader !== 'vanilla' && (
        <div className="field">
          <span className="field-label">{loaderLabel(loader)} sürümü</span>
          {loaderList.loading && <p className="hint">Sürümler yükleniyor…</p>}
          {loaderList.error && <p className="form-error">{loaderList.error}</p>}
          {unsupported && <p className="form-error">{loaderLabel(loader)}, Minecraft {mcVersion} için mevcut değil. Başka bir sürüm ya da mod yükleyici seç.</p>}
          {visibleLoaderVersions.length > 0 && (
            <div className="chips">
              {visibleLoaderVersions.map((v) => (
                <button key={v.version} type="button" aria-pressed={loaderVersion === v.version} className={`chip ${loaderVersion === v.version ? 'on' : ''}`} onClick={() => setLoaderVersion(v.version)}>
                  {v.version}
                  {v.tag ? <small>{v.tag}</small> : !v.stable ? <small>Beta</small> : null}
                </button>
              ))}
              {!showAll && loaderList.versions.length > visibleLoaderVersions.length && (
                <button type="button" className="chip ghost" onClick={() => setShowAll(true)}>Tümünü göster ({loaderList.versions.length})</button>
              )}
            </div>
          )}
        </div>
      )}

      <details className="advanced">
        <summary>Gelişmiş</summary>
        <div className="field">
          <span className="field-label">Bellek <strong className="field-value">{ramMb ? `${(ramMb / 1024).toFixed(1)} GB` : 'Genel ayarı kullan'}</strong></span>
          <div className="ram">
            <input
              type="range"
              min={0}
              max={maxRam}
              step={512}
              value={ramMb}
              aria-label="Bu profile ayrılan bellek"
              style={{ '--fill': `${(ramMb / maxRam) * 100}%` }}
              onChange={(e) => setRamMb(Number(e.target.value) < 1024 ? 0 : Number(e.target.value))}
            />
          </div>
          <p className="hint">En solda bırakırsan Ayarlar'daki bellek değeri kullanılır.</p>
        </div>
        <div className="field">
          <label htmlFor="profile-jvm">Ek JVM argümanları</label>
          <input id="profile-jvm" className="mono" spellCheck={false} value={jvmArgs} placeholder="-XX:+UseZGC" onChange={(e) => setJvmArgs(e.target.value)} />
          <p className="hint">Genel JVM argümanlarına eklenir. Emin değilsen boş bırak.</p>
        </div>
      </details>
    </Drawer>
  );
}
