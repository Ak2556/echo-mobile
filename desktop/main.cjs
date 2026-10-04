const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');

const APP_SCHEME = 'echo-desktop';
const DEV_SERVER_URL = process.env.ECHO_DESKTOP_DEV_SERVER;
const DEV_SERVER_ORIGIN = (() => {
  if (!DEV_SERVER_URL) return null;
  try {
    return new URL(DEV_SERVER_URL).origin;
  } catch {
    return null;
  }
})();
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['https:', 'mailto:']);
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function webRoot() {
  if (process.env.ECHO_DESKTOP_WEB_DIR) {
    return path.resolve(process.env.ECHO_DESKTOP_WEB_DIR);
  }
  return path.join(app.getAppPath(), 'dist', 'web');
}

function inside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function safeDecodePathname(pathname) {
  try {
    const cleanPath = decodeURIComponent(pathname.split('?')[0]).replace(/^\/+/, '');
    if (CONTROL_CHARACTER_PATTERN.test(cleanPath)) return null;
    return cleanPath;
  } catch {
    return null;
  }
}

function routeToFile(root, pathname) {
  const cleanPath = safeDecodePathname(pathname);
  if (cleanPath === null) return null;

  const basePath = path.join(root, cleanPath);
  const candidates = [
    cleanPath ? basePath : path.join(root, 'index.html'),
    `${basePath}.html`,
    path.join(basePath, 'index.html'),
    path.join(root, 'index.html'),
  ];

  return candidates.find((candidate) => inside(root, candidate) && fs.existsSync(candidate));
}

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    try {
      const root = webRoot();
      const url = new URL(request.url);
      const file = routeToFile(root, url.pathname);

      if (!file) {
        return new Response('Not found', { status: 404 });
      }

      return net.fetch(pathToFileURL(file).toString());
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  });
}

function openExternalSafely(url) {
  try {
    if (!url || url.length > 2048 || CONTROL_CHARACTER_PATTERN.test(url)) return;
    const parsed = new URL(url);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return;
    if (parsed.protocol === 'https:' && (!parsed.hostname || parsed.username || parsed.password)) return;
    void shell.openExternal(url);
  } catch {
    // Ignore malformed URLs instead of passing them through to the OS.
  }
}

function isInternalNavigation(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === `${APP_SCHEME}:`) return true;
    return Boolean(DEV_SERVER_ORIGIN && parsed.origin === DEV_SERVER_ORIGIN);
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    title: 'Echo',
    backgroundColor: '#000000',
    trafficLightPosition: { x: 18, y: 18 },
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isInternalNavigation(url)) {
      event.preventDefault();
      openExternalSafely(url);
    }
  });

  if (DEV_SERVER_URL) {
    void win.loadURL(DEV_SERVER_URL);
  } else {
    void win.loadURL(`${APP_SCHEME}://app/`);
  }

  return win;
}

function installMenu() {
  const template = [
    {
      label: 'Echo',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  registerAppProtocol();
  installMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
