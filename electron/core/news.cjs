const { getJson } = require('./http.cjs');
const pkg = require('../../package.json');

const MOJANG = 'https://launchercontent.mojang.com';

let patchNotes = null;
let patchNotesAt = 0;

async function minecraftNews() {
  if (!patchNotes || Date.now() - patchNotesAt > 30 * 60 * 1000) {
    const data = await getJson(`${MOJANG}/v2/javaPatchNotes.json`);
    patchNotes = data.entries.slice(0, 40).map((e) => ({
      id: e.id,
      title: e.title,
      version: e.version,
      type: e.type,
      date: e.date,
      image: e.image?.url ? `${MOJANG}${e.image.url}` : null,
      summary: e.shortText,
      contentPath: e.contentPath,
    }));
    patchNotesAt = Date.now();
  }
  return patchNotes;
}

async function minecraftNewsBody(contentPath) {
  if (!/^[\w./-]+\.json$/.test(contentPath)) throw new Error('Geçersiz içerik yolu');
  const data = await getJson(`${MOJANG}/v2/${contentPath}`);
  return data.body || '';
}

function githubRepo() {
  const publish = pkg.build?.publish?.[0];
  if (!publish || publish.provider !== 'github' || !publish.owner || publish.owner.startsWith('GITHUB_')) return null;
  return publish;
}

async function hexronaReleases() {
  const repo = githubRepo();
  if (!repo) return { configured: false, releases: [] };
  const list = await getJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases?per_page=20`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  return {
    configured: true,
    releases: list
      .filter((r) => !r.draft)
      .map((r) => ({ tag: r.tag_name, name: r.name || r.tag_name, body: r.body || '', date: r.published_at, url: r.html_url, prerelease: r.prerelease })),
  };
}

module.exports = { minecraftNews, minecraftNewsBody, hexronaReleases, githubRepo };
