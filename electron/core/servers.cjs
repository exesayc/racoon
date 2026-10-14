const fs = require('fs');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const crypto = require('crypto');
const { app } = require('electron');

const file = () => path.join(app.getPath('userData'), 'servers.json');
let servers = null;

function load() {
  if (servers) return servers;
  try {
    servers = JSON.parse(fs.readFileSync(file(), 'utf8'));
  } catch {
    servers = [{ id: 'hypixel', name: 'Hypixel', address: 'mc.hypixel.net' }];
  }
  return servers;
}

function persist() {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(servers, null, 2));
}

const ADDRESS_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i;

function save({ id, name, address }) {
  const list = load();
  const clean = { name: String(name || '').trim().slice(0, 40), address: String(address || '').trim().toLowerCase() };
  if (!ADDRESS_RE.test(clean.address)) throw new Error('Geçerli bir sunucu adresi gir (ör. mc.hypixel.net).');
  if (!clean.name) clean.name = clean.address;
  const existing = id && list.find((s) => s.id === id);
  if (existing) Object.assign(existing, clean);
  else list.push({ id: crypto.randomBytes(4).toString('hex'), ...clean });
  persist();
  return list;
}

function remove(id) {
  servers = load().filter((s) => s.id !== id);
  persist();
  return servers;
}

function move(id, delta) {
  const list = load();
  const i = list.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  persist();
  return list;
}

// ---------- Server List Ping (https://minecraft.wiki/w/Java_Edition_protocol/Server_List_Ping) ----------

function varint(value) {
  const bytes = [];
  let v = value >>> 0;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v) b |= 0x80;
    bytes.push(b);
  } while (v);
  return Buffer.from(bytes);
}

function readVarint(buf, offset) {
  let value = 0;
  let size = 0;
  let byte;
  do {
    if (offset + size >= buf.length) return null;
    byte = buf[offset + size];
    value |= (byte & 0x7f) << (7 * size);
    size += 1;
    if (size > 5) throw new Error('VarInt too big');
  } while (byte & 0x80);
  return { value, size };
}

const packet = (id, payload = Buffer.alloc(0)) => {
  const body = Buffer.concat([varint(id), payload]);
  return Buffer.concat([varint(body.length), body]);
};

const mcString = (s) => {
  const b = Buffer.from(s, 'utf8');
  return Buffer.concat([varint(b.length), b]);
};

async function resolveAddress(address) {
  const [host, portText] = address.split(':');
  if (portText) return { host, port: Number(portText) };
  try {
    const [srv] = await dns.resolveSrv(`_minecraft._tcp.${host}`);
    if (srv) return { host: srv.name, port: srv.port };
  } catch {
    // no SRV record: default port
  }
  return { host, port: 25565 };
}

/** Flatten a chat component into a legacy §-formatted string the renderer can colour. */
const COLORS = {
  black: '0', dark_blue: '1', dark_green: '2', dark_aqua: '3', dark_red: '4', dark_purple: '5', gold: '6', gray: '7',
  dark_gray: '8', blue: '9', green: 'a', aqua: 'b', red: 'c', light_purple: 'd', yellow: 'e', white: 'f',
};
function flatten(component) {
  if (component == null) return '';
  if (typeof component === 'string') return component;
  if (Array.isArray(component)) return component.map(flatten).join('');
  let out = '';
  if (component.color && COLORS[component.color]) out += `§${COLORS[component.color]}`;
  else if (component.color?.startsWith?.('#')) out += `§#${component.color.slice(1)}`;
  if (component.bold) out += '§l';
  if (component.italic) out += '§o';
  out += component.text ?? component.translate ?? '';
  if (component.extra) out += component.extra.map((c) => `§r${flatten(c)}`).join('');
  return out;
}

function ping(address, timeout = 5000) {
  return new Promise(async (resolve) => {
    let target;
    try {
      target = await resolveAddress(address);
    } catch {
      return resolve({ online: false, error: 'Adres çözülemedi' });
    }

    const socket = net.createConnection({ host: target.host, port: target.port });
    let buffer = Buffer.alloc(0);
    let status = null;
    let sentAt = 0;
    const done = (result) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(result);
    };
    const timer = setTimeout(() => done(status ? { ...status, latency: null } : { online: false, error: 'Zaman aşımı' }), timeout);

    socket.on('connect', () => {
      const port = Buffer.alloc(2);
      port.writeUInt16BE(target.port);
      socket.write(packet(0x00, Buffer.concat([varint(767), mcString(target.host), port, varint(1)])));
      socket.write(packet(0x00));
    });

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const len = readVarint(buffer, 0);
      if (!len || buffer.length < len.size + len.value) return;
      const body = buffer.subarray(len.size, len.size + len.value);
      buffer = buffer.subarray(len.size + len.value);
      const id = readVarint(body, 0);

      if (id.value === 0x00 && !status) {
        const strLen = readVarint(body, id.size);
        const json = JSON.parse(body.subarray(id.size + strLen.size, id.size + strLen.size + strLen.value).toString('utf8'));
        status = {
          online: true,
          motd: flatten(json.description),
          players: { online: json.players?.online ?? 0, max: json.players?.max ?? 0 },
          version: flatten(json.version?.name) || '',
          favicon: typeof json.favicon === 'string' && json.favicon.startsWith('data:image/') ? json.favicon : null,
        };
        sentAt = Date.now();
        const payload = Buffer.alloc(8);
        payload.writeBigInt64BE(BigInt(sentAt));
        socket.write(packet(0x01, payload));
      } else if (id.value === 0x01 && status) {
        done({ ...status, latency: Date.now() - sentAt });
      }
    });

    socket.on('error', () => done(status ? { ...status, latency: null } : { online: false, error: 'Bağlanılamadı' }));
  });
}

module.exports = { list: load, save, remove, move, ping };
