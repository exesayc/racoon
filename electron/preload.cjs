const { contextBridge, ipcRenderer } = require('electron');

const subscribe = (channel) => (callback) => {
  const listener = (_e, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('hexrona', {
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    pickBackground: () => ipcRenderer.invoke('settings:pickBackground'),
    resetBackground: () => ipcRenderer.invoke('settings:resetBackground'),
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    select: (id) => ipcRenderer.invoke('accounts:select', id),
    remove: (id) => ipcRenderer.invoke('accounts:remove', id),
    addOffline: (name) => ipcRenderer.invoke('accounts:addOffline', name),
    addMicrosoft: () => ipcRenderer.invoke('accounts:addMicrosoft'),
  },
  profiles: {
    list: () => ipcRenderer.invoke('profiles:list'),
    create: (data) => ipcRenderer.invoke('profiles:create', data),
    update: (id, patch) => ipcRenderer.invoke('profiles:update', id, patch),
    select: (id) => ipcRenderer.invoke('profiles:select', id),
    remove: (id, deleteFiles) => ipcRenderer.invoke('profiles:remove', id, deleteFiles),
    openDir: (id) => ipcRenderer.invoke('profiles:openDir', id),
    loaderVersions: (loader, mc) => ipcRenderer.invoke('loaders:versions', loader, mc),
    onChanged: subscribe('profiles:changed'),
  },
  mods: {
    search: (params) => ipcRenderer.invoke('mods:search', params),
    installed: (profileId) => ipcRenderer.invoke('mods:installed', profileId),
    install: (profileId, item) => ipcRenderer.invoke('mods:install', profileId, item),
    toggle: (profileId, type, file, enabled) => ipcRenderer.invoke('mods:toggle', profileId, type, file, enabled),
    remove: (profileId, type, file) => ipcRenderer.invoke('mods:remove', profileId, type, file),
    analyze: (profileId) => ipcRenderer.invoke('mods:analyze', profileId),
    installModpack: (item) => ipcRenderer.invoke('modpacks:install', item),
  },
  templates: {
    list: () => ipcRenderer.invoke('templates:list'),
    install: (id) => ipcRenderer.invoke('templates:install', id),
  },
  jobs: {
    list: () => ipcRenderer.invoke('jobs:list'),
    dismiss: (id) => ipcRenderer.invoke('jobs:dismiss', id),
    onUpdate: subscribe('jobs:update'),
  },
  social: {
    state: () => ipcRenderer.invoke('social:state'),
    send: (msg) => ipcRenderer.invoke('social:send', msg),
    retry: () => ipcRenderer.invoke('social:retry'),
    onState: subscribe('social:state'),
    onNotify: subscribe('social:notify'),
  },
  bugReport: {
    preview: (opts) => ipcRenderer.invoke('bugreport:preview', opts),
    send: (report) => ipcRenderer.invoke('bugreport:send', report),
  },
  net: {
    onSpeed: subscribe('net:speed'),
  },
  nav: {
    onGo: subscribe('nav:go'),
  },
  servers: {
    list: () => ipcRenderer.invoke('servers:list'),
    save: (server) => ipcRenderer.invoke('servers:save', server),
    remove: (id) => ipcRenderer.invoke('servers:remove', id),
    move: (id, delta) => ipcRenderer.invoke('servers:move', id, delta),
    ping: (address) => ipcRenderer.invoke('servers:ping', address),
    discover: () => ipcRenderer.invoke('servers:discover'),
  },
  news: {
    minecraft: () => ipcRenderer.invoke('news:minecraft'),
    body: (contentPath) => ipcRenderer.invoke('news:body', contentPath),
    hexrona: () => ipcRenderer.invoke('news:hexrona'),
  },
  updater: {
    state: () => ipcRenderer.invoke('updater:state'),
    check: () => ipcRenderer.invoke('updater:check'),
    install: () => ipcRenderer.invoke('updater:install'),
    onState: subscribe('updater:state'),
  },
  java: {
    pick: () => ipcRenderer.invoke('java:pick'),
  },
  system: {
    info: () => ipcRenderer.invoke('system:info'),
  },
  versions: {
    list: () => ipcRenderer.invoke('versions:list'),
  },
  game: {
    play: (options) => ipcRenderer.invoke('game:play', options),
    cancel: () => ipcRenderer.invoke('game:cancel'),
    status: () => ipcRenderer.invoke('game:status'),
    logs: () => ipcRenderer.invoke('game:logs'),
    clearLogs: () => ipcRenderer.invoke('game:clearLogs'),
    onState: subscribe('game:state'),
    onProgress: subscribe('game:progress'),
    onLog: subscribe('game:log'),
  },
  shell: {
    openGameDir: () => ipcRenderer.invoke('shell:openGameDir'),
    showItem: (target) => ipcRenderer.invoke('shell:openPath', target),
    pickDir: () => ipcRenderer.invoke('dialog:pickDir'),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    onMaximized: subscribe('window:maximized'),
  },
});
