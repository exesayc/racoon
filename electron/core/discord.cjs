const { Client } = require('@xhayper/discord-rpc');
const pkg = require('../../package.json');

/**
 * Discord Rich Presence. Needs an application id from https://discord.com/developers/applications
 * with an art asset named "logo". Silently does nothing when Discord isn't running.
 */
const CLIENT_ID = process.env.HEXRONA_DISCORD_CLIENT_ID || pkg.hexrona?.discordClientId || '';

class Presence {
  constructor() {
    this.client = null;
    this.ready = false;
    this.enabled = false;
    this.activity = null;
    this.retry = null;
  }

  get configured() {
    return /^\d{15,25}$/.test(CLIENT_ID);
  }

  setEnabled(enabled) {
    this.enabled = enabled && this.configured;
    if (this.enabled) this.connect();
    else this.disconnect();
  }

  async connect() {
    if (this.client || !this.enabled) return;
    this.client = new Client({ clientId: CLIENT_ID, transport: { type: 'ipc' } });
    this.client.on('ready', () => {
      this.ready = true;
      this.flush();
    });
    this.client.on('disconnected', () => this.reset(true));
    try {
      await this.client.login();
    } catch {
      this.reset(true); // Discord not running: try again later
    }
  }

  reset(scheduleRetry) {
    this.ready = false;
    this.client?.destroy().catch(() => {});
    this.client = null;
    clearTimeout(this.retry);
    if (scheduleRetry && this.enabled) this.retry = setTimeout(() => this.connect(), 30000);
  }

  disconnect() {
    clearTimeout(this.retry);
    if (this.client && this.ready) this.client.user?.clearActivity().catch(() => {});
    this.reset(false);
  }

  /** state: { status, profile?, server? } */
  update({ status, profile, server }) {
    const loader = profile && profile.loader !== 'vanilla' ? ` · ${profile.loader[0].toUpperCase()}${profile.loader.slice(1)}` : '';
    const version = profile ? `Minecraft ${profile.mcVersion}${loader}` : 'Minecraft';
    if (status === 'running') {
      this.runningSince ||= Date.now();
      this.activity = {
        details: server ? `${server} sunucusunda` : version,
        state: server ? version : profile?.name ? `Profil: ${profile.name}` : undefined,
        startTimestamp: this.runningSince,
      };
    } else {
      this.runningSince = null;
      this.activity = {
        details: status === 'installing' ? `${version} hazırlanıyor` : status === 'launching' ? `${version} başlatılıyor` : 'Launcher\'da',
        state: status === 'idle' ? 'Oyun seçiyor' : undefined,
      };
    }
    this.flush();
  }

  flush() {
    if (!this.ready || !this.activity) return;
    this.client.user
      ?.setActivity({
        ...this.activity,
        largeImageKey: 'logo',
        largeImageText: `Hexrona ${pkg.version}`,
        instance: false,
      })
      .catch(() => {});
  }
}

module.exports = { presence: new Presence() };
