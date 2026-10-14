import { useEffect, useState } from 'react';
import { IconFolder, IconPlus, IconTrash } from '../icons.jsx';
import { accountKind } from '../lib.js';
import { Avatar } from '../ProfileMenu.jsx';
import { Toggle } from '../components.jsx';

const api = window.hexrona;

const AFTER_LAUNCH = [
  { id: 'hide', label: 'Gizle', hint: 'Oyun kapanınca geri gelir' },
  { id: 'keep', label: 'Açık bırak', hint: 'Konsolu izleyebilirsin' },
  { id: 'close', label: 'Kapat', hint: 'Launcher tamamen kapanır' },
];

export default function Settings({ settings, system, accounts, busy, onChange, onAddAccount, onSelectAccount, onRemoveAccount, onToast }) {
  const totalMb = system?.totalMemMb || 8192;
  const maxRam = Math.max(2048, Math.floor((totalMb * 0.75) / 512) * 512);
  const recommended = Math.min(8192, Math.max(2048, Math.floor(totalMb / 4 / 512) * 512));

  return (
    <section className="settings">
      <header className="page-head">
        <div>
          <h2>Ayarlar</h2>
          <p className="muted">Değişiklikler otomatik kaydedilir.</p>
        </div>
      </header>

      <div className="settings-grid">
        <Card title="Hesaplar" desc="Oyuna hangi hesapla gireceğini seç.">
          <ul className="account-list">
            {accounts.accounts.map((a) => {
              const active = a.id === accounts.activeId;
              return (
                <li key={a.id} className={active ? 'active' : ''}>
                  <button className="account-row" disabled={busy || active} onClick={() => onSelectAccount(a.id)} aria-pressed={active}>
                    <Avatar account={a} size={32} />
                    <span className="account-row-text">
                      <strong>{a.name}</strong>
                      <span>{accountKind(a)}{active ? ' · Aktif' : ''}</span>
                    </span>
                  </button>
                  <button className="icon-btn" disabled={busy} aria-label={`${a.name} hesabını kaldır`} title="Hesabı kaldır" onClick={() => onRemoveAccount(a)}>
                    <IconTrash size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
          <button className="ghost-btn" onClick={onAddAccount}><IconPlus size={16} /> Hesap ekle</button>
        </Card>

        <Card title="Bellek (RAM)" desc={`Bilgisayarında ${(totalMb / 1024).toFixed(1)} GB RAM var. Önerilen: ${recommended / 1024} GB.`}>
          <div className="ram">
            <input
              type="range"
              min={1024}
              max={maxRam}
              step={512}
              value={Math.min(settings.ramMb, maxRam)}
              aria-label="Oyuna ayrılan bellek"
              style={{ '--fill': `${((Math.min(settings.ramMb, maxRam) - 1024) / (maxRam - 1024)) * 100}%` }}
              onChange={(e) => onChange({ ramMb: Number(e.target.value) })}
            />
            <output className="ram-value">{(settings.ramMb / 1024).toFixed(1)} GB</output>
          </div>
          {settings.ramMb > totalMb / 2 && (
            <p className="hint warn">Çok fazla RAM ayırmak bilgisayarının geri kalanını yavaşlatabilir.</p>
          )}
        </Card>

        <Card title="Oyun klasörü" desc="Sürümler, dünyalar, mod ve kaynak paketleri burada tutulur.">
          <div className="path-row">
            <code className="path" title={settings.gameDir}>{settings.gameDir}</code>
            <button className="ghost-btn" onClick={api.shell.openGameDir}><IconFolder size={16} /> Aç</button>
            <button
              className="ghost-btn"
              onClick={async () => {
                const dir = await api.shell.pickDir();
                if (dir) onChange({ gameDir: dir });
              }}
            >
              Değiştir
            </button>
          </div>
        </Card>

        <Card title="Oyun açılınca" desc="Minecraft başladığında launcher ne yapsın?">
          <div className="segmented" role="radiogroup" aria-label="Oyun açılınca">
            {AFTER_LAUNCH.map((o) => (
              <button
                key={o.id}
                role="radio"
                aria-checked={settings.afterLaunch === o.id}
                className={settings.afterLaunch === o.id ? 'active' : ''}
                onClick={() => onChange({ afterLaunch: o.id })}
              >
                <span>{o.label}</span>
                <small>{o.hint}</small>
              </button>
            ))}
          </div>
        </Card>
        <Card title="Discord" desc="Discord profilinde Hexrona ile ne oynadığını gösterir.">
          <div className="setting-row">
            <span>
              <strong>Discord'da durumu göster</strong>
              <span className="hint">{system?.discordConfigured ? 'Discord açıkken otomatik bağlanır.' : 'Discord uygulama kimliği henüz eklenmedi (package.json → hexrona.discordClientId).'}</span>
            </span>
            <Toggle checked={settings.discordRpc && !!system?.discordConfigured} disabled={!system?.discordConfigured} label="Discord'da durumu göster" onChange={(v) => onChange({ discordRpc: v })} />
          </div>
        </Card>

        <AppearanceCard settings={settings} onChange={onChange} onToast={onToast} />

        <Card title="İndirme" desc="Oyun, mod ve modpack indirmelerinin hızı.">
          <div className="field">
            <span className="field-label">Hız sınırı <strong className="field-value">{settings.downloadLimitMb ? `${settings.downloadLimitMb} MB/s` : 'Sınırsız'}</strong></span>
            <div className="chips" role="radiogroup" aria-label="İndirme hız sınırı">
              {[0, 1, 2, 5, 10, 20].map((mb) => (
                <button key={mb} role="radio" aria-checked={settings.downloadLimitMb === mb} className={`chip ${settings.downloadLimitMb === mb ? 'on' : ''}`} onClick={() => onChange({ downloadLimitMb: mb })}>
                  {mb ? `${mb} MB/s` : 'Sınırsız'}
                </button>
              ))}
            </div>
            <p className="hint">İndirme sırasında internetin yavaşlıyorsa bir sınır seç. Değişiklik anında uygulanır.</p>
          </div>
        </Card>

        <Card title="Bildirimler" desc="Launcher arka plandayken Windows bildirimi göster.">
          {[
            ['downloads', 'İndirme bitti', 'Oyun, modpack ya da şablon hazır olunca'],
            ['mcRelease', 'Yeni Minecraft sürümü', 'Yeni bir sürüm ya da snapshot çıkınca'],
            ['friendRequests', 'Arkadaşlık istekleri', 'Biri seni eklediğinde ya da isteğini kabul ettiğinde'],
            ['friendOnline', 'Arkadaşın çevrimiçi oldu', 'Bir arkadaşın Hexrona\'yı açınca'],
          ].map(([key, title, hint]) => (
            <div className="setting-row" key={key}>
              <span><strong>{title}</strong><span className="hint">{hint}</span></span>
              <Toggle checked={settings.notify?.[key] !== false} label={title} onChange={(v) => onChange({ notify: { ...settings.notify, [key]: v } })} />
            </div>
          ))}
        </Card>

        <AdvancedCard settings={settings} onChange={onChange} onToast={onToast} />
      </div>

      <p className="muted about">Hexrona {system?.version ? `v${system.version}` : ''} · Minecraft, Mojang AB'nin ticari markasıdır. Hexrona resmi bir Mojang ürünü değildir.</p>
    </section>
  );
}

function Card({ title, desc, children }) {
  return (
    <div className="card">
      <div className="card-head">
        <h3>{title}</h3>
        {desc && <p className="muted">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function AdvancedCard({ settings, onChange, onToast }) {
  const res = settings.resolution || { width: 0, height: 0, fullscreen: false };
  const [width, setWidth] = useState(res.width || '');
  const [height, setHeight] = useState(res.height || '');
  const [jvmArgs, setJvmArgs] = useState(settings.jvmArgs || '');
  useEffect(() => setJvmArgs(settings.jvmArgs || ''), [settings.jvmArgs]);

  const saveResolution = (patch) => {
    const next = { width: Number(width) || 0, height: Number(height) || 0, fullscreen: res.fullscreen, ...patch };
    onChange({ resolution: next });
  };

  const pickJava = async () => {
    const r = await api.java.pick();
    if (!r.ok) return onToast({ tone: 'error', title: 'Java seçilemedi', message: r.message });
    if (r.data) onChange({ javaPath: r.data.path, javaLabel: `Java ${r.data.majorVersion} (${r.data.version})` });
  };

  return (
    <div className="card span-2">
      <div className="card-head">
        <h3>Gelişmiş</h3>
        <p className="muted">Ne yaptığını bilmiyorsan varsayılanlarda bırak.</p>
      </div>

      <div className="adv-grid">
        <div className="field">
          <span className="field-label">Java</span>
          <div className="segmented two" role="radiogroup" aria-label="Java seçimi">
            <button role="radio" aria-checked={!settings.javaPath} className={!settings.javaPath ? 'active' : ''} onClick={() => onChange({ javaPath: '', javaLabel: '' })}>
              <span>Otomatik</span><small>Her sürüm için doğru Java indirilir</small>
            </button>
            <button role="radio" aria-checked={!!settings.javaPath} className={settings.javaPath ? 'active' : ''} onClick={pickJava}>
              <span>Kendi Java'm</span><small>{settings.javaPath ? settings.javaLabel || 'Seçildi' : 'Dosya seç…'}</small>
            </button>
          </div>
          {settings.javaPath && <code className="path" title={settings.javaPath}>{settings.javaPath}</code>}
          {settings.javaPath && <p className="hint warn">Tüm profiller bu Java ile açılır. Eski sürümler Java 8, yeniler Java 21+ ister.</p>}
        </div>

        <div className="field">
          <span className="field-label">Oyun penceresi</span>
          <div className="res-row">
            <input aria-label="Genişlik" inputMode="numeric" placeholder="Genişlik" value={width} disabled={res.fullscreen} onChange={(e) => setWidth(e.target.value.replace(/\D/g, ''))} onBlur={() => saveResolution()} />
            <span className="muted">×</span>
            <input aria-label="Yükseklik" inputMode="numeric" placeholder="Yükseklik" value={height} disabled={res.fullscreen} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} onBlur={() => saveResolution()} />
          </div>
          <label className="check-row">
            <Toggle checked={res.fullscreen} label="Tam ekran başlat" onChange={(v) => saveResolution({ fullscreen: v })} />
            Tam ekran başlat
          </label>
          <p className="hint">Boş bırakırsan oyunun varsayılan boyutu kullanılır.</p>
        </div>

        <div className="field span-2">
          <label htmlFor="jvm-args">JVM argümanları</label>
          <input id="jvm-args" className="mono" spellCheck={false} value={jvmArgs} placeholder="-XX:+UseG1GC -XX:MaxGCPauseMillis=50" onChange={(e) => setJvmArgs(e.target.value)} onBlur={() => jvmArgs !== settings.jvmArgs && onChange({ jvmArgs })} />
          <p className="hint">Boşken Hexrona'nın önerilen ayarları kullanılır. Doldurursan onların yerine geçer.</p>
        </div>
      </div>
    </div>
  );
}

const ACCENTS = ['#e2252e', '#e8892b', '#e5b52b', '#3ecf74', '#2bb3a3', '#3b8cf0', '#8a6cf0', '#d55bb5'];

function AppearanceCard({ settings, onChange, onToast }) {
  const pick = async () => {
    const res = await api.settings.pickBackground();
    if (!res.ok) return onToast({ tone: 'error', title: 'Görsel eklenemedi', message: res.message });
    onChange({ background: res.data.background });
  };
  return (
    <Card title="Görünüm" desc="Tema, vurgu rengi ve ana ekran arka planı.">
      <div className="field">
        <span className="field-label">Tema</span>
        <div className="segmented two" role="radiogroup" aria-label="Tema">
          {[['dark', 'Koyu'], ['light', 'Açık']].map(([id, label]) => (
            <button key={id} role="radio" aria-checked={settings.theme === id} className={settings.theme === id ? 'active' : ''} onClick={() => onChange({ theme: id })}>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Vurgu rengi</span>
        <div className="swatches" role="radiogroup" aria-label="Vurgu rengi">
          {ACCENTS.map((c) => (
            <button key={c} role="radio" aria-checked={settings.accent === c} aria-label={c} className={`swatch ${settings.accent === c ? 'on' : ''}`} style={{ background: c }} onClick={() => onChange({ accent: c })} />
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Ana ekran arka planı</span>
        <div className="path-row">
          <span className="path">{settings.background ? 'Kendi görselin' : 'Varsayılan (arkaplan.png)'}</span>
          <button className="ghost-btn" onClick={pick}>Görsel seç</button>
          {settings.background && <button className="ghost-btn" onClick={async () => onChange({ background: (await api.settings.resetBackground()).background })}>Varsayılana dön</button>}
        </div>
        <p className="hint">En iyi sonuç için en az 1920×1080 bir görsel seç.</p>
      </div>
    </Card>
  );
}
