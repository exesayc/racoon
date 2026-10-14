import { useState } from 'react';
import { IconPlus, IconCheck, IconX, IconPlay, IconRefresh, IconTrash } from '../icons.jsx';
import { Confirm } from '../components.jsx';
import { loaderLabel, relativeTime, USERNAME_RE } from '../lib.js';

const api = window.hexrona;
const avatar = (uuid) => `https://mc-heads.net/avatar/${uuid}/64`;

export default function Friends({ social, system, busy, onJoin, onAddAccount }) {
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [removing, setRemoving] = useState(null);
  const status = social?.status || 'idle';

  if (!system?.socialConfigured || status === 'disabled') {
    return (
      <section className="friends">
        <Head />
        <div className="empty">
          <strong>Arkadaş sunucusu henüz ayarlanmadı</strong>
          <p>Arkadaş listesi için Hexrona sunucusunun çalışması gerekiyor. Kurulum adımları README dosyasında.</p>
        </div>
      </section>
    );
  }
  if (status === 'offline-account' || status === 'no-account') {
    return (
      <section className="friends">
        <Head />
        <div className="empty">
          <strong>Arkadaşlar için Microsoft hesabı gerekiyor</strong>
          <p>Çevrimdışı hesaplar doğrulanamadığı için arkadaş listesi kullanılamıyor.</p>
          <button className="primary-btn" onClick={onAddAccount}><IconPlus size={16} /> Microsoft hesabı ekle</button>
        </div>
      </section>
    );
  }

  const friends = [...(social.friends || [])].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  const incoming = social.incoming || [];
  const outgoing = social.outgoing || [];
  const nameError = !name ? null : !USERNAME_RE.test(name.trim()) ? 'Geçerli bir Minecraft adı gir.' : null;

  const add = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!name.trim() || nameError) return;
    api.social.send({ t: 'friend.add', name: name.trim() });
    setName('');
    setTouched(false);
  };

  const online = friends.filter((f) => f.status !== 'offline').length;

  return (
    <section className="friends">
      <Head>
        {status === 'connected' ? (
          <span className="conn ok"><i /> Bağlı · {social.me?.name}</span>
        ) : status === 'connecting' ? (
          <span className="conn"><i /> Bağlanıyor…</span>
        ) : (
          <button className="ghost-btn" onClick={api.social.retry}><IconRefresh size={16} /> Tekrar bağlan</button>
        )}
      </Head>

      {status === 'error' && <div className="notice">{social.error}</div>}

      <form className="add-friend" onSubmit={add} noValidate>
        <div className="field grow">
          <label htmlFor="friend-name">Arkadaş ekle</label>
          <input id="friend-name" spellCheck={false} maxLength={16} placeholder="Minecraft adı" value={name} aria-invalid={touched && !!nameError} onChange={(e) => setName(e.target.value)} onBlur={() => name && setTouched(true)} />
          {touched && nameError ? <span className="form-error">{nameError}</span> : <span className="hint">Arkadaşının da Hexrona'ya en az bir kez Microsoft hesabıyla girmiş olması gerekir.</span>}
        </div>
        <button type="submit" className="primary-btn" disabled={status !== 'connected'}><IconPlus size={16} /> İstek gönder</button>
      </form>

      {incoming.length > 0 && (
        <div className="friend-group">
          <h3 className="group-title">Gelen istekler <span className="muted">{incoming.length}</span></h3>
          {incoming.map((r) => (
            <div key={r.uuid} className="friend-row request">
              <img className="friend-avatar" src={avatar(r.uuid)} alt="" />
              <div className="friend-text"><strong>{r.name}</strong><span className="muted small">Seni arkadaş olarak eklemek istiyor</span></div>
              <div className="friend-actions">
                <button className="ghost-btn" onClick={() => api.social.send({ t: 'friend.decline', uuid: r.uuid })}><IconX size={15} /> Reddet</button>
                <button className="primary-btn" onClick={() => api.social.send({ t: 'friend.accept', uuid: r.uuid })}><IconCheck size={15} /> Kabul et</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="friend-group">
        <h3 className="group-title">Arkadaşlar <span className="muted">{online}/{friends.length} çevrimiçi</span></h3>
        {friends.length === 0 ? (
          <div className="empty compact"><strong>Henüz arkadaşın yok</strong><p>Yukarıdan Minecraft adıyla arkadaşını ekle.</p></div>
        ) : (
          friends.map((f) => (
            <div key={f.uuid} className={`friend-row is-${f.status}`}>
              <span className="friend-avatar-wrap">
                <img className="friend-avatar" src={avatar(f.uuid)} alt="" />
                <i className={`presence-dot ${f.status}`} />
              </span>
              <div className="friend-text">
                <strong>{f.name}</strong>
                <span className="small">{describe(f)}</span>
              </div>
              <div className="friend-actions">
                {f.activity?.server && (
                  <button className="row-play" disabled={busy} onClick={() => onJoin(f.activity.server)} title={`${f.activity.server} sunucusuna seçili profille katıl`}>
                    <IconPlay size={13} /> Katıl
                  </button>
                )}
                <button className="icon-btn" aria-label={`${f.name} arkadaşlıktan çıkar`} title="Arkadaşlıktan çıkar" onClick={() => setRemoving(f)}><IconTrash size={15} /></button>
              </div>
            </div>
          ))
        )}
      </div>

      {outgoing.length > 0 && (
        <div className="friend-group">
          <h3 className="group-title">Gönderilen istekler <span className="muted">{outgoing.length}</span></h3>
          {outgoing.map((r) => (
            <div key={r.uuid} className="friend-row muted-row">
              <img className="friend-avatar" src={avatar(r.uuid)} alt="" />
              <div className="friend-text"><strong>{r.name}</strong><span className="muted small">Yanıt bekleniyor</span></div>
              <button className="ghost-btn" onClick={() => api.social.send({ t: 'friend.cancel', uuid: r.uuid })}>İsteği geri çek</button>
            </div>
          ))}
        </div>
      )}

      {removing && (
        <Confirm
          title={`${removing.name} arkadaşlıktan çıkarılsın mı?`}
          message="İkiniz de birbirinizi listeden kaybedersiniz. Sonra tekrar istek gönderebilirsin."
          confirmLabel={`${removing.name} kişisini çıkar`}
          onCancel={() => setRemoving(null)}
          onConfirm={() => { api.social.send({ t: 'friend.remove', uuid: removing.uuid }); setRemoving(null); }}
        />
      )}
    </section>
  );
}

function Head({ children }) {
  return (
    <header className="page-head">
      <div>
        <h2>Arkadaşlar</h2>
        <p className="muted">Kimin çevrimiçi olduğunu ve hangi sunucuda oynadığını gör, tek tıkla yanlarına katıl.</p>
      </div>
      {children}
    </header>
  );
}

const rank = (f) => (f.status === 'playing' ? 0 : f.status === 'online' ? 1 : 2);

function describe(f) {
  if (f.status === 'playing') {
    const loader = f.activity?.loader && f.activity.loader !== 'vanilla' ? ` · ${loaderLabel(f.activity.loader)}` : '';
    const where = f.activity?.server ? `${f.activity.server} sunucusunda` : 'Tek oyunculu';
    return <span className="playing-text">{where} · {f.activity?.mcVersion}{loader}</span>;
  }
  if (f.status === 'online') return <span className="online-text">Launcher'da</span>;
  return <span className="muted">{f.lastSeen ? `Son görülme: ${relativeTime(f.lastSeen)}` : 'Çevrimdışı'}</span>;
}
