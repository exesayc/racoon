import { useMemo } from 'react';
import { formatDuration, loaderLabel, profileColor } from '../lib.js';
import { ProfileGlyph } from '../components.jsx';

const DAY = 24 * 60 * 60 * 1000;
const dayStart = (t) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Play time overview built from per-profile session history. */
export default function Stats({ profiles }) {
  const data = useMemo(() => {
    const sessions = profiles.flatMap((p) => (p.sessions || []).map((s) => ({ ...s, profile: p })));
    const total = profiles.reduce((sum, p) => sum + (p.playTimeMs || 0), 0);
    const today = dayStart(Date.now());

    // Last 14 days, split by day (sessions crossing midnight count on their start day).
    const days = Array.from({ length: 14 }, (_, i) => {
      const start = today - (13 - i) * DAY;
      const ms = sessions.filter((s) => s.start >= start && s.start < start + DAY).reduce((sum, s) => sum + (s.end - s.start), 0);
      return { start, ms };
    });
    const week = days.slice(-7).reduce((s, d) => s + d.ms, 0);
    const longest = sessions.reduce((max, s) => Math.max(max, s.end - s.start), 0);

    const versions = new Map();
    for (const s of sessions) versions.set(s.mcVersion, (versions.get(s.mcVersion) || 0) + (s.end - s.start));
    const servers = new Map();
    for (const s of sessions) if (s.server) servers.set(s.server, (servers.get(s.server) || 0) + (s.end - s.start));

    return {
      total,
      week,
      longest,
      count: sessions.length,
      days,
      maxDay: Math.max(...days.map((d) => d.ms), 1),
      byProfile: [...profiles].filter((p) => p.playTimeMs > 0).sort((a, b) => b.playTimeMs - a.playTimeMs),
      versions: [...versions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      servers: [...servers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [profiles]);

  if (data.total === 0) {
    return (
      <div className="empty">
        <strong>Henüz istatistik yok</strong>
        <p>Oynadıkça burada toplam süreni, en çok oynadığın profilleri ve son iki haftanı göreceksin.</p>
      </div>
    );
  }

  return (
    <div className="stats">
      <div className="stat-tiles">
        <Tile label="Toplam oynama" value={formatDuration(data.total)} />
        <Tile label="Son 7 gün" value={formatDuration(data.week)} />
        <Tile label="En uzun oturum" value={formatDuration(data.longest)} />
        <Tile label="Oturum sayısı" value={data.count} hint="son 50 oturum / profil" />
      </div>

      <div className="card">
        <div className="card-head"><h3>Son 14 gün</h3></div>
        <div className="day-chart" role="img" aria-label="Son 14 günün günlük oynama süreleri">
          {data.days.map((d) => {
            const date = new Date(d.start);
            const label = `${date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}: ${formatDuration(d.ms)}`;
            return (
              <div key={d.start} className="day-col" title={label}>
                <span className="day-bar" style={{ height: `${Math.max(d.ms ? 4 : 0, (d.ms / data.maxDay) * 100)}%` }} />
                <span className="day-label">{date.toLocaleDateString('tr-TR', { weekday: 'narrow' })}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="stats-split">
        <div className="card">
          <div className="card-head"><h3>Profiller</h3></div>
          <ul className="rank-list">
            {data.byProfile.map((p) => (
              <li key={p.id}>
                <ProfileGlyph profile={p} size={28} color={profileColor(p)} />
                <span className="rank-name"><strong>{p.name}</strong><span className="muted small">{p.mcVersion} · {loaderLabel(p.loader)}</span></span>
                <span className="rank-bar"><i style={{ width: `${(p.playTimeMs / data.byProfile[0].playTimeMs) * 100}%`, background: profileColor(p) }} /></span>
                <span className="rank-value">{formatDuration(p.playTimeMs)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <div className="card-head"><h3>Sürümler ve sunucular</h3></div>
          <ul className="rank-list compact">
            {data.versions.map(([v, ms]) => (
              <li key={v}><span className="rank-name"><strong>Minecraft {v}</strong></span><span className="rank-value">{formatDuration(ms)}</span></li>
            ))}
            {data.servers.map(([s, ms]) => (
              <li key={s}><span className="rank-name"><strong className="mono">{s}</strong></span><span className="rank-value">{formatDuration(ms)}</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, hint }) {
  return (
    <div className="stat-tile">
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
      {hint && <span className="faint small">{hint}</span>}
    </div>
  );
}
