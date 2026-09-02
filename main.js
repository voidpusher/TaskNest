const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;
let widgetWindow;

function dataFile() {
  return path.join(app.getPath('userData'), 'tasks.json');
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function readTasks() {
  const tasks = readJson(dataFile(), []);
  return Array.isArray(tasks) ? tasks : [];
}

function writeTasks(tasks) {
  writeJson(dataFile(), Array.isArray(tasks) ? tasks : []);
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('tasks:changed');
  }
  return true;
}

function readSettings() {
  return { widgetEnabled: false, widgetPinned: true, widgetBounds: null, ...readJson(settingsFile(), {}) };
}

function saveSettings(update) {
  const next = { ...readSettings(), ...update };
  writeJson(settingsFile(), next);
  return next;
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: '#171815',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#171815', symbolColor: '#fff8e9', height: 48 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.on('closed', () => { mainWindow = null; });
  return mainWindow;
}

function safeWidgetBounds(savedBounds) {
  if (savedBounds && Number.isFinite(savedBounds.x) && Number.isFinite(savedBounds.y)) {
    const area = screen.getDisplayMatching(savedBounds).workArea;
    return {
      x: Math.max(area.x, Math.min(savedBounds.x, area.x + area.width - 330)),
      y: Math.max(area.y, Math.min(savedBounds.y, area.y + area.height - 280)),
      width: Math.max(330, Math.min(savedBounds.width || 390, area.width)),
      height: Math.max(420, Math.min(savedBounds.height || 600, area.height))
    };
  }
  const area = screen.getPrimaryDisplay().workArea;
  return { x: area.x + area.width - 414, y: area.y + 24, width: 390, height: Math.min(620, area.height - 48) };
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.show();
    widgetWindow.focus();
    return widgetWindow;
  }

  const settings = readSettings();
  widgetWindow = new BrowserWindow({
    ...safeWidgetBounds(settings.widgetBounds),
    minWidth: 330,
    minHeight: 420,
    frame: false,
    resizable: true,
    alwaysOnTop: settings.widgetPinned,
    skipTaskbar: false,
    backgroundColor: '#171815',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  widgetWindow.setAlwaysOnTop(settings.widgetPinned, 'floating');
  widgetWindow.loadFile('widget.html');

  const rememberBounds = () => {
    if (widgetWindow && !widgetWindow.isDestroyed()) saveSettings({ widgetBounds: widgetWindow.getBounds() });
  };
  widgetWindow.on('resize', rememberBounds);
  widgetWindow.on('move', rememberBounds);
  widgetWindow.on('closed', () => { widgetWindow = null; });
  return widgetWindow;
}

app.whenReady().then(() => {
  createMainWindow();
  if (readSettings().widgetEnabled) createWidgetWindow();
  app.on('activate', () => createMainWindow());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('tasks:load', () => readTasks());
ipcMain.handle('tasks:save', (_event, tasks) => writeTasks(tasks));
ipcMain.handle('settings:load', () => readSettings());

ipcMain.handle('widget:open', () => {
  saveSettings({ widgetEnabled: true });
  app.setLoginItemSettings({ openAtLogin: true });
  createWidgetWindow();
  return readSettings();
});

ipcMain.handle('widget:remove', () => {
  saveSettings({ widgetEnabled: false });
  app.setLoginItemSettings({ openAtLogin: false });
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.close();
  return readSettings();
});

ipcMain.handle('widget:toggle-pin', () => {
  const pinned = !readSettings().widgetPinned;
  saveSettings({ widgetPinned: pinned });
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.setAlwaysOnTop(pinned, 'floating');
  widgetWindow?.webContents.send('widget:settings', readSettings());
  mainWindow?.webContents.send('widget:settings', readSettings());
  return readSettings();
});

ipcMain.handle('window:open-main', () => createMainWindow());
ipcMain.handle('window:minimize-widget', () => widgetWindow?.minimize());
ipcMain.handle('window:close-widget', () => widgetWindow?.close());
