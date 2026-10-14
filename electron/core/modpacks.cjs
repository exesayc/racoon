const fs = require('fs');
const os = require('os');
const path = require('path');
const { pipeline } = require('stream/promises');
const { open, readAllEntries, readEntry, openEntryReadStream } = require('@xmcl/unzip');
const { getJson } = require('./http.cjs');
const modrinth = require('./modrinth.cjs');
const { pool } = require('./jobs.cjs');

const LOADER_KEYS = [
  ['fabric-loader', 'fabric'],
  ['quilt-loader', 'quilt'],
  ['neoforge', 'neoforge'],
  ['forge', 'forge'],
];

/** Refuse paths that would escape the profile folder (zip-slip). */
function safeJoin(root, relative) {
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error(`Güvensiz dosya yolu modpack içinde: ${relative}`);
  return target;
}

async function retry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
}

/**
 * Install a Modrinth modpack (.mrpack) as a new profile.
 * deps: { profiles, root } — profile store and the shared game folder.
 */
async function installModpack({ projectId, title, icon }, { profiles, root }, report) {
  report({ stage: 'Modpack bilgisi alınıyor' });
  const versions = await getJson(`${modrinth.API}/project/${projectId}/version`);
  const version = versions.find((v) => v.version_type === 'release') || versions[0];
  if (!version) throw new Error('Bu modpack için yayınlanmış sürüm yok.');
  const packFile = version.files.find((f) => f.primary) || version.files[0];

  const tmp = path.join(os.tmpdir(), `hexrona-${projectId}-${Date.now()}.mrpack`);
  report({ stage: 'Modpack indiriliyor' });
  await modrinth.downloadFile(packFile.url, tmp, packFile.hashes?.sha1);

  let zip;
  let created;
  try {
    zip = await open(tmp, { lazyEntries: true, autoClose: false });
    const entries = await readAllEntries(zip);
    const indexEntry = entries.find((e) => e.fileName === 'modrinth.index.json');
    if (!indexEntry) throw new Error('Geçersiz modpack dosyası (modrinth.index.json yok).');
    const index = JSON.parse((await readEntry(zip, indexEntry)).toString('utf8'));

    const mcVersion = index.dependencies?.minecraft;
    if (!mcVersion) throw new Error('Modpack hangi Minecraft sürümü için olduğunu belirtmiyor.');
    const [depKey, loader] = LOADER_KEYS.find(([key]) => index.dependencies[key]) || [null, 'vanilla'];

    const list = profiles.create({
      name: index.name || title,
      mcVersion,
      loader,
      loaderVersion: depKey ? index.dependencies[depKey] : null,
    });
    created = list.profiles.find((p) => p.id === list.activeId);
    profiles.setMeta(created.id, { modpack: { projectId, versionId: version.id, versionNumber: version.version_number, title, icon } });
    const dir = profiles.dirFor(created, root);
    fs.mkdirSync(dir, { recursive: true });

    const files = (index.files || []).filter((f) => f.env?.client !== 'unsupported');
    const total = files.reduce((s, f) => s + (f.fileSize || 0), 0);
    let done = 0;
    let count = 0;
    report({ stage: `Modlar indiriliyor (0/${files.length})`, done: 0, total });
    await pool(files, 6, async (f) => {
      const dest = safeJoin(dir, f.path);
      await retry(() => modrinth.downloadFile(f.downloads[0], dest, f.hashes?.sha1));
      done += f.fileSize || 0;
      count += 1;
      report({ stage: `Modlar indiriliyor (${count}/${files.length})`, done, total });
    });

    report({ stage: 'Ayarlar ve kaynaklar kopyalanıyor', done: total, total });
    for (const entry of entries) {
      const prefix = ['overrides/', 'client-overrides/'].find((p) => entry.fileName.startsWith(p));
      if (!prefix || entry.fileName.endsWith('/')) continue;
      const dest = safeJoin(dir, entry.fileName.slice(prefix.length));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      await pipeline(await openEntryReadStream(zip, entry), fs.createWriteStream(dest));
    }

    return { profileId: created.id, name: created.name, mods: files.length };
  } catch (e) {
    // Don't leave a half-installed profile behind.
    if (created) profiles.remove(created.id, root, true);
    throw e;
  } finally {
    zip?.close();
    fs.rmSync(tmp, { force: true });
  }
}

module.exports = { installModpack };
