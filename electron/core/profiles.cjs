const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { LOADERS } = require('./loaders.cjs');

const file = () => path.join(app.getPath('userData'), 'profiles.json');
let state = null;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    state = { activeId: null, profiles: [] };
  }
  return state;
}

function persist() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(state, null, 2));
}

const list = () => {
  const s = load();
  return { activeId: s.activeId, profiles: s.profiles };
};

const get = (id) => load().profiles.find((p) => p.id === id);
const active = () => get(load().activeId) || load().profiles[0] || null;

/** The default profile shares the root folder (keeps worlds from before profiles existed); others get their own. */
function dirFor(profile, root) {
  return profile.shared ? root : path.join(root, 'instances', profile.id);
}

function sanitize(input) {
  const out = {};
  if ('name' in input) out.name = String(input.name || '').trim().slice(0, 40) || 'Yeni profil';
  if ('mcVersion' in input) out.mcVersion = String(input.mcVersion);
  if ('loader' in input) out.loader = LOADERS.includes(input.loader) ? input.loader : 'vanilla';
  if ('loaderVersion' in input) out.loaderVersion = input.loaderVersion ? String(input.loaderVersion) : null;
  if ('ramMb' in input) out.ramMb = input.ramMb ? Math.max(512, Number(input.ramMb)) : null;
  if ('jvmArgs' in input) out.jvmArgs = String(input.jvmArgs || '').slice(0, 2000);
  if ('color' in input) out.color = String(input.color || '');
  return out;
}

function create(input) {
  const s = load();
  const profile = {
    id: crypto.randomBytes(5).toString('hex'),
    name: 'Yeni profil',
    loader: 'vanilla',
    loaderVersion: null,
    versionId: null,
    ramMb: null,
    jvmArgs: '',
    color: '',
    shared: false,
    createdAt: Date.now(),
    lastPlayed: null,
    ...sanitize(input),
  };
  s.profiles.push(profile);
  s.activeId = profile.id;
  persist();
  return list();
}

function update(id, patch) {
  const profile = get(id);
  if (!profile) return list();
  const clean = sanitize(patch);
  // A different game/loader version means the cached launch version id is stale.
  if (['mcVersion', 'loader', 'loaderVersion'].some((k) => k in clean && clean[k] !== profile[k])) clean.versionId = null;
  Object.assign(profile, clean);
  persist();
  return list();
}

/** Internal fields the renderer cannot set. */
function markInstalled(id, versionId) {
  const profile = get(id);
  if (!profile) return;
  profile.versionId = versionId;
  profile.lastPlayed = Date.now();
  persist();
}

/** Internal metadata (modpack origin etc.) that doesn't go through sanitize(). */
function setMeta(id, patch) {
  const profile = get(id);
  if (!profile) return;
  Object.assign(profile, patch);
  persist();
}

/** Add a finished play session; keeps the last 50 per profile for statistics. */
function recordSession(id, { start, end, server }) {
  const profile = get(id);
  if (!profile || !start || end <= start) return;
  const duration = end - start;
  profile.playTimeMs = (profile.playTimeMs || 0) + duration;
  profile.sessions = [...(profile.sessions || []), { start, end, server: server || null, mcVersion: profile.mcVersion }].slice(-50);
  persist();
}

function remove(id, root, deleteFiles) {
  const s = load();
  const profile = get(id);
  if (!profile) return list();
  if (deleteFiles && !profile.shared) {
    fs.rmSync(dirFor(profile, root), { recursive: true, force: true });
  }
  s.profiles = s.profiles.filter((p) => p.id !== id);
  if (s.activeId === id) s.activeId = s.profiles[0]?.id ?? null;
  persist();
  return list();
}

function select(id) {
  const s = load();
  if (get(id)) {
    s.activeId = id;
    persist();
  }
  return list();
}

/** First run: one vanilla profile on the latest release, sharing the root folder. */
function ensureDefault(mcVersion) {
  const s = load();
  if (s.profiles.length > 0 || !mcVersion) return list();
  s.profiles.push({
    id: 'default',
    name: 'Vanilla',
    mcVersion,
    loader: 'vanilla',
    loaderVersion: null,
    versionId: null,
    ramMb: null,
    jvmArgs: '',
    color: '',
    shared: true,
    createdAt: Date.now(),
    lastPlayed: null,
  });
  s.activeId = 'default';
  persist();
  return list();
}

module.exports = { list, get, active, dirFor, create, update, remove, select, markInstalled, ensureDefault, setMeta, recordSession };
