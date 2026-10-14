import { useEffect, useRef, useState } from 'react';
import { IconPlay, IconChevron, IconPlus, IconEdit } from '../icons.jsx';
import { ProfileGlyph } from '../components.jsx';
import { formatBytes, formatEta, formatSpeed, loaderLabel, profileColor, relativeTime } from '../lib.js';

export default function Home({ profiles, game, progress, speed, onPlay, onCancel, onSelectProfile, onManageProfiles }) {
  const profile = profiles.profiles.find((p) => p.id === profiles.activeId) || profiles.profiles[0];
  const recent = profiles.profiles
    .filter((p) => p.id !== profile?.id)
    .sort((a, b) => (b.lastPlayed || b.createdAt) - (a.lastPlayed || a.createdAt))
    .slice(0, 3);
  const locked = game.status === 'installing' || game.status === 'launching';

  return (
    <section className="home">
      <div className="hero">
        {profile ? (
          <>
            <p className="eyebrow" lang="en">Minecraft: Java Edition</p>
            <h1 className="hero-title">{profile.name}</h1>
            <p className="hero-meta">
              <span>{profile.mcVersion}</span>
              <span className="dot" />
              <span>{loaderLabel(profile.loader)}{profile.loaderVersion ? ` ${profile.loaderVersion}` : ''}</span>
              <span className="dot" />
              <span>{relativeTime(profile.lastPlayed)}</span>
            </p>
          </>
        ) : (
          <>
            <h1 className="hero-title">Hoş geldin</h1>
            <p className="hero-meta">Başlamak için bir profil oluştur.</p>
          </>
        )}

        {recent.length > 0 && (
          <div className="quick-picks" role="group" aria-label="Diğer profiller">
            {recent.map((p) => (
              <button key={p.id} className="quick-chip" disabled={locked} onClick={() => onSelectProfile(p.id)}>
                <span className="chip-dot" style={{ background: profileColor(p) }} />
                <span className="quick-id">{p.name}</span>
                <span className="quick-caption">{p.mcVersion}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="dock">
        {progress && game.status === 'installing' && <ProgressBar progress={progress} speed={speed} />}
        <div className="dock-row">
          <ProfilePicker profiles={profiles} current={profile} disabled={locked} onSelect={onSelectProfile} onManage={onManageProfiles} />
          {profile ? (
            <PlayButton game={game} onPlay={() => onPlay(profile.id)} onCancel={onCancel} />
          ) : (
            <button className="play-btn" onClick={onManageProfiles}><IconPlus size={20} /><span>PROFİL OLUŞTUR</span></button>
          )}
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ progress, speed }) {
  const pct = progress.total > 0 ? Math.min(100, (progress.done / progress.total) * 100) : null;
  const eta = speed > 0 && progress.total > 0 ? formatEta((progress.total - progress.done) / speed) : '';
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-meta">
        <span>{progress.stage}</span>
        <span className="progress-num">
          {pct === null ? 'Hazırlanıyor…' : `${formatBytes(progress.done)} / ${formatBytes(progress.total)} · %${pct.toFixed(0)}`}
          {speed > 0 && <span className="speed"> · {formatSpeed(speed)}{eta ? ` · ${eta}` : ''}</span>}
        </span>
      </div>
      <div className={`progress-track ${pct === null ? 'indeterminate' : ''}`}>
        <div className="progress-fill" style={{ width: pct === null ? undefined : `${pct}%` }} />
      </div>
    </div>
  );
}

function PlayButton({ game, onPlay, onCancel }) {
  const { status } = game;
  if (status === 'installing') return <button className="play-btn is-busy" onClick={onCancel}><span>İptal et</span></button>;
  if (status === 'launching') return <button className="play-btn is-busy" disabled><span className="spinner" /><span>Başlatılıyor</span></button>;
  if (status === 'running') return <button className="play-btn is-running" onClick={onCancel}><span className="live-dot" /><span>Oyunu kapat</span></button>;
  return <button className="play-btn" onClick={onPlay}><IconPlay size={20} /><span>OYNA</span></button>;
}

function ProfilePicker({ profiles, current, disabled, onSelect, onManage }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="picker" ref={ref}>
      <button className="picker-trigger" disabled={disabled} aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((o) => !o)}>
        {current && <ProfileGlyph profile={current} size={34} color={profileColor(current)} />}
        <span className="picker-text">
          <span className="picker-label">Profil</span>
          <span className="picker-value">{current ? current.name : 'Profil yok'}</span>
        </span>
        {current && <span className="picker-side">{current.mcVersion} · {loaderLabel(current.loader)}</span>}
        <IconChevron size={18} className={`picker-chevron ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <div className="picker-pop">
          <ul role="listbox" className="picker-list">
            {profiles.profiles.map((p) => (
              <li key={p.id}>
                <button role="option" aria-selected={p.id === current?.id} className={p.id === current?.id ? 'selected' : ''} onClick={() => { onSelect(p.id); setOpen(false); }}>
                  <span className="picker-row-main">
                    <ProfileGlyph profile={p} size={24} color={profileColor(p)} />
                    {p.name}
                  </span>
                  <span className="muted small">{p.mcVersion} · {loaderLabel(p.loader)}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="picker-all" onClick={() => { setOpen(false); onManage(); }}><IconEdit size={14} /> Profilleri yönet</button>
        </div>
      )}
    </div>
  );
}
