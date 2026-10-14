const path = require('path');

// Use the exact undici instance @xmcl/file-transfer was built against, so its Agent is compatible.
const installerDir = path.dirname(require.resolve('@xmcl/installer/package.json'));
const transferDir = path.dirname(require.resolve('@xmcl/file-transfer/package.json', { paths: [installerDir] }));
const undiciEntry = require.resolve('undici', { paths: [transferDir] });
const undici = require(undiciEntry);
const WrapHandler = require(path.join(path.dirname(undiciEntry), 'lib', 'handler', 'wrap-handler.js'));
const { Agent, interceptors } = undici;

// ---------- global bandwidth meter + limiter (token bucket shared by every download) ----------

const meter = { bytes: 0 };
let limitBps = 0; // 0 = unlimited
let allowance = 0;
let lastRefill = Date.now();

function setLimit(mbPerSecond) {
  limitBps = mbPerSecond > 0 ? mbPerSecond * 1024 * 1024 : 0;
  allowance = limitBps;
}

/** Returns how long to wait (ms) before more data may flow. */
function consume(bytes) {
  meter.bytes += bytes;
  if (!limitBps) return 0;
  const now = Date.now();
  allowance = Math.min(limitBps, allowance + ((now - lastRefill) / 1000) * limitBps);
  lastRefill = now;
  allowance -= bytes;
  return allowance >= 0 ? 0 : Math.ceil((-allowance / limitBps) * 1000);
}

const throttle = (dispatch) => (opts, handler) => {
  const inner = WrapHandler.wrap(handler);
  return dispatch(opts, {
    onRequestStart: (...a) => inner.onRequestStart?.(...a),
    onRequestUpgrade: (...a) => inner.onRequestUpgrade?.(...a),
    onResponseStart: (...a) => inner.onResponseStart?.(...a),
    onResponseData(controller, chunk) {
      const wait = consume(chunk.length);
      if (wait > 0 && !controller.paused) {
        controller.pause();
        setTimeout(() => controller.resume(), wait);
      }
      return inner.onResponseData?.(controller, chunk);
    },
    onResponseEnd: (...a) => inner.onResponseEnd?.(...a),
    onResponseError: (...a) => inner.onResponseError?.(...a),
  });
};

/**
 * Downloads go to a handful of Mojang/maven hosts thousands of times. Keep connections per host modest,
 * allow slow handshakes, pick IPv4/IPv6 automatically, and retry transient network failures per file.
 */
const dispatcher = new Agent({
  connections: 12,
  connect: { timeout: 30000, autoSelectFamily: true },
  headersTimeout: 60000,
  bodyTimeout: 120000,
}).compose(
  throttle,
  interceptors.retry({
    maxRetries: 5,
    minTimeout: 1000,
    maxTimeout: 10000,
    errorCodes: ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'ENETDOWN', 'ENETUNREACH', 'EHOSTDOWN', 'EHOSTUNREACH', 'EPIPE', 'ETIMEDOUT', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'],
  }),
  interceptors.redirect({ maxRedirections: 5 }),
);

/** fetch() routed through the same dispatcher, so Modrinth/modpack files share the meter and limit. */
const fetchWithDispatcher = (url, init = {}) => undici.fetch(url, { ...init, dispatcher });

/** Emits { bps } roughly every second while bytes are flowing (and one 0 when they stop). */
function startSpeedReporter(onSpeed) {
  let previous = 0;
  let idle = true;
  let smoothed = 0;
  setInterval(() => {
    const delta = meter.bytes - previous;
    previous = meter.bytes;
    if (delta === 0) {
      if (!idle) onSpeed({ bps: 0 });
      idle = true;
      smoothed = 0;
      return;
    }
    idle = false;
    smoothed = smoothed ? smoothed * 0.6 + delta * 0.4 : delta;
    onSpeed({ bps: Math.round(smoothed) });
  }, 1000).unref?.();
}

module.exports = { dispatcher, fetchWithDispatcher, setLimit, startSpeedReporter, meter };
