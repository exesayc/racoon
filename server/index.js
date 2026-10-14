/**
 * Hexrona backend: friends + presence over WebSocket, bug reports over HTTP.
 *
 * Identity uses Mojang's session handshake (the same one Minecraft servers use), so the launcher never
 * sends its access token here: the client calls sessionserver.mojang.com/join with a random serverId we
 * issue, and we confirm it with /hasJoined.
 *
 * Env:
 *   PORT                 default 8787
 *   DATA_DIR             default ./data
 *   DISCORD_WEBHOOK_URL  optional; bug reports are forwarded here
 *   DEV_INSECURE=1       skip Mojang verification (local testing only, never in production)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8787;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const WEBHOOK = process.env.DISCORD_WEBHOOK_URL || '';
const INSECURE = process.env.DEV_INSECURE === '1';

fs.mkdirSync(path.join(DATA_DIR, 'reports'), { recursive: true });

// ---------------------------------------------------------------- storage

const DB_FILE = path.join(DATA_DIR, 'db.json');
let db = { users: {} };
try {
  db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch {
  // first start
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFileSync(`${DB_FILE}.tmp`, JSON.stringify(db));
    fs.renameSync(`${DB_FILE}.tmp`, DB_FILE);
  }, 500);
}

function user(uuid) {
  return (db.users[uuid] ||= { name: '', friends: [], incoming: [], outgoing: [], lastSeen: 0 });
}
const findByName = (name) => Object.entries(db.users).find(([, u]) => u.name.toLowerCase() === name.toLowerCase())?.[0];
const without = (list, x) => list.filter((v) => v !== x);
const addOnce = (list, x) => (list.includes(x) ? list : list.push(x), list);

// ---------------------------------------------------------------- presence

const sockets = new Map(); // uuid -> Set<ws>
const presence = new Map(); // uuid -> { status, activity }

function publicPresence(uuid) {
  const p = presence.get(uuid);
  const u = db.users[uuid];
  return {
    uuid,
    name: u?.name || '?',
    status: p ? p.status : 'offline',
    activity: p?.activity || null,
    lastSeen: u?.lastSeen || 0,
  };
}

function stateFor(uuid) {
  const u = user(uuid);
  return {
    t: 'state',
    me: { uuid, name: u.name },
    friends: u.friends.map(publicPresence),
    incoming: u.incoming.map((id) => ({ uuid: id, name: db.users[id]?.name || '?' })),
    outgoing: u.outgoing.map((id) => ({ uuid: id, name: db.users[id]?.name || '?' })),
  };
}

function send(uuid, msg) {
  for (const ws of sockets.get(uuid) || []) if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
const push = (...uuids) => uuids.forEach((id) => send(id, stateFor(id)));
const pushToFriends = (uuid) => user(uuid).friends.forEach((f) => push(f));

// ---------------------------------------------------------------- auth

async function verify(name, serverId) {
  if (INSECURE) return crypto.createHash('md5').update(`dev:${name}`).digest('hex');
  const url = `https://sessionserver.mojang.com/session/minecraft/hasJoined?username=${encodeURIComponent(name)}&serverId=${encodeURIComponent(serverId)}`;
  const res = await fetch(url);
  if (res.status !== 200) return null;
  const body = await res.json();
  return body.id;
}

// ---------------------------------------------------------------- friend actions

const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

function handle(uuid, msg) {
  const me = user(uuid);
  switch (msg.t) {
    case 'presence': {
      const status = msg.status === 'playing' ? 'playing' : 'online';
      const a = msg.activity || {};
      const activity = status === 'playing'
        ? { mcVersion: String(a.mcVersion || '').slice(0, 24), loader: String(a.loader || '').slice(0, 16), server: a.server ? String(a.server).slice(0, 64) : null }
        : null;
      presence.set(uuid, { status, activity });
      pushToFriends(uuid);
      return;
    }
    case 'friend.add': {
      const name = String(msg.name || '').trim();
      if (!NAME_RE.test(name)) return send(uuid, { t: 'error', message: 'Geçerli bir Minecraft adı gir.' });
      const target = findByName(name);
      if (!target) return send(uuid, { t: 'error', message: `${name} henüz Hexrona kullanmıyor.` });
      if (target === uuid) return send(uuid, { t: 'error', message: 'Kendini arkadaş olarak ekleyemezsin.' });
      if (me.friends.includes(target)) return send(uuid, { t: 'error', message: `${name} zaten arkadaşın.` });
      const them = user(target);
      if (me.incoming.includes(target)) {
        // They already asked us: treat as accept.
        me.incoming = without(me.incoming, target);
        them.outgoing = without(them.outgoing, uuid);
        addOnce(me.friends, target);
        addOnce(them.friends, uuid);
      } else if (!me.outgoing.includes(target)) {
        if (me.outgoing.length >= 100) return send(uuid, { t: 'error', message: 'Çok fazla bekleyen isteğin var.' });
        me.outgoing.push(target);
        them.incoming.push(uuid);
        send(target, { t: 'notify', kind: 'request', name: me.name });
      }
      save();
      return push(uuid, target);
    }
    case 'friend.accept':
    case 'friend.decline': {
      const other = String(msg.uuid || '');
      if (!me.incoming.includes(other)) return;
      const them = user(other);
      me.incoming = without(me.incoming, other);
      them.outgoing = without(them.outgoing, uuid);
      if (msg.t === 'friend.accept') {
        addOnce(me.friends, other);
        addOnce(them.friends, uuid);
        send(other, { t: 'notify', kind: 'accepted', name: me.name });
      }
      save();
      return push(uuid, other);
    }
    case 'friend.cancel': {
      const other = String(msg.uuid || '');
      const them = user(other);
      me.outgoing = without(me.outgoing, other);
      them.incoming = without(them.incoming, uuid);
      save();
      return push(uuid, other);
    }
    case 'friend.remove': {
      const other = String(msg.uuid || '');
      const them = user(other);
      me.friends = without(me.friends, other);
      them.friends = without(them.friends, uuid);
      save();
      return push(uuid, other);
    }
    default:
  }
}

// ---------------------------------------------------------------- http

const rate = new Map(); // ip -> timestamps
function limited(ip, max, windowMs) {
  const now = Date.now();
  const list = (rate.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now);
  rate.set(ip, list);
  return list.length > max;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
};

const CATEGORIES = ['launch', 'download', 'mods', 'ui', 'account', 'other'];
const clip = (v, n) => String(v || '').slice(0, n);

async function bugReport(req, res) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (limited(ip, 5, 60 * 60 * 1000)) return json(res, 429, { error: 'Çok fazla rapor gönderdin, biraz sonra tekrar dene.' });

  let body;
  try {
    body = JSON.parse(await readBody(req, 300 * 1024));
  } catch (e) {
    return json(res, e.status || 400, { error: 'Geçersiz istek.' });
  }
  const report = {
    id: crypto.randomBytes(4).toString('hex').toUpperCase(),
    at: new Date().toISOString(),
    title: clip(body.title, 120),
    category: CATEGORIES.includes(body.category) ? body.category : 'other',
    description: clip(body.description, 5000),
    steps: clip(body.steps, 3000),
    contact: clip(body.contact, 120),
    version: clip(body.version, 20),
    system: body.system && typeof body.system === 'object' ? JSON.parse(JSON.stringify(body.system).slice(0, 4000)) : null,
    logs: clip(body.logs, 200 * 1024),
  };
  if (report.title.length < 5 || report.description.length < 10) return json(res, 400, { error: 'Başlık ve açıklama çok kısa.' });

  fs.writeFileSync(path.join(DATA_DIR, 'reports', `${report.id}.json`), JSON.stringify(report, null, 2));

  if (WEBHOOK) {
    const tail = report.logs ? report.logs.split('\n').slice(-25).join('\n').slice(-900) : '';
    fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Hexrona Hata Bildirimi',
        embeds: [{
          title: `#${report.id} · ${report.title}`,
          description: report.description.slice(0, 1800),
          color: 0xe2252e,
          fields: [
            { name: 'Kategori', value: report.category, inline: true },
            { name: 'Sürüm', value: report.version || '?', inline: true },
            ...(report.contact ? [{ name: 'İletişim', value: report.contact, inline: true }] : []),
            ...(report.steps ? [{ name: 'Adımlar', value: report.steps.slice(0, 1000) }] : []),
            ...(tail ? [{ name: 'Log (son satırlar)', value: '```\n' + tail + '\n```' }] : []),
          ],
          timestamp: report.at,
        }],
      }),
    }).catch(() => {});
  }
  json(res, 200, { id: report.id });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, users: Object.keys(db.users).length, online: sockets.size });
  if (req.method === 'GET' && url.pathname === '/servers') {
    const custom = path.join(DATA_DIR, 'discover.json');
    const file = fs.existsSync(custom) ? custom : path.join(__dirname, 'discover.json');
    return json(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
  }
  if (req.method === 'POST' && url.pathname === '/bug-report') return bugReport(req, res);
  json(res, 404, { error: 'not found' });
});

// ---------------------------------------------------------------- websocket

const wss = new WebSocketServer({ server, path: '/social', maxPayload: 16 * 1024 });

wss.on('connection', (ws) => {
  const serverId = crypto.randomBytes(16).toString('hex');
  let uuid = null;
  let messages = 0;
  const flood = setInterval(() => (messages = 0), 10000);
  ws.send(JSON.stringify({ t: 'challenge', serverId }));
  const authTimer = setTimeout(() => !uuid && ws.close(4001, 'auth timeout'), 20000);

  ws.on('message', async (raw) => {
    if (++messages > 60) return ws.close(4008, 'rate limit');
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (!uuid) {
      if (msg.t !== 'auth' || !NAME_RE.test(String(msg.name || ''))) return ws.close(4001, 'bad auth');
      const id = await verify(msg.name, serverId).catch(() => null);
      if (!id) return ws.close(4003, 'verification failed');
      uuid = id;
      clearTimeout(authTimer);
      const u = user(uuid);
      const renamed = u.name && u.name !== msg.name;
      u.name = msg.name;
      save();
      if (!sockets.has(uuid)) sockets.set(uuid, new Set());
      sockets.get(uuid).add(ws);
      if (!presence.has(uuid)) {
        presence.set(uuid, { status: 'online', activity: null });
        u.friends.forEach((f) => send(f, { t: 'notify', kind: 'online', name: u.name }));
      }
      push(uuid);
      pushToFriends(uuid);
      if (renamed) save();
      return;
    }
    handle(uuid, msg);
  });

  ws.on('close', () => {
    clearInterval(flood);
    clearTimeout(authTimer);
    if (!uuid) return;
    const set = sockets.get(uuid);
    set?.delete(ws);
    if (set && set.size === 0) {
      sockets.delete(uuid);
      presence.delete(uuid);
      user(uuid).lastSeen = Date.now();
      save();
      pushToFriends(uuid);
    }
  });
});

// Drop dead connections (sleeping laptops etc.).
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) ws.terminate();
    else {
      ws.isAlive = false;
      ws.ping();
    }
  }
}, 30000);
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
});

server.listen(PORT, () => {
  console.log(`Hexrona server listening on :${PORT}${INSECURE ? ' (DEV_INSECURE: Mojang doğrulaması KAPALI)' : ''}`);
});
