const path = require('path');
const { Notification } = require('electron');

/**
 * Windows notifications. `kind` maps to a user toggle in settings.notify; clicking focuses the
 * launcher and opens `page`.
 */
function createNotifier({ getSettings, getWindow, navigate }) {
  const icon = path.join(__dirname, '..', '..', 'yt.jpg');

  return function notify(kind, { title, body, page, onlyWhenUnfocused = false }) {
    const prefs = getSettings().notify || {};
    if (prefs[kind] === false || !Notification.isSupported()) return;
    const win = getWindow();
    if (onlyWhenUnfocused && win && !win.isDestroyed() && win.isFocused()) return;
    const n = new Notification({ title, body, icon, silent: false });
    n.on('click', () => {
      if (!win || win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      if (page) navigate(page);
    });
    n.show();
  };
}

module.exports = { createNotifier };
