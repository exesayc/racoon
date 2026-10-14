const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');
const microsoft = require('./microsoft.cjs');

const file = () => path.join(app.getPath('userData'), 'accounts.json');

// Tokens are encrypted with the OS keychain (DPAPI on Windows) whenever it is available.
const seal = (text) =>
  text == null ? null : safeStorage.isEncryptionAvailable() ? `enc:${safeStorage.encryptString(text).toString('base64')}` : `raw:${text}`;
const unseal = (value) => {
  if (!value) return null;
  if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
  return value.slice(4);
};

/** Same UUID the vanilla server assigns to offline players ("OfflinePlayer:<name>", UUID v3). */
function offlineUuid(name) {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x30;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return hash.toString('hex');
}

let state = null;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    state = { activeId: null, accounts: [] };
  }
  return state;
}

function persist() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(state, null, 2));
}

/** What the renderer may see: never tokens. */
function list() {
  const { accounts, activeId } = load();
  return {
    activeId,
    accounts: accounts.map(({ id, type, name, uuid }) => ({ id, type, name, uuid })),
  };
}

function upsert(account) {
  const s = load();
  const i = s.accounts.findIndex((a) => a.id === account.id);
  if (i >= 0) s.accounts[i] = { ...s.accounts[i], ...account };
  else s.accounts.push(account);
  s.activeId = account.id;
  persist();
  return list();
}

function addOffline(name) {
  const uuid = offlineUuid(name);
  return upsert({ id: `offline:${name.toLowerCase()}`, type: 'offline', name, uuid });
}

async function addMicrosoft(parentWindow) {
  const result = await microsoft.loginInteractive(parentWindow);
  return upsert(fromAuthResult(result));
}

function fromAuthResult({ msRefresh, mcToken, mcExpiresAt, profile }) {
  return {
    id: `ms:${profile.uuid}`,
    type: 'microsoft',
    name: profile.name,
    uuid: profile.uuid,
    skinUrl: profile.skinUrl,
    msRefresh: seal(msRefresh),
    mcToken: seal(mcToken),
    mcExpiresAt,
  };
}

function select(id) {
  const s = load();
  if (s.accounts.some((a) => a.id === id)) {
    s.activeId = id;
    persist();
  }
  return list();
}

function remove(id) {
  const s = load();
  s.accounts = s.accounts.filter((a) => a.id !== id);
  if (s.activeId === id) s.activeId = s.accounts[0]?.id ?? null;
  persist();
  return list();
}

/** Credentials for launching the game with the active account, refreshing Microsoft tokens if needed. */
async function getLaunchAuth() {
  const s = load();
  const account = s.accounts.find((a) => a.id === s.activeId);
  if (!account) throw new microsoft.AuthError('Oynamak için önce giriş yap.', 'no-account');

  if (account.type === 'offline') {
    return { name: account.name, uuid: account.uuid, accessToken: account.uuid, userType: 'legacy' };
  }

  const fresh = account.mcExpiresAt && account.mcExpiresAt - Date.now() > 5 * 60 * 1000;
  if (!fresh) {
    const result = await microsoft.refresh(unseal(account.msRefresh));
    Object.assign(account, fromAuthResult(result));
    persist();
  }
  return { name: account.name, uuid: account.uuid, accessToken: unseal(account.mcToken), userType: 'msa' };
}

module.exports = { list, addOffline, addMicrosoft, select, remove, getLaunchAuth };
