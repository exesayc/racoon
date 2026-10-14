const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { open, readAllEntries, readEntry } = require('@xmcl/unzip');
const { getJson } = require('./http.cjs');
const { fetchWithDispatcher } = require('./dispatcher.cjs');

const API = 'https://api.modrinth.com/v2';

const FOLDERS = { mod: 'mods', shader: 'shaderpacks', resourcepack: 'resourcepacks' };

/** Quilt runs Fabric mods too. */
function modLoaders(loader) {
  if (loader === 'quilt') return ['quilt', 'fabric'];
  return [loader];
}

async function search({ query = '', type = 'mod', mcVersion, loader, sort = 'relevance', offset = 0 }) {
  const facets = [[`project_type:${type}`]];
  if (mcVersion && type !== 'modpack') facets.push([`versions:${mcVersion}`]);
  if (type === 'mod' && loader && loader !== 'vanilla') facets.push(modLoaders(loader).map((l) => `categories:${l}`));
  const params = new URLSearchParams({ query, facets: JSON.stringify(facets), index: sort, limit: '24', offset: String(offset) });
  const res = await getJson(`${API}/search?${params}`);
  return {
    total: res.total_hits,
    hits: res.hits.map((h) => ({
      id: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      icon: h.icon_url || null,
      author: h.author,
      downloads: h.downloads,
      follows: h.follows,
      type: h.project_type,
      categories: h.display_categories || h.categories || [],
      versions: h.versions || [],
    })),
  };
}

