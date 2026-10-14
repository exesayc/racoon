const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const file = () => path.join(app.getPath('userData'), 'settings.json');

function defaults() {
  const totalMb = Math.floor(os.totalmem() / 1024 / 1024);
  return {
    ramMb: Math.min(4096, Math.max(1024, Math.floor(totalMb / 4 / 512) * 512)),
    gameDir: path.join(app.getPath('appData'), '.hexrona'),
    lastVersion: null,
    afterLaunch: 'hide', // 'hide' | 'keep' | 'close'
    javaPath: '', // empty: Mojang runtime matching the version
    jvmArgs: '',
    resolution: { width: 0, height: 0, fullscreen: false }, // 0: game default
    discordRpc: true,
    theme: 'dark', // 'dark' | 'light'
    accent: '#e2252e',
    background: '', // file name in userData/backgrounds, empty = bundled image
    downloadLimitMb: 0, // 0 = unlimited
    notify: { downloads: true, mcRelease: true, friendRequests: true, friendOnline: false },
    lastSeenRelease: null,
  };
}

let cache = null;

function load() {
  if (cache) return cache;
  let stored = {};
  try {
    stored = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    // first run or corrupted file: fall back to defaults
  }
  cache = { ...defaults(), ...stored };
  return cache;
}

function save(patch) {
  cache = { ...load(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(cache, null, 2));
  return cache;
}

module.exports = { load, save };
