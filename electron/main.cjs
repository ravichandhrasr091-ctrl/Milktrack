const { app, BrowserWindow, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const configPath = path.join(__dirname, 'desktop-config.json');
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
  : {};
const siteUrl = config.siteUrl ? new URL(config.siteUrl) : null;
const allowedOrigins = new Set(
  [siteUrl?.origin, config.cognitoOrigin].filter(Boolean),
);

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 600,
    backgroundColor: '#f5f8f5',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://') && !siteUrl) return;
    try {
      if (allowedOrigins.has(new URL(url).origin)) return;
    } catch {
      // Block malformed navigation URLs.
    }
    event.preventDefault();
  });

  if (siteUrl) {
    void window.loadURL(siteUrl.toString());
  } else {
    void window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
