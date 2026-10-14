// Images live in the project root. A glob is used so a missing file (e.g. loginscreen.png
// not added yet) simply resolves to undefined instead of breaking the build.
const images = import.meta.glob('../../{yt.jpg,arkaplan.png,loginscreen.png}', { eager: true, query: '?url', import: 'default' });

export const logoUrl = images['../../yt.jpg'];
export const backgroundUrl = images['../../arkaplan.png'];
export const loginBackgroundUrl = images['../../loginscreen.png'] || backgroundUrl;
