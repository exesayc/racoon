const { getJson } = require('./http.cjs');
const modrinth = require('./modrinth.cjs');
const { getVersionList } = require('@xmcl/installer');

/**
 * One-click profiles. `anchor` decides the Minecraft version: the newest release the anchor mod
 * supports, so the core of the template is always installable even when Minecraft just updated.
 */
const TEMPLATES = [
  {
    id: 'fps',
    name: 'FPS Boost',
    description: 'Vanilla görünüm, çok daha yüksek FPS ve daha az takılma.',
    loader: 'fabric',
    anchor: 'sodium',
    color: '#3ecf74',
    content: [
      ['sodium', 'mod'], ['lithium', 'mod'], ['ferrite-core', 'mod'], ['entityculling', 'mod'],
      ['immediatelyfast', 'mod'], ['modernfix', 'mod'], ['modmenu', 'mod'],
    ],
  },
  {
    id: 'shaders',
    name: 'Shader\'lı',
    description: 'Iris ve Complementary shader ile gerçekçi ışıklandırma.',
    loader: 'fabric',
    anchor: 'iris',
    color: '#8a6cf0',
    content: [['sodium', 'mod'], ['iris', 'mod'], ['complementary-reimagined', 'shader'], ['modmenu', 'mod']],
  },
  {
    id: 'survival',
    name: 'Survival+',
    description: 'Mini harita, yemek göstergesi, blok bilgisi ve envanter kolaylıkları.',
    loader: 'fabric',
    anchor: 'sodium',
    color: '#e8892b',
    content: [
      ['sodium', 'mod'], ['xaeros-minimap', 'mod'], ['appleskin', 'mod'], ['jade', 'mod'],
      ['mouse-tweaks', 'mod'], ['modmenu', 'mod'],
    ],
  },
  {
    id: 'pvp',
    name: 'PvP 1.8.9',
    description: 'PvP sunucularının çoğunun kullandığı klasik 1.8.9 sürümü.',
    loader: 'vanilla',
    mcVersion: '1.8.9',
    color: '#e2252e',
    content: [],
  },
];

async function newestSupportedRelease(anchor, loader) {
  const [versions, manifest] = await Promise.all([
    getJson(`${modrinth.API}/project/${anchor}/version?loaders=${encodeURIComponent(JSON.stringify([loader]))}`),
    getVersionList(),
  ]);
  const supported = new Set(versions.flatMap((v) => v.game_versions));
  return manifest.versions.find((v) => v.type === 'release' && supported.has(v.id))?.id || null;
}

/** Create the profile, then install each piece of content; pieces unavailable for that version are skipped. */
async function installTemplate(templateId, { profiles, root, loaders }, report) {
  const t = TEMPLATES.find((x) => x.id === templateId);
  if (!t) throw new Error('Şablon bulunamadı.');

  report({ stage: 'Uygun Minecraft sürümü bulunuyor' });
  const mcVersion = t.mcVersion || (await newestSupportedRelease(t.anchor, t.loader));
  if (!mcVersion) throw new Error('Bu şablon için uygun Minecraft sürümü bulunamadı.');

  let loaderVersion = null;
  if (t.loader !== 'vanilla') {
    loaderVersion = loaders.pickDefault(await loaders.listLoaderVersions(t.loader, mcVersion));
    if (!loaderVersion) throw new Error(`${mcVersion} için ${t.loader} bulunamadı.`);
  }

  const list = profiles.create({ name: t.name, mcVersion, loader: t.loader, loaderVersion, color: t.color });
  const profile = list.profiles.find((p) => p.id === list.activeId);
  const dir = profiles.dirFor(profile, root);

  const skipped = [];
  for (let i = 0; i < t.content.length; i++) {
    const [slug, type] = t.content[i];
    report({ stage: `İçerik yükleniyor (${i + 1}/${t.content.length})`, done: i, total: t.content.length });
    try {
      await modrinth.install({ projectId: slug, type, force: true }, profile, dir);
    } catch {
      skipped.push(slug);
    }
  }
  return { profileId: profile.id, name: profile.name, mcVersion, skipped };
}

const list = () => TEMPLATES.map(({ content, anchor, ...rest }) => ({ ...rest, contentCount: content.length }));

module.exports = { list, installTemplate };
