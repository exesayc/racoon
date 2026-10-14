import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconRefresh, IconEdit, IconTrash, IconArrowUp, IconArrowDown, IconPlay, IconCheck } from '../icons.jsx';
import { Drawer, Confirm } from '../components.jsx';
import { parseMotd, loaderLabel } from '../lib.js';

const api = window.hexrona;

export default function Servers({ activeProfile, busy, onJoin, onToast }) {
  const [tab, setTab] = useState('mine');
  const [servers, setServers] = useState([]);
  const [status, setStatus] = useState({}); // id -> ping result | 'loading'
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const pingAll = useCallback((list) => {
    for (const s of list) {
      setStatus((st) => ({ ...st, [s.id]: 'loading' }));
      api.servers.ping(s.address).then((r) => setStatus((st) => ({ ...st, [s.id]: r })));
    }
  }, []);

  useEffect(() => {
    api.servers.list().then((list) => {
      setServers(list);
      pingAll(list);
    });
  }, [pingAll]);

  const saved = (list, changed) => {
    setServers(list);
    if (changed) pingAll(list.filter((s) => s.id === changed.id || s.address === changed.address));
  };

  return (
    <section className="servers">
      <header className="page-head">
        <div>
          <h2>Sunucular</h2>
          <p className="muted">
            Bağlan'a bastığında {activeProfile ? <><strong>{activeProfile.name}</strong> ({activeProfile.mcVersion} · {loaderLabel(activeProfile.loader)})</> : 'seçili profil'} ile doğrudan sunucuya girersin.
          </p>
        </div>
        <div className="head-actions">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>Listem</button>
            <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}>Keşfet</button>
          </div>
          {tab === 'mine' && <button className="ghost-btn" onClick={() => pingAll(servers)} disabled={!servers.length}><IconRefresh size={16} /> Yenile</button>}
          {tab === 'mine' && <button className="primary-btn" onClick={() => setEditing({})}><IconPlus size={16} /> Sunucu ekle</button>}
        </div>
      </header>

      {tab === 'discover' ? (
        <Discover
          myAddresses={new Set(servers.map((x) => x.address))}
          busy={busy || !activeProfile}
          onJoin={onJoin}
          onAdd={async (srv) => {
            const res = await api.servers.save({ name: srv.name, address: srv.address });
            if (res.ok) {
              saved(res.data, { address: srv.address });
              onToast({ tone: 'success', title: `${srv.name} listene eklendi` });
            }
          }}
        />
      ) : servers.length === 0 ? (
        <div className="empty">
          <strong>Sunucu listen boş</strong>
          <p>Sık girdiğin sunucuları ekle; oyuncu sayısını ve pingi buradan görürsün.</p>
          <button className="primary-btn" onClick={() => setEditing({})}><IconPlus size={16} /> Sunucu ekle</button>
        </div>
      ) : (
        <div className="server-list">
          {servers.map((s, i) => {
            const st = status[s.id];
            const loading = st === 'loading' || !st;
            const online = st && st !== 'loading' && st.online;
            return (
              <article key={s.id} className="server-row" style={{ '--i': i }}>
                {online && st.favicon ? <img className="server-icon" src={st.favicon} alt="" /> : <span className="server-icon placeholder">{s.name[0]?.toUpperCase()}</span>}
                <div className="server-text">
                  <div className="server-title">
                    <strong>{s.name}</strong>
                    <span className="muted small mono">{s.address}</span>
                  </div>
                  <p className="motd">
                    {loading ? <span className="muted">Bağlanılıyor…</span> : online ? <Motd text={st.motd} /> : <span className="offline">{st.error || 'Çevrimdışı'}</span>}
                  </p>
                </div>
                <div className="server-stats">
                  {online && (
                    <>
                      <span className="players"><strong>{st.players.online.toLocaleString('tr-TR')}</strong><span className="muted">/{st.players.max.toLocaleString('tr-TR')}</span></span>
                      <Signal latency={st.latency} />
                    </>
                  )}
                </div>
                <div className="server-actions">
                  <button className="icon-btn" aria-label={`${s.name} yukarı taşı`} disabled={i === 0} onClick={async () => setServers(await api.servers.move(s.id, -1))}><IconArrowUp size={15} /></button>
                  <button className="icon-btn" aria-label={`${s.name} aşağı taşı`} disabled={i === servers.length - 1} onClick={async () => setServers(await api.servers.move(s.id, 1))}><IconArrowDown size={15} /></button>
                  <button className="icon-btn" aria-label={`${s.name} düzenle`} title="Düzenle" onClick={() => setEditing(s)}><IconEdit size={15} /></button>
                  <button className="icon-btn" aria-label={`${s.name} sil`} title="Sil" onClick={() => setDeleting(s)}><IconTrash size={15} /></button>
                  <button className="row-play" disabled={busy || !activeProfile} onClick={() => onJoin(s.address)}><IconPlay size={13} /> Bağlan</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && <ServerEditor server={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={(list, changed) => { saved(list, changed); setEditing(null); }} />}
      {deleting && (
        <Confirm
          title={`${deleting.name} silinsin mi?`}
          message="Sunucu listenden kaldırılır."
          confirmLabel={`${deleting.name} sunucusunu sil`}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => { setServers(await api.servers.remove(deleting.id)); setDeleting(null); }}
        />
      )}
    </section>
  );
}

function Motd({ text }) {
  const lines = (text || '').split('\n').slice(0, 2);
  return lines.map((line, i) => (
    <span key={i} className="motd-line">
      {parseMotd(line).map((seg, j) => (
        <span key={j} style={{ color: seg.color, fontWeight: seg.bold ? 700 : undefined, fontStyle: seg.italic ? 'italic' : undefined }}>{seg.text}</span>
      ))}
    </span>
  ));
}

function Signal({ latency }) {
  const bars = latency == null ? 1 : latency < 80 ? 4 : latency < 150 ? 3 : latency < 300 ? 2 : 1;
  const tone = bars >= 3 ? 'good' : bars === 2 ? 'ok' : 'bad';
  return (
    <span className={`signal ${tone}`} title={latency == null ? 'Ping ölçülemedi' : `${latency} ms`}>
      <span className="bars" aria-hidden="true">{[1, 2, 3, 4].map((b) => <i key={b} className={b <= bars ? 'on' : ''} />)}</span>
      <span className="ms">{latency == null ? '—' : `${latency} ms`}</span>
    </span>
  );
}

function ServerEditor({ server, onClose, onSaved }) {
  const [name, setName] = useState(server?.name || '');
  const [address, setAddress] = useState(server?.address || '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e?.preventDefault();
    setSaving(true);
    const res = await api.servers.save({ id: server?.id, name, address });
    setSaving(false);
    if (!res.ok) return setError(res.message);
    onSaved(res.data, { id: server?.id, address: address.trim().toLowerCase() });
  };

  return (
    <Drawer
      title={server ? `${server.name} düzenle` : 'Sunucu ekle'}
      onClose={onClose}
      footer={<><button className="ghost-btn" onClick={onClose}>Vazgeç</button><button className="primary-btn" disabled={!address.trim() || saving} onClick={save}>{server ? 'Kaydet' : 'Sunucuyu ekle'}</button></>}
    >
      <form className="stack" onSubmit={save}>
        <div className="field">
          <label htmlFor="server-address">Sunucu adresi</label>
          <input id="server-address" className="mono" spellCheck={false} value={address} placeholder="mc.hypixel.net" onChange={(e) => { setAddress(e.target.value); setError(null); }} aria-invalid={!!error} />
          {error ? <span className="form-error">{error}</span> : <span className="hint">Port farklıysa sonuna ekle, ör. oyna.sunucu.com:25566</span>}
        </div>
        <div className="field">
          <label htmlFor="server-name">Görünen ad</label>
          <input id="server-name" maxLength={40} value={name} placeholder={address || 'Sunucum'} onChange={(e) => setName(e.target.value)} />
        </div>
      </form>
    </Drawer>
  );
}

const DISCOVER_FILTERS = [
  ['all', 'Tümü'],
  ['tr', 'Türk'],
  ['minigame', 'Minigame'],
  ['pvp', 'PvP'],
  ['survival', 'Survival'],
  ['skyblock', 'Skyblock'],
  ['rpg', 'RPG'],
];

function Discover({ myAddresses, busy, onJoin, onAdd }) {
  const [list, setList] = useState([]);
  const [status, setStatus] = useState({});
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.servers.discover().then((items) => {
      setList(items);
      for (const s of items) api.servers.ping(s.address).then((r) => setStatus((st) => ({ ...st, [s.address]: r })));
    });
  }, []);

  const visible = list
    .filter((s) => filter === 'all' || (filter === 'tr' ? s.region === 'tr' : s.tags.includes(filter)))
    .sort((a, b) => (status[b.address]?.players?.online || 0) - (status[a.address]?.players?.online || 0));

  return (
    <>
      <div className="filter-row">
        {DISCOVER_FILTERS.map(([id, label]) => (
          <button key={id} className={`chip ${filter === id ? 'on' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="server-list">
        {visible.length === 0 && <div className="empty compact"><strong>Bu kategoride sunucu yok</strong></div>}
        {visible.map((s, i) => {
          const st = status[s.address];
          const online = st?.online;
          const added = myAddresses.has(s.address);
          return (
            <article key={s.address} className="server-row" style={{ '--i': Math.min(i, 12) }}>
              {online && st.favicon ? <img className="server-icon" src={st.favicon} alt="" /> : <span className="server-icon placeholder">{s.name[0]}</span>}
              <div className="server-text">
                <div className="server-title">
                  <strong>{s.name}</strong>
                  {s.region === 'tr' && <span className="tag">TR</span>}
                  <span className="muted small mono">{s.address}</span>
                </div>
                <p className="server-desc">{s.description}</p>
                <div className="store-meta">{s.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
              </div>
              <div className="server-stats">
                {!st ? <span className="muted small">…</span> : online ? (
                  <>
                    <span className="players"><strong>{st.players.online.toLocaleString('tr-TR')}</strong><span className="muted"> oyuncu</span></span>
                    <Signal latency={st.latency} />
                  </>
                ) : <span className="offline small">Çevrimdışı</span>}
              </div>
              <div className="server-actions">
                <button className="ghost-btn" disabled={added} onClick={() => onAdd(s)}>{added ? <><IconCheck size={14} /> Listende</> : <><IconPlus size={14} /> Ekle</>}</button>
                <button className="row-play" disabled={busy || !online} onClick={() => onJoin(s.address)}><IconPlay size={13} /> Bağlan</button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
