const path = require('path');
const os = require('os');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } = require('electron');
const { pathToFileURL } = require('url');
const settings = require('./core/settings.cjs');
const { listVersions } = require('./core/versions.cjs');
const { GameSession } = require('./core/game.cjs');
const accounts = require('./core/accounts.cjs');
const profiles = require('./core/profiles.cjs');
const loaders = require('./core/loaders.cjs');
const modrinth = require('./core/modrinth.cjs');
const servers = require('./core/servers.cjs');
const news = require('./core/news.cjs');
const { presence } = require('./core/discord.cjs');
const { createUpdater } = require('./core/updater.cjs');
const { installModpack } = require('./core/modpacks.cjs');
const templates = require('./core/templates.cjs');
const { createJobs } = require('./core/jobs.cjs');
const { createNotifier } = require('./core/notify.cjs');
const { createSocial, API_URL } = require('./core/social.cjs');
const { setLimit, startSpeedReporter } = require('./core/dispatcher.cjs');
const { getVersionList } = require('@xmcl/installer');
const bundledDiscover = require('./core/discover.json');

// Custom backgrounds are served from userData through this scheme (file:// is blocked by the CSP).
protocol.registerSchemesAsPrivileged([{ scheme: 'hexrona-media', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const backgroundsDir = () => path.join(app.getPath('userData'), 'backgrounds');

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

let win = null;
let updater = null;
const logBuffer = [];
const LOG_LIMIT = 5000;

const send = (channel, payload) => {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
};

const notify = createNotifier({
  getSettings: () => settings.load(),
  getWindow: () => win,
  navigate: (page) => send('nav:go', page),
});

const jobs = createJobs(
  (list) => send('jobs:update', list),
  (job) => {
    send('profiles:changed', profiles.list());
    if (job.status === 'done') notify('downloads', { title: `${job.title} hazır`, body: 'Profil oluşturuldu, oynamaya hazır.', page: 'profiles', onlyWhenUnfocused: true });
  },
);

const social = createSocial({
  getAuth: () => accounts.getLaunchAuth(),
  getActiveAccount: () => {
    const { activeId, accounts: list } = accounts.list();
    return list.find((a) => a.id === activeId) || null;
  },
  onState: (state) => send('social:state', state),
  onNotify: (msg) => {
    send('social:notify', msg);
    if (msg.kind === 'request') notify('friendRequests', { title: 'Yeni arkadaşlık isteği', body: `${msg.name} seni arkadaş olarak eklemek istiyor.`, page: 'friends' });
    if (msg.kind === 'accepted') notify('friendRequests', { title: 'İstek kabul edildi', body: `${msg.name} artık arkadaşın.`, page: 'friends', onlyWhenUnfocused: true });
    if (msg.kind === 'online') notify('friendOnline', { title: `${msg.name} çevrimiçi`, body: "Arkadaşın Hexrona'ya girdi.", page: 'friends', onlyWhenUnfocused: true });
  },
});

let installStartedAt = 0;
let sessionStartedAt = 0;

const session = new GameSession({
  state: (status, detail) => {
    send('game:state', { status, ...detail });
    onGameState(status, detail);
  },
  progress: (p) => send('game:progress', p),
  log: (line) => {
    logBuffer.push(line);
    if (logBuffer.length > LOG_LIMIT) logBuffer.splice(0, logBuffer.length - LOG_LIMIT);
    send('game:log', line);
  },
});

function onGameState(status, detail) {
  const profile = detail?.profileId ? profiles.get(detail.profileId) : null;
  presence.update({ status: status === 'error' ? 'idle' : status, profile, server: detail?.server });
  social.setPresence(
    status === 'running' && profile
      ? { status: 'playing', activity: { mcVersion: profile.mcVersion, loader: profile.loader, server: detail?.server || null } }
      : { status: 'online', activity: null },
  );

  if (status === 'installing') installStartedAt = Date.now();
  if (status === 'launching' && installStartedAt && Date.now() - installStartedAt > 20000 && profile) {
    notify('downloads', { title: 'İndirme tamamlandı', body: `${profile.name} (${profile.mcVersion}) başlatılıyor.`, onlyWhenUnfocused: true });
  }
  if (status === 'running' && !sessionStartedAt) sessionStartedAt = Date.now();
  if ((status === 'idle' || status === 'error') && sessionStartedAt) {
    if (detail?.profileId) profiles.recordSession(detail.profileId, { start: sessionStartedAt, end: Date.now(), server: detail.server });
    sessionStartedAt = 0;
    send('profiles:changed', profiles.list());
  }

  const { afterLaunch } = settings.load();
  if (!win || win.isDestroyed()) {
    // Window was closed while the game ran; quit once the game is gone.
    if (status !== 'running' && status !== 'launching') app.quit();
    return;
  }
  if (status === 'running') {
    if (afterLaunch === 'hide') win.hide();
    if (afterLaunch === 'close') win.close();
  } else if (status === 'idle' || status === 'error') {
    if (!win.isVisible()) win.show();
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 720,
    minWidth: 980,
    minHeight: 620,
    frame: false,
    backgroundColor: '#0c0c0f',
    show: false,
    title: 'Hexrona',
    icon: path.join(__dirname, '..', 'yt.jpg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.on('maximize', () => send('window:maximized', true));
  win.on('unmaximize', () => send('window:maximized', false));

  // Open external links in the user's browser, never inside the launcher.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

/** Wrap a handler so failures reach the renderer as { ok:false, message } instead of a rejected invoke. */
const safe = (fn) => async (...args) => {
  try {
    return { ok: true, data: await fn(...args) };
  } catch (e) {
    return { ok: false, message: e?.message || String(e) };
  }
};

function profileDir(id) {
  const profile = profiles.get(id);
  if (!profile) throw new Error('Profil bulunamadı.');
  return { profile, dir: profiles.dirFor(profile, settings.load().gameDir) };
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settings.load());
  ipcMain.handle('settings:set', (_e, patch) => {
    const next = settings.save(patch);
    if ('discordRpc' in patch) presence.setEnabled(next.discordRpc);
    if ('downloadLimitMb' in patch) setLimit(next.downloadLimitMb);
    return next;
  });
  ipcMain.handle('settings:pickBackground', safe(async () => {
    const res = await dialog.showOpenDialog(win, { title: 'Arka plan görseli seç', properties: ['openFile'], filters: [{ name: 'Görsel', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] });
    if (res.canceled) return settings.load();
    const src = res.filePaths[0];
    const name = `bg-${Date.now()}${path.extname(src).toLowerCase()}`;
    fs.mkdirSync(backgroundsDir(), { recursive: true });
    fs.copyFileSync(src, path.join(backgroundsDir(), name));
    const previous = settings.load().background;
    if (previous) fs.rmSync(path.join(backgroundsDir(), previous), { force: true });
    return settings.save({ background: name });
  }));
  ipcMain.handle('settings:resetBackground', () => {
    const previous = settings.load().background;
    if (previous) fs.rmSync(path.join(backgroundsDir(), previous), { force: true });
    return settings.save({ background: '' });
  });

  ipcMain.handle('system:info', () => ({
    totalMemMb: Math.floor(os.totalmem() / 1024 / 1024),
    platform: process.platform,
    version: app.getVersion(),
    discordConfigured: presence.configured,
    socialConfigured: social.configured,
    githubRepo: news.githubRepo(),
  }));

  ipcMain.handle('versions:list', () => listVersions({ gameDir: settings.load().gameDir }));

  // ----- accounts -----
  ipcMain.handle('accounts:list', () => accounts.list());
  const restartingSocial = (fn) => (...args) => {
    const result = fn(...args);
    social.restart();
    return result;
  };
  ipcMain.handle('accounts:select', restartingSocial((_e, id) => accounts.select(id)));
  ipcMain.handle('accounts:remove', restartingSocial((_e, id) => accounts.remove(id)));
  ipcMain.handle('accounts:addOffline', (_e, name) => {
    const clean = String(name || '').trim();
    if (!USERNAME_RE.test(clean)) {
      return { ok: false, message: 'Kullanıcı adı 3-16 karakter olmalı; yalnızca harf, rakam ve _ kullanılabilir.' };
    }
    const result = { ok: true, ...accounts.addOffline(clean) };
    social.restart();
    return result;
  });
  ipcMain.handle('accounts:addMicrosoft', async () => {
    try {
      const result = { ok: true, ...(await accounts.addMicrosoft(win)) };
      social.restart();
      return result;
    } catch (e) {
      return { ok: false, code: e.code || 'unknown', message: e.name === 'AuthError' ? e.message : 'Giriş sırasında beklenmeyen bir hata oluştu. İnternet bağlantını kontrol et.' };
    }
  });

  // ----- profiles -----
  ipcMain.handle('profiles:list', async () => {
    const current = profiles.list();
    if (current.profiles.length > 0) return current;
    const legacy = settings.load().lastVersion;
    let latest = legacy;
    if (!latest) {
      try {
        latest = (await listVersions({ gameDir: settings.load().gameDir })).latest?.release;
      } catch {
        // offline on first run: the renderer shows an empty state
      }
    }
    return profiles.ensureDefault(latest);
  });
  ipcMain.handle('profiles:create', (_e, data) => profiles.create(data));
  ipcMain.handle('profiles:update', (_e, id, patch) => profiles.update(id, patch));
  ipcMain.handle('profiles:select', (_e, id) => profiles.select(id));
  ipcMain.handle('profiles:remove', (_e, id, deleteFiles) => {
    if (session.busy && session.context?.profileId === id) return profiles.list();
    return profiles.remove(id, settings.load().gameDir, deleteFiles);
  });
  ipcMain.handle('profiles:openDir', (_e, id) => {
    const { dir } = profileDir(id);
    fs.mkdirSync(dir, { recursive: true });
    return shell.openPath(dir);
  });
  ipcMain.handle('loaders:versions', safe((_e, loader, mc) => loaders.listLoaderVersions(loader, mc)));

  // ----- mods (Modrinth) -----
  ipcMain.handle('mods:search', safe((_e, params) => modrinth.search(params)));
  ipcMain.handle('mods:installed', safe((_e, profileId) => modrinth.listInstalled(profileDir(profileId).dir)));
  ipcMain.handle('mods:install', safe(async (_e, profileId, item) => {
    const { profile, dir } = profileDir(profileId);
    return modrinth.install(item, profile, dir);
  }));
  ipcMain.handle('mods:toggle', safe((_e, profileId, type, file, enabled) => modrinth.setEnabled(profileDir(profileId).dir, type, file, enabled)));
  ipcMain.handle('mods:remove', safe((_e, profileId, type, file) => modrinth.remove(profileDir(profileId).dir, type, file)));

  ipcMain.handle('mods:analyze', safe((_e, profileId) => {
    const { profile, dir } = profileDir(profileId);
    return modrinth.analyze(dir, profile);
  }));
  ipcMain.handle('modpacks:install', (_e, item) =>
    jobs.start(item.title, (report) => installModpack(item, { profiles, root: settings.load().gameDir }, report)));
  ipcMain.handle('templates:list', () => templates.list());
  ipcMain.handle('templates:install', (_e, id) => {
    const t = templates.list().find((x) => x.id === id);
    return jobs.start(t?.name || 'Şablon', (report) => templates.installTemplate(id, { profiles, root: settings.load().gameDir, loaders }, report));
  });
  ipcMain.handle('jobs:list', () => jobs.list());
  ipcMain.handle('jobs:dismiss', (_e, id) => jobs.dismiss(id));

  // ----- servers -----
  ipcMain.handle('servers:list', () => servers.list());
  ipcMain.handle('servers:save', safe((_e, server) => servers.save(server)));
  ipcMain.handle('servers:remove', (_e, id) => servers.remove(id));
  ipcMain.handle('servers:move', (_e, id, delta) => servers.move(id, delta));
  ipcMain.handle('servers:ping', (_e, address) => servers.ping(address));
  ipcMain.handle('servers:discover', async () => {
    if (API_URL) {
      try {
        const res = await fetch(`${API_URL}/servers`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) return await res.json();
      } catch {
        // fall back to the bundled list
      }
    }
    return bundledDiscover;
  });

  // ----- friends -----
  ipcMain.handle('social:state', () => social.state());
  ipcMain.handle('social:send', (_e, msg) => {
    if (['friend.add', 'friend.accept', 'friend.decline', 'friend.cancel', 'friend.remove'].includes(msg?.t)) social.send(msg);
  });
  ipcMain.handle('social:retry', () => social.restart());

  // ----- bug reports -----
  ipcMain.handle('bugreport:preview', (_e, opts) => buildReportExtras(opts));
  ipcMain.handle('bugreport:send', safe(async (_e, report) => {
    const extras = buildReportExtras(report);
    const payload = {
      title: String(report.title || '').trim(),
      category: report.category,
      description: String(report.description || '').trim(),
      steps: String(report.steps || '').trim(),
      contact: String(report.contact || '').trim(),
      version: app.getVersion(),
      ...extras,
    };
    if (!API_URL) {
      // No Hexrona server yet: open a pre-filled GitHub issue instead.
      const repo = news.githubRepo();
      if (!repo) throw new Error('Hata bildirim sunucusu henüz ayarlanmadı.');
      const fence = '```';
      const body = [
        payload.description,
        '', '**Adımlar**', payload.steps || '-',
        '', '**Sistem**', fence + 'json', JSON.stringify(payload.system, null, 2), fence,
        '', '**Log**', fence, (payload.logs || '').split('\n').slice(-60).join('\n'), fence,
      ].join('\n');
      const url = `https://github.com/${repo.owner}/${repo.repo}/issues/new?${new URLSearchParams({ title: payload.title, body: body.slice(0, 6000) })}`;
      shell.openExternal(url);
      return { via: 'github' };
    }
    const res = await fetch(`${API_URL}/bug-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (!res) throw new Error('Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Gönderilemedi (HTTP ${res.status}).`);
    return { via: 'server', id: data.id };
  }));

  // ----- news & updates -----
  ipcMain.handle('news:minecraft', safe(() => news.minecraftNews()));
  ipcMain.handle('news:body', safe((_e, contentPath) => news.minecraftNewsBody(contentPath)));
  ipcMain.handle('news:hexrona', safe(() => news.hexronaReleases()));
  ipcMain.handle('updater:state', () => updater.state());
  ipcMain.handle('updater:check', () => updater.check());
  ipcMain.handle('updater:install', () => updater.install());

  // ----- java -----
  ipcMain.handle('java:pick', safe(async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Java çalıştırılabilir dosyasını seç',
      properties: ['openFile'],
      filters: process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [],
    });
    if (res.canceled) return null;
    const { resolveJava } = require('@xmcl/installer');
    const info = await resolveJava(res.filePaths[0]);
    if (!info) throw new Error('Seçilen dosya çalışan bir Java değil.');
    return { path: info.path, version: info.version, majorVersion: info.majorVersion };
  }));

  // ----- game -----
  ipcMain.handle('game:play', (_e, { profileId, server } = {}) => {
    if (!accounts.list().activeId) return { ok: false, message: 'Oynamak için önce giriş yap.' };
    const profile = profileId ? profiles.get(profileId) : profiles.active();
    if (!profile) return { ok: false, message: 'Önce bir profil oluştur.' };
    if (!profile.mcVersion) return { ok: false, message: 'Bu profilde Minecraft sürümü seçili değil.' };
    const s = settings.load();
    profiles.select(profile.id);
    session.play({
      profile,
      gameDir: profiles.dirFor(profile, s.gameDir),
      root: s.gameDir,
      settings: s,
      server,
      getAuth: accounts.getLaunchAuth,
      onPrepared: (versionId) => {
        profiles.markInstalled(profile.id, versionId);
        send('profiles:changed', profiles.list());
      },
    });
    return { ok: true };
  });
  ipcMain.handle('game:cancel', () => session.cancel());
  ipcMain.handle('game:status', () => ({ status: session.status, ...session.context }));
  ipcMain.handle('game:logs', () => logBuffer.slice());
  ipcMain.handle('game:clearLogs', () => {
    logBuffer.length = 0;
  });

  // ----- shell & window -----
  ipcMain.handle('shell:openGameDir', () => {
    const { gameDir } = settings.load();
    fs.mkdirSync(gameDir, { recursive: true });
    return shell.openPath(gameDir);
  });
  ipcMain.handle('shell:openPath', (_e, target) => shell.showItemInFolder(target));
  ipcMain.handle('shell:openExternal', (_e, url) => /^https:\/\//.test(url) && shell.openExternal(url));
  ipcMain.handle('dialog:pickDir', async () => {
    const res = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] });
    return res.canceled ? null : res.filePaths[0];
  });

  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:toggleMaximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('window:close', () => win?.close());
}

/** Logs and system info attached to bug reports, with personal data stripped. */
function buildReportExtras({ includeLogs, includeSystem }) {
  const home = os.homedir();
  const redact = (text) =>
    text
      .split(home).join('%USERPROFILE%')
      .replace(/(--accessToken\s+)\S+/gi, '$1[gizlendi]')
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[token gizlendi]')
      .replace(/(Session ID is token:)\S+/gi, '$1[gizlendi]');
  const profile = profiles.active();
  const s = settings.load();
  return {
    logs: includeLogs ? redact(logBuffer.slice(-300).join('\n')) : '',
    system: includeSystem
      ? {
          os: `${os.type()} ${os.release()} (${process.arch})`,
          ramGb: Math.round(os.totalmem() / 1024 ** 3),
          cpu: os.cpus()[0]?.model?.trim(),
          launcher: app.getVersion(),
          electron: process.versions.electron,
          profile: profile ? { mcVersion: profile.mcVersion, loader: profile.loader, loaderVersion: profile.loaderVersion } : null,
          java: s.javaPath ? 'custom' : 'auto',
          ramMb: profile?.ramMb || s.ramMb,
        }
      : null,
  };
}

/** Notify once per new Minecraft release/snapshot (first run only records the current one). */
async function checkMinecraftRelease() {
  try {
    const { latest } = await getVersionList();
    const s = settings.load();
    const key = `${latest.release}|${latest.snapshot}`;
    if (s.lastSeenRelease && s.lastSeenRelease !== key) {
      const [prevRelease] = s.lastSeenRelease.split('|');
      const isRelease = prevRelease !== latest.release;
      notify('mcRelease', {
        title: isRelease ? `Minecraft ${latest.release} çıktı!` : `Yeni snapshot: ${latest.snapshot}`,
        body: isRelease ? 'Yeni bir profil oluşturup hemen oynayabilirsin.' : 'Yama notlarını Güncellemeler sayfasında okuyabilirsin.',
        page: 'news',
      });
    }
    settings.save({ lastSeenRelease: key });
  } catch {
    // offline: try again next time
  }
}

/**
 * Development convenience (npm run start:all): run server/index.js alongside the launcher and stop it on quit.
 * If the port is already taken (server started elsewhere) the child just exits and we use the existing one.
 */
let localServer = null;
function startLocalServer() {
  if (app.isPackaged || !process.env.HEXRONA_LOCAL_SERVER) return;
  const { spawn } = require('child_process');
  const entry = path.join(__dirname, '..', 'server', 'index.js');
  if (!fs.existsSync(entry)) return;
  localServer = spawn(process.execPath, [entry], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', PORT: new URL(API_URL || 'http://localhost:8787').port || '8787' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  localServer.stdout.on('data', (d) => console.log(`[server] ${String(d).trim()}`));
  localServer.stderr.on('data', (d) => {
    const text = String(d);
    if (text.includes('EADDRINUSE')) console.log('[server] port dolu, zaten çalışan sunucu kullanılacak');
    else console.error(`[server] ${text.trim()}`);
  });
  localServer.on('exit', () => (localServer = null));
  app.on('will-quit', () => localServer?.kill());
}

// v0.1 stored a bare username in settings; turn it into an offline account once.
function migrateLegacyUsername() {
  const { username } = settings.load();
  if (username && USERNAME_RE.test(username) && accounts.list().accounts.length === 0) accounts.addOffline(username);
  if (username) settings.save({ username: undefined });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(() => {
    startLocalServer();
    protocol.handle('hexrona-media', (request) => {
      const name = path.basename(decodeURIComponent(new URL(request.url).pathname));
      return net.fetch(pathToFileURL(path.join(backgroundsDir(), name)).toString());
    });
    migrateLegacyUsername();
    registerIpc();
    createWindow();
    setLimit(settings.load().downloadLimitMb);
    startSpeedReporter((speed) => send('net:speed', speed));
    social.start();
    setTimeout(checkMinecraftRelease, 15000);
    setInterval(checkMinecraftRelease, 2 * 60 * 60 * 1000);
    updater = createUpdater((state) => send('updater:state', state));
    presence.setEnabled(settings.load().discordRpc);
    presence.update({ status: 'idle' });
  });

  app.on('window-all-closed', () => {
    // Keep the main process alive while the game runs so logs and exit handling keep working.
    if (!session.busy) app.quit();
  });

  app.on('before-quit', () => {
    presence.disconnect();
    social.stop();
  });
}