/** Download to a temp file, verify sha1, then move into place. */
async function downloadFile(url, dest, sha1) {
  const res = await fetchWithDispatcher(url, { headers: { 'User-Agent': 'Hexrona Launcher' } });
  if (!res.ok) throw new Error(`İndirme başarısız (HTTP ${res.status})`);
  const data = Buffer.from(await res.arrayBuffer());
  if (sha1 && crypto.createHash('sha1').update(data).digest('hex') !== sha1) {
    throw new Error(`${path.basename(dest)} bozuk indirildi, tekrar dene.`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.part`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, dest);
  return data.length;
}

// ---------- installed content index (per profile) ----------

const indexFile = (dir) => path.join(dir, '.hexrona', 'content.json');

function readIndex(dir) {
  try {
    return JSON.parse(fs.readFileSync(indexFile(dir), 'utf8'));
  } catch {
    return {};
  }
}

function writeIndex(dir, index) {
  fs.mkdirSync(path.dirname(indexFile(dir)), { recursive: true });
  fs.writeFileSync(indexFile(dir), JSON.stringify(index, null, 2));
}

/** Everything in mods/shaderpacks/resourcepacks, enriched with Modrinth metadata when Hexrona installed it. */
function listInstalled(dir) {
  const index = readIndex(dir);
  const byFile = new Map(Object.entries(index).map(([projectId, entry]) => [entry.file, { projectId, ...entry }]));
  const items = [];
  for (const [type, folder] of Object.entries(FOLDERS)) {
    let files = [];
    try {
      files = fs.readdirSync(path.join(dir, folder));
    } catch {
      continue;
    }
    for (const name of files) {
      if (name.startsWith('.') || name.endsWith('.part')) continue;
      const enabled = !name.endsWith('.disabled');
      const file = enabled ? name : name.slice(0, -'.disabled'.length);
      const meta = byFile.get(file);
      items.push({
        type,
        file,
        enabled,
        projectId: meta?.projectId || null,
        slug: meta?.slug || null,
        title: meta?.title || file.replace(/\.(jar|zip)$/i, ''),
        icon: meta?.icon || null,
        version: meta?.versionNumber || null,
      });
    }
  }
  return items.sort((a, b) => a.title.localeCompare(b.title, 'tr'));
}

async function pickVersion(projectId, type, mcVersion, loader) {
  const params = new URLSearchParams({ game_versions: JSON.stringify([mcVersion]) });
  if (type === 'mod') params.set('loaders', JSON.stringify(modLoaders(loader)));
  const versions = await getJson(`${API}/project/${projectId}/version?${params}`);
  return versions.find((v) => v.version_type === 'release') || versions[0] || null;
}

// ---------- compatibility ----------

/** Well-known pairs that crash or fight each other even when Modrinth metadata doesn't say so. */
const KNOWN_CONFLICTS = [
  ['sodium', 'optifabric', 'Sodium ve OptiFine aynı anda çalışmaz.'],
  ['sodium', 'embeddium', 'Embeddium, Sodium\'un bir kopyasıdır; ikisinden birini kullan.'],
  ['sodium', 'rubidium', 'Rubidium, Sodium\'un bir kopyasıdır; ikisinden birini kullan.'],
  ['iris', 'optifabric', 'Iris ve OptiFine aynı anda çalışmaz.'],
  ['iris', 'oculus', 'Oculus, Iris\'in bir kopyasıdır; ikisinden birini kullan.'],
  ['sodium', 'canvas-renderer', 'Canvas ve Sodium ikisi de görüntü motorunu değiştirir.'],
  ['lithium', 'canary', 'Canary, Lithium\'un bir kopyasıdır; ikisinden birini kullan.'],
  ['modernfix', 'memoryleakfix', 'ModernFix bu düzeltmeleri zaten içerir.'],
];

function knownConflict(slugA, slugB) {
  return KNOWN_CONFLICTS.find(([a, b]) => (a === slugA && b === slugB) || (a === slugB && b === slugA));
}

/** Conflicts between a version about to be installed and what's already in the profile. */
function conflictsFor(projectId, slug, version, dir) {
  const index = readIndex(dir);
  const conflicts = [];
  const declared = new Set((version.dependencies || []).filter((d) => d.dependency_type === 'incompatible').map((d) => d.project_id));
  for (const [otherId, entry] of Object.entries(index)) {
    if (otherId === projectId || entry.type !== 'mod') continue;
    const known = knownConflict(slug, entry.slug);
    if (declared.has(otherId) || (entry.incompatible || []).includes(projectId)) {
      conflicts.push({ title: entry.title, reason: 'Mod geliştiricisi bu iki modun birlikte çalışmadığını belirtmiş.' });
    } else if (known) {
      conflicts.push({ title: entry.title, reason: known[2] });
    }
  }
  return conflicts;
}

/** Read a jar's mod metadata: which loader it targets and its mod id. */
async function inspectJar(file) {
  let zip;
  try {
    zip = await open(file, { lazyEntries: true, autoClose: false });
    const entries = await readAllEntries(zip);
    const find = (name) => entries.find((e) => e.fileName === name);
    const json = async (entry) => JSON.parse((await readEntry(zip, entry)).toString('utf8'));
    let e;
    if ((e = find('fabric.mod.json'))) {
      const meta = await json(e).catch(() => ({}));
      return { loader: 'fabric', id: meta.id, name: meta.name };
    }
    if ((e = find('quilt.mod.json'))) {
      const meta = await json(e).catch(() => ({}));
      return { loader: 'quilt', id: meta.quilt_loader?.id };
    }
    if ((e = find('META-INF/neoforge.mods.toml'))) {
      const toml = (await readEntry(zip, e)).toString('utf8');
      return { loader: 'neoforge', id: toml.match(/modId\s*=\s*"([^"]+)"/)?.[1] };
    }
    if ((e = find('META-INF/mods.toml'))) {
      const toml = (await readEntry(zip, e)).toString('utf8');
      return { loader: 'forge', id: toml.match(/modId\s*=\s*"([^"]+)"/)?.[1] };
    }
    if (find('mcmod.info')) return { loader: 'forge' };
    return { loader: null };
  } catch {
    return { loader: null, broken: true };
  } finally {
    zip?.close();
  }
}

const LOADER_NAMES = { fabric: 'Fabric', quilt: 'Quilt', forge: 'Forge', neoforge: 'NeoForge' };

function loaderCompatible(modLoader, profileLoader) {
  if (!modLoader) return true;
  if (modLoader === profileLoader) return true;
  if (profileLoader === 'quilt' && modLoader === 'fabric') return true;
  // NeoForge still loads many early (mods.toml) Forge mods on 1.20.x.
  if (profileLoader === 'neoforge' && modLoader === 'forge') return true;
  return false;
}

/** Problems with the mods currently in a profile, keyed by file name. */
async function analyze(dir, profile) {
  const items = listInstalled(dir).filter((i) => i.type === 'mod' && i.enabled && i.file.endsWith('.jar'));
  const index = readIndex(dir);
  const issues = {};
  const add = (file, text) => (issues[file] ||= []).push(text);
  const byModId = new Map();

  for (const item of items) {
    const info = await inspectJar(path.join(dir, 'mods', item.file));
    if (info.broken) add(item.file, 'Dosya bozuk görünüyor; kaldırıp yeniden yükle.');
    if (profile.loader === 'vanilla') add(item.file, 'Bu profil Vanilla; modlar yüklenmeyecek.');
    else if (!loaderCompatible(info.loader, profile.loader)) {
      add(item.file, `Bu mod ${LOADER_NAMES[info.loader]} için, profilin ${LOADER_NAMES[profile.loader]}.`);
    }
    if (info.id) {
      const first = byModId.get(info.id);
      if (first) {
        add(item.file, `"${first.title}" ile aynı mod; ikisinden birini kaldır.`);
        add(first.file, `"${item.title}" ile aynı mod; ikisinden birini kaldır.`);
      } else byModId.set(info.id, item);
    }
  }

  const enabledIds = new Set(items.map((i) => i.projectId).filter(Boolean));
  for (const item of items) {
    if (!item.projectId) continue;
    const entry = index[item.projectId];
    for (const other of items) {
      if (other === item || !other.projectId) continue;
      if ((entry.incompatible || []).includes(other.projectId)) add(item.file, `${other.title} ile uyumsuz.`);
      const known = knownConflict(entry.slug, index[other.projectId]?.slug);
      if (known && enabledIds.has(other.projectId)) add(item.file, known[2]);
    }
  }
  for (const k of Object.keys(issues)) issues[k] = [...new Set(issues[k])];
  return issues;
}

// ---------- install ----------

/**
 * Install a project into the profile folder, plus its required dependencies (mods only).
 * Returns { installed: titles[], conflicts: [] }. With conflicts and no `force`, nothing is installed.
 */
async function install({ projectId, type, title, icon, slug, force }, profile, dir, seen = new Set()) {
  if (seen.has(projectId)) return { installed: [], conflicts: [] };
  seen.add(projectId);
  if (type === 'mod' && profile.loader === 'vanilla') {
    throw new Error('Modlar için profilde Fabric, Quilt, Forge ya da NeoForge seçili olmalı.');
  }

  let meta = { title, icon, slug };
  if (!title || !slug) {
    // Also normalises slugs (templates) to the real project id that dependencies refer to.
    const project = await getJson(`${API}/project/${projectId}`);
    meta = { title: project.title, icon: project.icon_url, slug: project.slug };
    projectId = project.id;
    seen.add(projectId);
  }

  const version = await pickVersion(projectId, type, profile.mcVersion, profile.loader);
  if (!version) throw new Error(`${meta.title || 'Bu içerik'} için ${profile.mcVersion} sürümüne uygun dosya yok.`);

  if (type === 'mod' && !force) {
    const conflicts = conflictsFor(projectId, meta.slug, version, dir);
    if (conflicts.length) return { installed: [], conflicts };
  }

  const fileInfo = version.files.find((f) => f.primary) || version.files[0];
  const folder = path.join(dir, FOLDERS[type] || 'mods');
  const index = readIndex(dir);
  const previous = index[projectId]?.file;
  if (previous && previous !== fileInfo.filename) {
    for (const f of [previous, `${previous}.disabled`]) fs.rmSync(path.join(folder, f), { force: true });
  }
  await downloadFile(fileInfo.url, path.join(folder, fileInfo.filename), fileInfo.hashes?.sha1);

  index[projectId] = {
    file: fileInfo.filename,
    type,
    versionId: version.id,
    versionNumber: version.version_number,
    incompatible: (version.dependencies || []).filter((d) => d.dependency_type === 'incompatible' && d.project_id).map((d) => d.project_id),
    ...meta,
  };
  writeIndex(dir, index);

  const installed = [meta.title];
  if (type === 'mod') {
    const already = new Set(Object.keys(readIndex(dir)));
    for (const dep of version.dependencies || []) {
      if (dep.dependency_type !== 'required' || !dep.project_id || already.has(dep.project_id)) continue;
      const sub = await install({ projectId: dep.project_id, type: 'mod', force: true }, profile, dir, seen);
      installed.push(...sub.installed);
    }
  }
  return { installed, conflicts: [] };
}

function locate(dir, type, file) {
  const folder = path.join(dir, FOLDERS[type] || 'mods');
  const on = path.join(folder, path.basename(file));
  return { on, off: `${on}.disabled` };
}

function setEnabled(dir, type, file, enabled) {
  const { on, off } = locate(dir, type, file);
  if (enabled && fs.existsSync(off)) fs.renameSync(off, on);
  if (!enabled && fs.existsSync(on)) fs.renameSync(on, off);
}

function remove(dir, type, file) {
  const { on, off } = locate(dir, type, file);
  fs.rmSync(on, { force: true });
  fs.rmSync(off, { force: true });
  const index = readIndex(dir);
  for (const [id, entry] of Object.entries(index)) if (entry.file === file) delete index[id];
  writeIndex(dir, index);
}

module.exports = { API, search, listInstalled, install, setEnabled, remove, analyze, downloadFile, readIndex, writeIndex, pickVersion };
