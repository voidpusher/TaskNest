const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');

let mainWindow;
let widgetWindow;

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function dataFile() {
  return path.join(app.getPath('userData'), 'tasks.json');
}

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function targetsFile() {
  return path.join(app.getPath('userData'), 'weekly-targets.json');
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
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(value, null, 2));
  fs.copyFileSync(temporaryFile, file);
  fs.unlinkSync(temporaryFile);
}

function localDateKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTask(task) {
  if (!task || typeof task !== 'object') return null;
  const title = String(task.title || '').trim().slice(0, 160);
  if (!title) return null;
  return {
    id: String(task.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title,
    priority: ['high', 'normal', 'low'].includes(task.priority) ? task.priority : 'normal',
    done: Boolean(task.done),
    archived: Boolean(task.archived),
    date: /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? task.date : localDateKey(),
    createdAt: Number.isFinite(Number(task.createdAt)) ? Number(task.createdAt) : Date.now(),
    completedAt: task.completedAt && Number.isFinite(Number(task.completedAt)) ? Number(task.completedAt) : null,
    weeklyTargetId: task.weeklyTargetId ? String(task.weeklyTargetId).slice(0, 120) : null
  };
}

function normalizeTarget(target) {
  if (!target || typeof target !== 'object') return null;
  const title = String(target.title || '').trim().slice(0, 80);
  if (!title) return null;
  return {
    id: String(target.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 120),
    title,
    target: Math.max(1, Math.min(7, Math.round(Number(target.target) || 1))),
    createdAt: Number.isFinite(Number(target.createdAt)) ? Number(target.createdAt) : Date.now(),
    archived: Boolean(target.archived)
  };
}

function readTargets() {
  const targets = readJson(targetsFile(), []);
  return Array.isArray(targets) ? targets.map(normalizeTarget).filter(Boolean) : [];
}

function writeTargets(targets) {
  const safeTargets = Array.isArray(targets) ? targets.slice(0, 100).map(normalizeTarget).filter(Boolean) : [];
  writeJson(targetsFile(), safeTargets);
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('targets:changed');
  return true;
}

function readTasks() {
  const tasks = readJson(dataFile(), []);
  return Array.isArray(tasks) ? tasks.map(normalizeTask).filter(Boolean) : [];
}

function writeTasks(tasks) {
  const safeTasks = Array.isArray(tasks) ? tasks.slice(0, 5000).map(normalizeTask).filter(Boolean) : [];
  if (fs.existsSync(dataFile())) {
    try { fs.copyFileSync(dataFile(), path.join(app.getPath('userData'), 'tasks.backup.json')); } catch { /* Keep saving even if backup fails. */ }
  }
  writeJson(dataFile(), safeTasks);
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

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createMainWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('tasks:load', () => readTasks());
ipcMain.handle('tasks:save', (_event, tasks) => writeTasks(tasks));
ipcMain.handle('settings:load', () => readSettings());
ipcMain.handle('targets:load', () => readTargets());
ipcMain.handle('targets:save', (_event, targets) => writeTargets(targets));

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
