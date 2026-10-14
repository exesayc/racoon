const pkg = require('../../package.json');

/** Base URL of the Hexrona server (friends + bug reports). Empty = feature not configured. */
const API_URL = (process.env.HEXRONA_API_URL || pkg.hexrona?.apiUrl || '').replace(/\/$/, '');

/**
 * Friends/presence client. Authenticates with Mojang's session handshake: we "join" a random serverId
 * issued by the Hexrona server, which then confirms it with Mojang. The access token never leaves the PC
 * except to Mojang.
 */
function createSocial({ getAuth, getActiveAccount, onState, onNotify }) {
  let ws = null;
  let retry = null;
  let attempt = 0;
  let stopped = true;
  let presence = { status: 'online', activity: null };
  let state = { status: API_URL ? 'idle' : 'disabled' };

  const emit = (patch) => {
    state = { ...state, ...patch };
    onState(state);
  };

  async function mojangJoin(serverId) {
    const auth = await getAuth();
    const res = await fetch('https://sessionserver.mojang.com/session/minecraft/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: auth.accessToken, selectedProfile: auth.uuid.replace(/-/g, ''), serverId }),
    });
    if (res.status !== 204 && res.status !== 200) throw new Error(`Mojang doğrulaması başarısız (HTTP ${res.status}).`);
    return auth.name;
  }

  function connect() {
    if (!API_URL || stopped) return;
    const account = getActiveAccount();
    if (!account) return emit({ status: 'no-account', friends: [], incoming: [], outgoing: [] });
    if (account.type !== 'microsoft' && !process.env.HEXRONA_SOCIAL_INSECURE) {
      return emit({ status: 'offline-account', friends: [], incoming: [], outgoing: [] });
    }

    emit({ status: 'connecting', error: null });
    const socket = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/social`);
    ws = socket;

    socket.onmessage = async (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.t === 'challenge') {
        try {
          const name = process.env.HEXRONA_SOCIAL_INSECURE ? account.name : await mojangJoin(msg.serverId);
          socket.send(JSON.stringify({ t: 'auth', name }));
        } catch (e) {
          emit({ status: 'error', error: e.message });
          socket.close();
        }
      } else if (msg.t === 'state') {
        attempt = 0;
        const first = state.status !== 'connected';
        emit({ status: 'connected', me: msg.me, friends: msg.friends, incoming: msg.incoming, outgoing: msg.outgoing, error: null });
        // Only on (re)connect: answering every state push with presence would ping-pong between friends.
        if (first) sendPresence();
      } else if (msg.t === 'error') {
        onNotify({ kind: 'error', message: msg.message });
      } else if (msg.t === 'notify') {
        onNotify(msg);
      }
    };

    socket.onclose = (event) => {
      if (ws !== socket) return;
      ws = null;
      if (stopped) return;
      const authFailed = event.code === 4003 || event.code === 4001;
      emit({ status: 'error', error: authFailed ? 'Hesap doğrulanamadı. Çıkış yapıp tekrar giriş yapmayı dene.' : 'Sunucuya bağlanılamadı.' });
      attempt += 1;
      clearTimeout(retry);
      retry = setTimeout(connect, Math.min(60000, 2000 * 2 ** Math.min(attempt, 5)));
    };
    socket.onerror = () => {};
  }

  function sendPresence() {
    if (ws?.readyState === 1) ws.send(JSON.stringify({ t: 'presence', ...presence }));
  }

  return {
    configured: !!API_URL,
    apiUrl: API_URL,
    state: () => state,
    start() {
      stopped = false;
      connect();
    },
    /** Account switched or logged out: start over with the new identity. */
    restart() {
      clearTimeout(retry);
      const old = ws;
      ws = null;
      old?.close();
      attempt = 0;
      stopped = false;
      connect();
    },
    stop() {
      stopped = true;
      clearTimeout(retry);
      ws?.close();
    },
    setPresence(next) {
      presence = next;
      sendPresence();
    },
    send(msg) {
      if (ws?.readyState === 1) ws.send(JSON.stringify(msg));
      else onNotify({ kind: 'error', message: 'Arkadaş sunucusuna bağlı değilsin.' });
    },
  };
}

module.exports = { createSocial, API_URL };
