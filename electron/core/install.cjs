const fs = require('fs');
const path = require('path');
const { MinecraftFolder, Version } = require('@xmcl/core');
const {
  installTask,
  installDependenciesTask,
  installJavaRuntimeTask,
  DEFAULT_RUNTIME_ALL_URL,
} = require('@xmcl/installer');
const { getRemoteVersion } = require('./versions.cjs');
const { installLoader } = require('./loaders.cjs');
const { getJson } = require('./http.cjs');
const { dispatcher } = require('./dispatcher.cjs');

const NET = { dispatcher };

const STAGE_LABELS = [
  ['json', 'Sürüm bilgisi indiriliyor'],
  ['jar', 'Oyun dosyası indiriliyor'],
  ['librar', 'Kütüphaneler indiriliyor'],
  ['asset', 'Ses ve dokular indiriliyor'],
];

function stageFor(task, fallback) {
  const key = `${task.path || ''}.${task.name || ''}`.toLowerCase();
  const hit = STAGE_LABELS.find(([needle]) => key.includes(needle));
  return hit ? hit[1] : fallback;
}

/**
 * Run an xmcl task and forward byte progress of the whole task tree.
 * `track.current` holds the running task so the caller can cancel it.
 */
async function runTask(task, fallbackStage, onProgress, track) {
  track.current = task;
  let last = 0;
  const report = (child) => {
    const now = Date.now();
    if (now - last < 100) return;
    last = now;
    onProgress({ stage: stageFor(child, fallbackStage), done: task.progress, total: task.total });
  };
  try {
    onProgress({ stage: fallbackStage, done: 0, total: 0 });
    return await task.startAndWait({ onStart: report, onUpdate: report });
  } finally {
    track.current = null;
  }
}

/**
 * xmcl tasks are single-use and fail as a whole if any one of thousands of downloads drops.
 * Re-run with a fresh task: files already on disk are skipped, so each attempt only fetches what's missing.
 */
async function runWithRetry(makeTask, stage, onProgress, track, attempts = 5) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runTask(makeTask(), stage, onProgress, track);
    } catch (e) {
      if (e?.name === 'CancelledError' || track.cancelled || attempt >= attempts) throw summarize(e);
      onProgress({ stage: `Bağlantı hatası, yeniden deneniyor (${attempt}/${attempts - 1})`, done: 0, total: 0 });
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
}

/** AggregateErrors from parallel downloads carry hundreds of entries; keep the message readable. */
function summarize(e) {
  if (!(e instanceof AggregateError)) return e;
  const first = e.errors?.[0];
  const err = new Error(`${e.errors?.length || 0} dosya indirilemedi (${first?.code || first?.message || 'ağ hatası'}). İnternet bağlantını kontrol edip tekrar dene.`);
  err.cause = e;
  return err;
}

/**
 * Make sure the version json, client jar, libraries and assets are present and valid.
 * Works offline when the version is already installed.
 */
async function installVersion(gameDir, versionId, onProgress, track) {
  const mc = MinecraftFolder.from(gameDir);
  const installed = fs.existsSync(mc.getVersionJson(versionId));

  let info = null;
  try {
    info = await getRemoteVersion(versionId);
  } catch (e) {
    if (!installed) throw new Error('Sürüm listesine ulaşılamadı. İnternet bağlantını kontrol et.');
  }

  if (info) {
    return runWithRetry(() => installTask(info, mc, NET), 'Oyun dosyaları hazırlanıyor', onProgress, track);
  }
  if (!installed) throw new Error(`"${versionId}" sürümü bulunamadı.`);

  // Local-only version (offline or a custom profile): verify what we can.
  const resolved = await Version.parse(mc, versionId);
  try {
    await runTask(installDependenciesTask(resolved, NET), 'Dosyalar doğrulanıyor', onProgress, track);
  } catch (e) {
    if (e?.name === 'CancelledError') throw e;
    // Offline: launch with what is on disk; the launch precheck reports anything missing.
  }
  return resolved;
}

function javaExecutable(runtimeDir) {
  if (process.platform === 'win32') return path.join(runtimeDir, 'bin', 'javaw.exe');
  if (process.platform === 'darwin') return path.join(runtimeDir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(runtimeDir, 'bin', 'java');
}

function runtimePlatformKey() {
  const arm = process.arch === 'arm64';
  switch (process.platform) {
    case 'win32':
      return arm ? 'windows-arm64' : process.arch === 'ia32' ? 'windows-x86' : 'windows-x64';
    case 'darwin':
      return arm ? 'mac-os-arm64' : 'mac-os';
    default:
      return process.arch === 'ia32' ? 'linux-i386' : 'linux';
  }
}

// xmcl's fetchJavaRuntimeManifest breaks with the bundled undici, so resolve it with global fetch.
async function fetchJavaManifest(component) {
  const all = await getJson(DEFAULT_RUNTIME_ALL_URL);
  const target = all[runtimePlatformKey()]?.[component]?.[0];
  if (!target) throw new Error(`Bu platform için Java (${component}) bulunamadı.`);
  const { files } = await getJson(target.manifest.url);
  return { target: component, files, version: target.version };
}

/** Install Mojang's official Java runtime for this version, so users never install Java themselves. */
async function ensureJava(gameDir, resolved, onProgress, track) {
  const component = resolved.javaVersion?.component || 'jre-legacy';
  const runtimeDir = path.join(gameDir, 'runtime', component);
  const exe = javaExecutable(runtimeDir);
  const marker = path.join(runtimeDir, '.hexrona-installed');
  if (fs.existsSync(exe) && fs.existsSync(marker)) return exe;

  const stage = `Java ${resolved.javaVersion?.majorVersion || ''} indiriliyor`;
  onProgress({ stage, done: 0, total: 0 });
  const manifest = await fetchJavaManifest(component);
  await runWithRetry(() => installJavaRuntimeTask({ destination: runtimeDir, manifest, ...NET }), stage, onProgress, track);

  if (!fs.existsSync(exe)) throw new Error('Java kuruldu ancak çalıştırılabilir dosya bulunamadı.');
  fs.writeFileSync(marker, manifest.version?.name || component);
  return exe;
}

/**
 * Get everything a profile needs on disk: vanilla files, Java, and the mod loader with its libraries.
 * Returns the version id to launch and the Java executable.
 */
async function prepareProfile(profile, root, { javaPath: customJava }, onProgress, track) {
  const base = await installVersion(root, profile.mcVersion, onProgress, track);
  const javaPath = customJava || (await ensureJava(root, base, onProgress, track));
  if (profile.loader === 'vanilla') return { versionId: profile.mcVersion, javaPath };

  const mc = MinecraftFolder.from(root);
  let versionId = profile.versionId;
  if (!versionId || !fs.existsSync(mc.getVersionJson(versionId))) {
    onProgress({ stage: 'Mod yükleyici hazırlanıyor', done: 0, total: 0 });
    // Forge/NeoForge installers run Java processors whose output we need, so prefer java over javaw.
    const consoleJava = javaPath.replace(/javaw\.exe$/i, 'java.exe');
    versionId = await installLoader(profile, root, consoleJava, NET, (task, stage) => runTask(task, stage, onProgress, track));
  }

  const resolved = await Version.parse(mc, versionId);
  await runWithRetry(() => installDependenciesTask(resolved, NET), 'Mod yükleyici kütüphaneleri indiriliyor', onProgress, track);
  return { versionId, javaPath };
}

module.exports = { installVersion, ensureJava, prepareProfile, runTask };
