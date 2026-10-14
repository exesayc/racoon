export const VERSION_TYPES = {
  release: { label: 'Release', tone: 'release' },
  snapshot: { label: 'Snapshot', tone: 'snapshot' },
  old_beta: { label: 'Beta', tone: 'beta' },
  old_alpha: { label: 'Alpha', tone: 'alpha' },
  local: { label: 'Özel', tone: 'local' },
};

export const typeLabel = (type) => VERSION_TYPES[type]?.label ?? type;

export function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

export function usernameError(name) {
  if (!name) return 'Oynamak için bir kullanıcı adı gir.';
  if (name.length < 3 || name.length > 16) return 'Kullanıcı adı 3-16 karakter olmalı.';
  if (!USERNAME_RE.test(name)) return 'Yalnızca harf, rakam ve _ kullanabilirsin.';
  return null;
}

// Microsoft accounts resolve by UUID (follows skin changes); offline accounts by name.
export const avatarUrl = (account, size = 64) =>
  `https://mc-heads.net/avatar/${encodeURIComponent(account.type === 'microsoft' ? account.uuid : account.name)}/${size}`;

export const accountKind = (account) => (account.type === 'microsoft' ? 'Microsoft hesabı' : 'Çevrimdışı hesap');

export const LOADERS = [
  { id: 'vanilla', label: 'Vanilla' },
  { id: 'fabric', label: 'Fabric' },
  { id: 'quilt', label: 'Quilt' },
  { id: 'forge', label: 'Forge' },
  { id: 'neoforge', label: 'NeoForge' },
];
export const loaderLabel = (id) => LOADERS.find((l) => l.id === id)?.label ?? id;

export const PROFILE_COLORS = ['#e2252e', '#e8892b', '#e8c35a', '#3ecf74', '#2bb3a3', '#3b8cf0', '#8a6cf0', '#d55bb5'];

/** Stable colour per profile so cards are recognisable without uploading icons. */
export function profileColor(profile) {
  if (profile.color) return profile.color;
  let h = 0;
  for (const c of profile.id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PROFILE_COLORS[h % PROFILE_COLORS.length];
}

export function formatCount(n) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)} Mn`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)} B`;
  return String(n);
}

export function relativeTime(ts) {
  if (!ts) return 'Hiç oynanmadı';
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'Az önce';
  if (diff < 3600) return `${Math.floor(diff / 60)} dk önce`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} sa önce`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} gün önce`;
  return new Date(ts).toLocaleDateString('tr-TR');
}

const MC_COLORS = {
  0: '#000000', 1: '#0000aa', 2: '#00aa00', 3: '#00aaaa', 4: '#aa0000', 5: '#aa00aa', 6: '#ffaa00', 7: '#aaaaaa',
  8: '#555555', 9: '#5555ff', a: '#55ff55', b: '#55ffff', c: '#ff5555', d: '#ff55ff', e: '#ffff55', f: '#ffffff',
};

/** Parse a §-formatted MOTD into styled segments. */
export function parseMotd(text) {
  // Spigot/Paper hex colours arrive as §x§R§R§G§G§B§B; fold them into §#RRGGBB first.
  text = (text || '').replace(/§x((?:§[0-9a-f]){6})/gi, (_, hex) => `§#${hex.replace(/§/g, '')}`);
  const segments = [];
  let style = {};
  const re = /§(#[0-9a-f]{6}|[0-9a-fk-or])/gi;
  let last = 0;
  let m;
  const push = (t) => t && segments.push({ text: t, ...style });
  while ((m = re.exec(text || ''))) {
    push(text.slice(last, m.index));
    last = re.lastIndex;
    const code = m[1].toLowerCase();
    if (code.startsWith('#')) style = { color: code };
    else if (MC_COLORS[code]) style = { color: MC_COLORS[code] };
    else if (code === 'l') style = { ...style, bold: true };
    else if (code === 'o') style = { ...style, italic: true };
    else if (code === 'r') style = {};
  }
  push((text || '').slice(last));
  return segments;
}

export function formatDuration(ms) {
  if (!ms) return '0 dk';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

export function formatSpeed(bps) {
  if (!bps) return '';
  const mb = bps / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB/s` : `${Math.round(bps / 1024)} KB/s`;
}

export function formatEta(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${Math.ceil(seconds)} sn kaldı`;
  const m = Math.ceil(seconds / 60);
  return m < 60 ? `${m} dk kaldı` : `${Math.floor(m / 60)} sa ${m % 60} dk kaldı`;
}
