const fs = require('fs');
const path = require('path');
const { getVersionList } = require('@xmcl/installer');

const CACHE_MS = 10 * 60 * 1000;
let cached = null;
let cachedAt = 0;

async function fetchManifest() {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  cached = await getVersionList();
  cachedAt = Date.now();
  return cached;
}

function installedIds(gameDir) {
  const dir = path.join(gameDir, 'versions');
  try {
    return fs.readdirSync(dir).filter((id) => fs.existsSync(path.join(dir, id, `${id}.json`)));
  } catch {
    return [];
  }
}

/**
 * Every version Mojang publishes (release, snapshot, old_beta, old_alpha) merged with
 * locally installed ones. Falls back to local-only when offline.
 */
async function listVersions({ gameDir }) {
  const installed = new Set(installedIds(gameDir));
  let remote = [];
  let latest = null;
  let offline = false;
  try {
    const manifest = await fetchManifest();
    latest = manifest.latest;
    remote = manifest.versions;
  } catch {
    offline = true;
  }

  const versions = remote.map((v) => ({
    id: v.id,
    type: v.type,
    releaseTime: v.releaseTime,
    installed: installed.has(v.id),
  }));

  const known = new Set(versions.map((v) => v.id));
  for (const id of installed) {
    if (!known.has(id)) versions.unshift({ id, type: 'local', releaseTime: null, installed: true });
  }

  return { versions, latest, offline };
}

async function getRemoteVersion(id) {
  const manifest = await fetchManifest();
  return manifest.versions.find((v) => v.id === id);
}

module.exports = { listVersions, getRemoteVersion };
