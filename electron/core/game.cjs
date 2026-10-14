const { launch, createMinecraftProcessWatcher } = require('@xmcl/core');
const { prepareProfile } = require('./install.cjs');

/** Quick Play (1.20+) replaced the old --server/--port arguments. */
function supportsQuickPlay(mc) {
  const snapshot = mc.match(/^(\d{2})w\d{2}/);
  if (snapshot) return Number(snapshot[1]) >= 23;
  const release = mc.match(/^1\.(\d+)/);
  if (release) return Number(release[1]) >= 20;
  return /^\d{2}\./.test(mc); // 26.x and later
}

function splitArgs(text) {
  return (text || '').match(/(?:[^\s"]+|"[^"]*")+/g)?.map((a) => a.replace(/^"|"$/g, '')) || [];
}

/**
 * Owns the single game session: prepare profile -> launch -> running -> exit.
 * Emits through `events`: state(status, detail), progress(p), log(line).
 */
class GameSession {
  constructor(events) {
    this.events = events;
    this.status = 'idle';
    this.track = { current: null };
    this.cancelled = false;
    this.process = null;
  }

  setStatus(status, detail = {}) {
    this.status = status;
    this.events.state(status, { ...this.context, ...detail });
  }

  get busy() {
    return this.status === 'installing' || this.status === 'launching' || this.status === 'running';
  }

  /**
   * profile: profile record; gameDir: its folder; root: shared versions/libraries/assets folder.
   * server: optional "host[:port]" to join directly.
   */
  async play({ profile, gameDir, root, settings, getAuth, server, onPrepared }) {
    if (this.busy) return;
    this.cancelled = false;
    this.track.cancelled = false;
    this.context = { profileId: profile.id, server: server || null };
    const onProgress = (p) => this.events.progress(p);

    try {
      this.setStatus('installing');
      const { versionId, javaPath } = await prepareProfile(profile, root, settings, onProgress, this.track);
      if (this.cancelled) throw cancelledError();
      onPrepared?.(versionId);

      this.setStatus('launching');
      // Resolved last so a Microsoft token refreshed here is valid when the game starts.
      const auth = await getAuth();
      const ramMb = profile.ramMb || settings.ramMb;
      const jvmArgs = splitArgs([settings.jvmArgs, profile.jvmArgs].filter(Boolean).join(' '));
      const { width, height, fullscreen } = settings.resolution || {};

      let serverOptions = {};
      if (server) {
        const [host, port] = server.split(':');
        serverOptions = supportsQuickPlay(profile.mcVersion)
          ? { quickPlayMultiplayer: server }
          : { server: { ip: host, port: port ? Number(port) : undefined } };
      }

      const proc = await launch({
        gamePath: gameDir,
        resourcePath: root,
        javaPath,
        version: versionId,
        gameProfile: { name: auth.name, id: auth.uuid },
        accessToken: auth.accessToken,
        userType: auth.userType,
        launcherName: 'Hexrona',
        launcherBrand: 'Hexrona',
        minMemory: Math.min(1024, ramMb),
        maxMemory: ramMb,
        // Leaving this undefined keeps xmcl's tuned default GC flags.
        ...(jvmArgs.length ? { extraJVMArgs: jvmArgs } : {}),
        ...(fullscreen ? { resolution: { fullscreen: true } } : width && height ? { resolution: { width, height } } : {}),
        ...serverOptions,
      });
      this.process = proc;
      this.attach(proc, versionId);
    } catch (e) {
      this.track.current = null;
      if (this.cancelled || e?.name === 'CancelledError') {
        this.setStatus('idle');
      } else {
        // Never echo auth details into the log; AuthError messages are already user-facing.
        this.events.log(`[Hexrona] ${e?.name === 'AuthError' ? e.message : e?.stack || e}`);
        this.setStatus('error', { message: friendlyError(e) });
      }
    }
  }

  attach(proc, versionId) {
    const pipe = (stream) => {
      let buffer = '';
      stream.setEncoding('utf8');
      stream.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        for (const line of lines) if (line) this.events.log(line);
      });
    };
    pipe(proc.stdout);
    pipe(proc.stderr);

    const watcher = createMinecraftProcessWatcher(proc);
    watcher.on('minecraft-window-ready', () => this.status === 'launching' && this.setStatus('running', { versionId }));
    watcher.on('error', (e) => {
      this.process = null;
      this.setStatus('error', { message: friendlyError(e) });
    });
    watcher.on('minecraft-exit', ({ code, crashReport, crashReportLocation }) => {
      this.process = null;
      if (code === 0 || this.cancelled) {
        this.setStatus('idle', { exited: true });
      } else {
        if (crashReport) this.events.log(crashReport);
        this.setStatus('error', {
          message: `Oyun beklenmedik şekilde kapandı (kod ${code}).`,
          crashReportLocation,
        });
      }
    });
    // The window-ready heuristic can miss on some versions; don't stay in "launching" forever.
    setTimeout(() => {
      if (this.status === 'launching' && this.process === proc) this.setStatus('running', { versionId });
    }, 20000);
  }

  async cancel() {
    this.cancelled = true;
    this.track.cancelled = true;
    if (this.track.current) await this.track.current.cancel().catch(() => {});
    if (this.process) this.process.kill();
  }
}

function cancelledError() {
  const e = new Error('cancelled');
  e.name = 'CancelledError';
  return e;
}

function friendlyError(e) {
  const msg = String(e?.message || e);
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|fetch failed|EAI_AGAIN/i.test(msg)) {
    return 'Sunuculara bağlanılamadı. İnternet bağlantını kontrol edip tekrar dene.';
  }
  if (/ENOSPC/i.test(msg)) return 'Diskte yeterli boş alan yok.';
  if (/EPERM|EACCES/i.test(msg)) return 'Oyun klasörüne yazılamıyor. Klasör izinlerini kontrol et.';
  return msg;
}

module.exports = { GameSession };
