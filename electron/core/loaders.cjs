const fs = require('fs');
const path = require('path');
const { MinecraftFolder } = require('@xmcl/core');
const { installForgeTask, installNeoForgedTask } = require('@xmcl/installer');
const { getJson, getText } = require('./http.cjs');

const LOADERS = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];

const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';
const NEOFORGE_VERSIONS = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge';

const cache = new Map();
async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.value;
  const value = await fn();
  cache.set(key, { value, at: Date.now() });
  return value;
}

/** NeoForge versions encode the Minecraft version: 1.21.4 -> 21.4.x, 1.21 -> 21.0.x, 26.3 -> 26.3.0.x */
function neoForgePrefix(mc) {
  const parts = (mc.startsWith('1.') ? mc.slice(2) : mc).split('.');
  if (parts.length === 1 || (!mc.startsWith('1.') && parts.length === 2)) parts.push('0');
  return `${parts.join('.')}.`;
}

/** Newest first. Each entry: { version, stable, tag? }. Empty when the loader doesn't support `mc`. */
async function listLoaderVersions(loader, mc) {
  try {
    return await fetchLoaderVersions(loader, mc);
  } catch (e) {
    if (e.status === 400 || e.status === 404) return [];
    throw new Error('Mod yükleyici sürümleri alınamadı. İnternet bağlantını kontrol et.');
  }
}

async function fetchLoaderVersions(loader, mc) {
  switch (loader) {
    case 'fabric': {
      const list = await cached(`fabric:${mc}`, () => getJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(mc)}`));
      return list.map((l) => ({ version: l.loader.version, stable: !!l.loader.stable }));
    }
    case 'quilt': {
      const list = await cached(`quilt:${mc}`, () => getJson(`https://meta.quiltmc.org/v3/versions/loader/${encodeURIComponent(mc)}`));
      return list.map((l) => ({ version: l.loader.version, stable: !/beta|alpha|rc|pre/i.test(l.loader.version) }));
    }
    case 'forge': {
      const [xml, promos] = await Promise.all([
        cached('forge:maven', () => getText(FORGE_MAVEN)),
        cached('forge:promos', () => getJson(FORGE_PROMOS)),
      ]);
      const recommended = promos.promos[`${mc}-recommended`];
      const latest = promos.promos[`${mc}-latest`];
      const all = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
      return all
        .filter((v) => v.startsWith(`${mc}-`))
        .map((v) => v.slice(mc.length + 1))
        .reverse()
        .map((version) => ({
          version,
          stable: version === recommended || (!recommended && version === latest),
          tag: version === recommended ? 'Önerilen' : version === latest ? 'En yeni' : undefined,
        }));
    }
    case 'neoforge': {
      if (/^1\.20(\.1)?$/.test(mc) || !/^\d/.test(mc)) return [];
      const { versions } = await cached('neoforge', () => getJson(NEOFORGE_VERSIONS));
      const prefix = neoForgePrefix(mc);
      return versions
        .filter((v) => v.startsWith(prefix))
        .reverse()
        .map((version) => ({ version, stable: !/beta|alpha/i.test(version) }));
    }
    default:
      return [];
  }
}

/** Suggested default: first stable version, else newest. */
function pickDefault(list) {
  return (list.find((v) => v.stable) || list[0])?.version || null;
}

async function writeProfileJson(root, url) {
  const json = await getJson(url);
  const mc = MinecraftFolder.from(root);
  const file = mc.getVersionJson(json.id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
  return json.id;
}

/**
 * Install the loader's version json (and for Forge/NeoForge run the installer).
 * Returns the launchable version id. `runTask` reports progress for task-based installers.
 */
async function installLoader({ loader, mcVersion, loaderVersion }, root, javaPath, net, runTask) {
  const mc = encodeURIComponent(mcVersion);
  const lv = encodeURIComponent(loaderVersion);
  switch (loader) {
    case 'fabric':
      return writeProfileJson(root, `https://meta.fabricmc.net/v2/versions/loader/${mc}/${lv}/profile/json`);
    case 'quilt':
      return writeProfileJson(root, `https://meta.quiltmc.org/v3/versions/loader/${mc}/${lv}/profile/json`);
    case 'forge':
      return runTask(installForgeTask({ mcversion: mcVersion, version: loaderVersion }, root, { java: javaPath, ...net }), 'Forge kuruluyor');
    case 'neoforge':
      return runTask(installNeoForgedTask('neoforge', loaderVersion, root, { java: javaPath, ...net }), 'NeoForge kuruluyor');
    default:
      throw new Error(`Bilinmeyen mod yükleyici: ${loader}`);
  }
}

module.exports = { LOADERS, listLoaderVersions, pickDefault, installLoader };
