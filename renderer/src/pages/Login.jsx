import { useState } from 'react';
import { logoUrl, loginBackgroundUrl } from '../assets.js';
import { usernameError } from '../lib.js';

const api = window.hexrona;

const MicrosoftMark = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

export default function Login({ version, onDone, onBack }) {
  const [msBusy, setMsBusy] = useState(false);
  const [msError, setMsError] = useState(null);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState(null);
  const nameError = usernameError(name.trim());

  const loginMicrosoft = async () => {
    setMsBusy(true);
    setMsError(null);
    const res = await api.accounts.addMicrosoft();
    setMsBusy(false);
    if (res.ok) onDone(res);
    else if (res.code !== 'cancelled') setMsError(res.message);
  };

  const loginOffline = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (nameError) return;
    const res = await api.accounts.addOffline(name.trim());
    if (res.ok) onDone(res);
    else setServerError(res.message);
  };

  return (
    <div className="login">
      <aside className="login-panel">
        <div className="login-brand">
          <img src={logoUrl} alt="" />
          <span>HEXRONA</span>
        </div>

        <div className="login-body">
          <h1>{onBack ? 'Hesap ekle' : 'Hoş geldin'}</h1>
          <p className="muted">Minecraft hesabınla giriş yap. Bilgilerini Hexrona değil, doğrudan Microsoft doğrular.</p>

          <button className="ms-btn" onClick={loginMicrosoft} disabled={msBusy}>
            {msBusy ? <span className="spinner dark" /> : <MicrosoftMark />}
            <span>{msBusy ? 'Açılan pencerede devam et…' : 'Microsoft ile giriş yap'}</span>
          </button>
          {msError && <p className="form-error" role="alert">{msError}</p>}

          <div className="divider"><span>veya</span></div>

          <form className="offline-form" onSubmit={loginOffline} noValidate>
            <label htmlFor="offline-name">Çevrimdışı kullanıcı adı</label>
            <input
              id="offline-name"
              maxLength={16}
              spellCheck={false}
              autoComplete="off"
              value={name}
              aria-invalid={touched && !!nameError}
              aria-describedby="offline-hint"
              onChange={(e) => { setName(e.target.value); setServerError(null); }}
              onBlur={() => name && setTouched(true)}
            />
            {touched && (nameError || serverError) ? (
              <span id="offline-hint" className="form-error">{nameError || serverError}</span>
            ) : (
              <span id="offline-hint" className="hint">Yalnızca tek oyunculu ve çevrimdışı sunucularda çalışır.</span>
            )}
            <button type="submit" className="secondary-btn">Çevrimdışı devam et</button>
          </form>
        </div>

        <footer className="login-foot">
          {onBack ? (
            <button className="link-btn" onClick={onBack}>← Launcher'a dön</button>
          ) : (
            <span>Hexrona {version ? `v${version}` : ''}</span>
          )}
          <span>Mojang AB ile bağlantılı değildir.</span>
        </footer>
      </aside>

      <div className="login-art" aria-hidden="true">
        {loginBackgroundUrl && <img src={loginBackgroundUrl} alt="" />}
      </div>
    </div>
  );
}
