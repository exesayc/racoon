import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from './icons.jsx';

/** Right-side slide-over for editing without leaving the page. Traps focus, closes on Esc. */
export function Drawer({ title, subtitle, onClose, children, footer, wide }) {
  const panel = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.querySelector('input, button, select, textarea')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll('button:not(:disabled), input, select, textarea, a[href]')];
      if (!items.length) return;
      const first = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastItem.focus(); }
      else if (!e.shiftKey && document.activeElement === lastItem) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  // Portal out of .content so the layer isn't trapped in its stacking context.
  return createPortal(
    <div className="drawer-layer">
      <div className="drawer-scrim" onClick={onClose} />
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <header className="drawer-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button className="icon-btn" aria-label="Kapat" onClick={onClose}><IconX size={18} /></button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

/** Small centered confirm for destructive actions; the action is named on the button. */
export function Confirm({ title, message, confirmLabel, onConfirm, onCancel, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return createPortal(
    <div className="drawer-layer center">
      <div className="drawer-scrim" onClick={onCancel} />
      <div className="confirm" role="alertdialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>
        <p className="muted">{message}</p>
        {children}
        <div className="confirm-actions">
          <button className="ghost-btn" onClick={onCancel} autoFocus>Vazgeç</button>
          <button className="danger-btn" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ProfileGlyph({ profile, size = 40, color }) {
  return (
    <span className="profile-glyph" style={{ width: size, height: size, '--c': color, fontSize: size * 0.42 }}>
      {(profile.name || '?').trim()[0]?.toUpperCase()}
    </span>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`toggle ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}
