const { BrowserWindow } = require('electron');

/**
 * OAuth client used for Microsoft login. The default is the public client id of the
 * official launcher's Live flow, which works without an Azure registration.
 * Before distributing Hexrona publicly, register an Azure app, get Minecraft API access
 * approved by Mojang, and set HEXRONA_MS_CLIENT_ID / HEXRONA_MS_REDIRECT_URI.
 */
const CLIENT_ID = process.env.HEXRONA_MS_CLIENT_ID || '00000000402b5328';
const REDIRECT_URI = process.env.HEXRONA_MS_REDIRECT_URI || 'https://login.live.com/oauth20_desktop.srf';
const SCOPE = 'service::user.auth.xboxlive.com::MBI_SSL';
const IS_LIVE_CLIENT = !process.env.HEXRONA_MS_CLIENT_ID;

class AuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const XERR = {
  2148916233: 'Bu Microsoft hesabının Xbox profili yok. minecraft.net adresinden bir kez giriş yapıp tekrar dene.',
  2148916235: 'Xbox Live bulunduğun bölgede kullanılamıyor.',
  2148916236: 'Bu hesap için yetişkin doğrulaması gerekiyor. Xbox sitesinden doğrulamayı tamamla.',
  2148916237: 'Bu hesap için yetişkin doğrulaması gerekiyor. Xbox sitesinden doğrulamayı tamamla.',
  2148916238: 'Bu bir çocuk hesabı. Giriş yapabilmesi için bir yetişkin onu Microsoft aile grubuna eklemeli.',
};

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function postForm(url, fields) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const expired = data.error === 'invalid_grant';
    throw new AuthError(
      expired ? 'Oturumun süresi doldu. Lütfen tekrar giriş yap.' : `Microsoft girişi başarısız (${data.error || res.status}).`,
      expired ? 'reauth' : 'ms',
    );
  }
  return data;
}

/** Show Microsoft's own sign-in page in a separate window and resolve the authorization code. */
function requestAuthCode(parent) {
  const url =
    'https://login.live.com/oauth20_authorize.srf?' +
    new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: SCOPE,
      prompt: 'select_account',
    });

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      parent,
      modal: !!parent,
      width: 500,
      height: 650,
      resizable: false,
      minimizable: false,
      maximizable: false,
      autoHideMenuBar: true,
      title: 'Microsoft ile giriş yap',
      backgroundColor: '#ffffff',
      webPreferences: { partition: 'hexrona-auth', contextIsolation: true, nodeIntegration: false, sandbox: true },
    });

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
      if (!win.isDestroyed()) win.close();
    };

    const inspect = (target) => {
      if (!target.startsWith(REDIRECT_URI)) return;
      const params = new URL(target).searchParams;
      const code = params.get('code');
      if (code) finish(resolve, code);
      else finish(reject, new AuthError(params.get('error_description') || 'Giriş iptal edildi.', params.get('error') || 'cancelled'));
    };

    win.webContents.on('will-redirect', (_e, target) => inspect(target));
    win.webContents.on('will-navigate', (_e, target) => inspect(target));
    win.webContents.on('did-navigate', (_e, target) => inspect(target));
    win.on('closed', () => finish(reject, new AuthError('Giriş penceresi kapatıldı.', 'cancelled')));
    win.loadURL(url);
  });
}

/** Microsoft token -> Xbox Live -> XSTS -> Minecraft token -> profile. */
async function minecraftFromMicrosoft(msAccessToken) {
  const xbl = await postJson('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: {
      AuthMethod: 'RPS',
      SiteName: 'user.auth.xboxlive.com',
      RpsTicket: IS_LIVE_CLIENT ? msAccessToken : `d=${msAccessToken}`,
    },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT',
  });
  if (!xbl.ok) throw new AuthError('Xbox Live girişi başarısız oldu.', 'xbl');
  const uhs = xbl.data.DisplayClaims?.xui?.[0]?.uhs;

  const xsts = await postJson('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.data.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT',
  });
  if (!xsts.ok) {
    throw new AuthError(XERR[xsts.data.XErr] || 'Xbox güvenlik doğrulaması başarısız oldu.', `xsts-${xsts.data.XErr || xsts.status}`);
  }

  const mc = await postJson('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.data.Token}`,
  });
  if (!mc.ok) {
    throw new AuthError(
      mc.status === 403
        ? 'Minecraft servisleri bu girişi reddetti. Azure uygulamanın Mojang onayı olmayabilir.'
        : 'Minecraft girişi başarısız oldu.',
      'mc',
    );
  }

  const profile = await fetchProfile(mc.data.access_token);
  return {
    mcToken: mc.data.access_token,
    mcExpiresAt: Date.now() + (mc.data.expires_in || 86400) * 1000,
    profile,
  };
}

async function fetchProfile(mcToken) {
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${mcToken}` },
  });
  if (res.status === 404) throw new AuthError('Bu Microsoft hesabında Minecraft: Java Edition yok.', 'no-game');
  if (!res.ok) throw new AuthError('Minecraft profili alınamadı.', 'profile');
  const data = await res.json();
  const skin = data.skins?.find((s) => s.state === 'ACTIVE') || data.skins?.[0];
  return { uuid: data.id, name: data.name, skinUrl: skin?.url || null };
}

async function loginInteractive(parent) {
  const code = await requestAuthCode(parent);
  const ms = await postForm('https://login.live.com/oauth20_token.srf', {
    client_id: CLIENT_ID,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
  });
  return { msRefresh: ms.refresh_token, ...(await minecraftFromMicrosoft(ms.access_token)) };
}

async function refresh(msRefresh) {
  const ms = await postForm('https://login.live.com/oauth20_token.srf', {
    client_id: CLIENT_ID,
    refresh_token: msRefresh,
    grant_type: 'refresh_token',
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
  });
  return { msRefresh: ms.refresh_token || msRefresh, ...(await minecraftFromMicrosoft(ms.access_token)) };
}

module.exports = { loginInteractive, refresh, AuthError };
