import { useEffect, useRef, useState } from 'react';
import { IconChevron, IconPlus, IconLogout } from './icons.jsx';
import { accountKind, avatarUrl } from './lib.js';

function Avatar({ account, size = 28 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [account.id]);
  if (failed) {
    return <span className="avatar avatar-fallback" style={{ width: size, height: size }}>{account.name[0]?.toUpperCase()}</span>;
  }
  return <img className="avatar" style={{ width: size, height: size }} src={avatarUrl(account, size * 2)} alt="" onError={() => setFailed(true)} />;
}

export { Avatar };

/** Account switcher in the title bar. Opens on hover (with intent delay) or click. */
export default function ProfileMenu({ accounts, activeId, onSelect, onAdd, onLogout, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);
  const active = accounts.find((a) => a.id === activeId);
  const others = accounts.filter((a) => a.id !== activeId);

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

  const hover = (next) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), next ? 120 : 220);
  };

  if (!active) return null;

  return (
    <div className="profile" ref={ref} onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)}>
      <button className={`profile-trigger ${open ? 'open' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar account={active} size={24} />
        <span className="profile-name">{active.name}</span>
        <IconChevron size={14} className="profile-chevron" />
      </button>

      {open && (
        <div className="profile-menu" role="menu">
          <div className="profile-card">
            <Avatar account={active} size={44} />
            <div>
              <strong>{active.name}</strong>
              <span className={`kind kind-${active.type}`}>{accountKind(active)}</span>
            </div>
          </div>

          {others.length > 0 && (
            <>
              <p className="menu-label">Hesap değiştir</p>
              {others.map((a) => (
                <button key={a.id} role="menuitem" className="menu-item" disabled={disabled} onClick={() => { onSelect(a.id); setOpen(false); }}>
                  <Avatar account={a} size={22} />
                  <span className="menu-item-text">{a.name}</span>
                  <span className="menu-item-meta">{a.type === 'microsoft' ? 'Microsoft' : 'Çevrimdışı'}</span>
                </button>
              ))}
            </>
          )}

          <div className="menu-sep" />
          <button role="menuitem" className="menu-item" onClick={() => { setOpen(false); onAdd(); }}>
            <span className="menu-icon"><IconPlus size={16} /></span>
            <span className="menu-item-text">Hesap ekle</span>
          </button>
          <button role="menuitem" className="menu-item danger" disabled={disabled} onClick={() => { setOpen(false); onLogout(active); }}>
            <span className="menu-icon"><IconLogout size={16} /></span>
            <span className="menu-item-text">{active.name} hesabından çıkış yap</span>
          </button>
        </div>
      )}
    </div>
  );
}
