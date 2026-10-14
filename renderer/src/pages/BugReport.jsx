import { useEffect, useState } from 'react';
import { IconCheck, IconBug } from '../icons.jsx';
import { Toggle } from '../components.jsx';

const api = window.hexrona;

const CATEGORIES = [
  { id: 'launch', label: 'Oyun açılmıyor / çöküyor' },
  { id: 'download', label: 'İndirme / kurulum' },
  { id: 'mods', label: 'Modlar / Mod Mağazası' },
  { id: 'account', label: 'Giriş / hesap' },
  { id: 'ui', label: 'Arayüz / görünüm' },
  { id: 'other', label: 'Diğer' },
];

const DRAFT_KEY = 'hexrona.bugDraft';
const empty = { title: '', category: 'launch', description: '', steps: '', contact: '', includeLogs: true, includeSystem: true };

export default function BugReport({ system }) {
  // Draft survives page switches so a half-written report isn't lost.
  const [form, setForm] = useState(() => ({ ...empty, ...JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') }));
  const [touched, setTouched] = useState({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form)), [form]);
  useEffect(() => {
    if (showPreview) api.bugReport.preview({ includeLogs: form.includeLogs, includeSystem: form.includeSystem }).then(setPreview);
  }, [showPreview, form.includeLogs, form.includeSystem]);

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };
  const errors = {
    title: form.title.trim().length < 5 ? 'Başlık en az 5 karakter olmalı.' : null,
    description: form.description.trim().length < 10 ? 'Ne olduğunu biraz daha anlat (en az 10 karakter).' : null,
  };
  const blur = (key) => () => setTouched((t) => ({ ...t, [key]: true }));

  const submit = async (e) => {
    e.preventDefault();
    setTouched({ title: true, description: true });
    if (errors.title || errors.description) return;
    setSending(true);
    const res = await api.bugReport.send(form);
    setSending(false);
    if (!res.ok) return setError(res.message);
    setResult(res.data);
    setForm(empty);
    setTouched({});
    sessionStorage.removeItem(DRAFT_KEY);
  };

  if (result) {
    return (
      <section className="bugreport">
        <div className="sent">
          <span className="sent-icon"><IconCheck size={26} /></span>
          <h2>Teşekkürler, raporun gönderildi</h2>
          {result.via === 'server' ? (
            <p className="muted">Rapor numaran <strong className="mono">#{result.id}</strong>. İletişim bilgisi bıraktıysan sana dönüş yapılacak.</p>
          ) : (
            <p className="muted">Tarayıcında hazır doldurulmuş bir GitHub formu açıldı; oradan <strong>Submit</strong> diyerek gönderebilirsin.</p>
          )}
          <button className="ghost-btn" onClick={() => setResult(null)}>Yeni rapor yaz</button>
        </div>
      </section>
    );
  }

  return (
    <section className="bugreport">
      <header className="page-head">
        <div>
          <h2>Hata Bildir</h2>
          <p className="muted">Bir şey ters gittiyse anlat; log ve sistem bilgisi sorunu bulmamızı çok hızlandırır.</p>
        </div>
      </header>

      <form className="bug-form" onSubmit={submit} noValidate>
        <div className="bug-main">
          <div className="field">
            <label htmlFor="bug-title">Başlık</label>
            <input id="bug-title" maxLength={120} value={form.title} placeholder="ör. Fabric profili açılırken çöküyor" aria-invalid={touched.title && !!errors.title} onChange={set('title')} onBlur={blur('title')} />
            {touched.title && errors.title && <span className="form-error">{errors.title}</span>}
          </div>

          <div className="field">
            <span className="field-label">Kategori</span>
            <div className="chips" role="radiogroup" aria-label="Kategori">
              {CATEGORIES.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={form.category === c.id} className={`chip ${form.category === c.id ? 'on' : ''}`} onClick={() => set('category')(c.id)}>{c.label}</button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="bug-desc">Ne oldu?</label>
            <textarea id="bug-desc" rows={5} maxLength={5000} value={form.description} placeholder="Ne yapmaya çalışıyordun, ne bekliyordun, ne oldu?" aria-invalid={touched.description && !!errors.description} onChange={set('description')} onBlur={blur('description')} />
            {touched.description && errors.description && <span className="form-error">{errors.description}</span>}
          </div>

          <div className="field">
            <label htmlFor="bug-steps">Nasıl tekrar edilir? <span className="muted">(isteğe bağlı)</span></label>
            <textarea id="bug-steps" rows={3} maxLength={3000} value={form.steps} placeholder={'1. Profiller → Yeni profil\n2. Forge 1.20.1 seç\n3. Oyna'} onChange={set('steps')} />
          </div>

          <div className="field">
            <label htmlFor="bug-contact">İletişim <span className="muted">(isteğe bağlı)</span></label>
            <input id="bug-contact" maxLength={120} value={form.contact} placeholder="Discord adın ya da e-posta" onChange={set('contact')} />
          </div>
        </div>

        <aside className="bug-side">
          <div className="card">
            <div className="card-head"><h3>Rapora eklenecekler</h3></div>
            <label className="setting-row">
              <span><strong>Son log satırları</strong><span className="hint">Son 300 satır; token'lar ve kullanıcı klasörün gizlenir.</span></span>
              <Toggle checked={form.includeLogs} label="Logları ekle" onChange={set('includeLogs')} />
            </label>
            <label className="setting-row">
              <span><strong>Sistem bilgisi</strong><span className="hint">Windows sürümü, RAM, işlemci, profil sürümü.</span></span>
              <Toggle checked={form.includeSystem} label="Sistem bilgisini ekle" onChange={set('includeSystem')} />
            </label>
            <button type="button" className="link-btn" onClick={() => setShowPreview((v) => !v)}>{showPreview ? 'Önizlemeyi gizle' : 'Gönderilecekleri gör'}</button>
            {showPreview && preview && (
              <pre className="bug-preview">{[preview.system ? JSON.stringify(preview.system, null, 2) : '', preview.logs ? preview.logs.split('\n').slice(-40).join('\n') : ''].filter(Boolean).join('\n\n') || 'Hiçbir ek bilgi gönderilmeyecek.'}</pre>
            )}
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="primary-btn big" disabled={sending}>
            {sending ? <><span className="spinner small" /> Gönderiliyor</> : <><IconBug size={16} /> Raporu gönder</>}
          </button>
          {!system?.socialConfigured && <p className="hint">Hexrona sunucusu ayarlanmadığı için rapor GitHub üzerinden açılır.</p>}
        </aside>
      </form>
    </section>
  );
}
