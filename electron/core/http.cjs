const pkg = require('../../package.json');

const USER_AGENT = `Hexrona/${pkg.version} (github.com/${pkg.build?.publish?.[0]?.owner || 'hexrona'}/${pkg.build?.publish?.[0]?.repo || 'hexrona'})`;

async function request(url, { timeout = 15000, headers = {}, ...init } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...headers }, signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}: ${url}`);
      err.status = res.status;
      throw err;
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

const getJson = async (url, opts) => (await request(url, opts)).json();
const getText = async (url, opts) => (await request(url, opts)).text();
const getBuffer = async (url, opts) => Buffer.from(await (await request(url, { timeout: 120000, ...opts })).arrayBuffer());

module.exports = { request, getJson, getText, getBuffer, USER_AGENT };
