// Sandboxed preload scripts cannot be ES modules, so this file is CommonJS.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('eleanor', {
  platform: process.platform,
  isDesktop: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
