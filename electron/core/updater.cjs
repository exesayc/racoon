const { app } = require('electron');
const { githubRepo } = require('./news.cjs');

/**
 * Auto-update from GitHub Releases via electron-updater.
 * Only active in the packaged app with a configured repo (package.json → build.publish).
 */
function createUpdater(send) {
  let state = { status: 'idle' };
  const emit = (next) => {
    state = next;
    send(state);
  };

  if (!app.isPackaged) {
    state = { status: 'disabled', reason: 'dev' };
    return { state: () => state, check: async () => state, install: () => {} };
  }
  if (!githubRepo()) {
    state = { status: 'disabled', reason: 'no-repo' };
    return { state: () => state, check: async () => state, install: () => {} };
  }

  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => emit({ status: 'checking' }));
  autoUpdater.on('update-not-available', () => emit({ status: 'latest', checkedAt: Date.now() }));
  autoUpdater.on('update-available', (info) => emit({ status: 'downloading', version: info.version, percent: 0 }));
  autoUpdater.on('download-progress', (p) => emit({ status: 'downloading', version: state.version, percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) => emit({ status: 'ready', version: info.version }));
  autoUpdater.on('error', (e) => emit({ status: 'error', message: String(e?.message || e).split('\n')[0] }));

  const check = async () => {
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // reported through the 'error' event
    }
    return state;
  };

  // Check at startup and then every 2 hours.
  setTimeout(check, 5000);
  setInterval(check, 2 * 60 * 60 * 1000);

  return { state: () => state, check, install: () => autoUpdater.quitAndInstall(false, true) };
}

module.exports = { createUpdater };
