import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconCheck } from './icons.jsx';
import { formatDate, typeLabel, VERSION_TYPES } from './lib.js';

const TABS = [
  { id: 'release', label: 'Release' },
  { id: 'snapshot', label: 'Snapshot' },
  { id: 'old_beta', label: 'Beta' },
  { id: 'old_alpha', label: 'Alpha' },
  { id: 'installed', label: 'Kurulu' },
];

/** Every Minecraft version, filterable; used inside the profile editor. */
export default function VersionList({ catalog, selected, onSelect }) {
  const initialTab = catalog.versions.find((v) => v.id === selected)?.type;
  const [tab, setTab] = useState(TABS.some((t) => t.id === initialTab) ? initialTab : 'release');
  const [query, setQuery] = useState('');
  const listRef = useRef(null);

  const counts = useMemo(() => {
    const c = { installed: 0 };
    for (const v of catalog.versions) {
      c[v.type] = (c[v.type] || 0) + 1;
      if (v.installed) c.installed += 1;
    }
    return c;
  }, [catalog.versions]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.versions.filter((v) => {
      if (q) return v.id.toLowerCase().includes(q);
      return tab === 'installed' ? v.installed : v.type === tab;
    });
  }, [catalog.versions, tab, query]);

  // Bring the current selection into view when the editor opens.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' });
  }, []);

  return (
    <div className="vlist">
      <div className="vlist-toolbar">
        <div className="tabs small" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={!query && tab === t.id} className={!query && tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); setQuery(''); }}>
              {t.label}
              <span className="tab-count">{counts[t.id] || 0}</span>
            </button>
          ))}
        </div>
        <div className="search">
          <IconSearch size={15} />
          <input placeholder="Tüm sürümlerde ara" aria-label="Sürüm ara" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <ul className="vlist-items" role="listbox" aria-label="Minecraft sürümleri" ref={listRef}>
        {catalog.loading && catalog.versions.length === 0 && <li className="vlist-empty">Sürümler yükleniyor…</li>}
        {!catalog.loading && filtered.length === 0 && (
          <li className="vlist-empty">{query ? `"${query}" ile eşleşen sürüm yok.` : catalog.offline ? 'Sürüm listesine ulaşılamadı.' : 'Bu kategoride sürüm yok.'}</li>
        )}
        {filtered.slice(0, 400).map((v) => (
          <li key={v.id}>
            <button type="button" role="option" aria-selected={v.id === selected} className={v.id === selected ? 'selected' : ''} onClick={() => onSelect(v.id)}>
              <span className="vlist-id">{v.id}</span>
              <span className="vlist-meta">
                {v.installed && <span className="installed-dot" title="Kurulu" />}
                <span className="vlist-date">{formatDate(v.releaseTime)}</span>
                <span className={`badge badge-${VERSION_TYPES[v.type]?.tone || 'local'}`}>{typeLabel(v.type)}</span>
                {v.id === selected && <IconCheck size={15} className="vlist-check" />}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
