const { app, BrowserWindow, ipcMain, screen, Notification, session } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let widgetWindow;
let voiceRecognitionProcess;

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

function projectsFile() {
  return path.join(app.getPath('userData'), 'projects.json');
}

function reminderLogFile() {
  return path.join(app.getPath('userData'), 'reminder-log.json');
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
  const createdAt = Number.isFinite(Number(task.createdAt)) ? Number(task.createdAt) : Date.now();
  const completedAt = task.completedAt && Number.isFinite(Number(task.completedAt)) ? Number(task.completedAt) : null;
  const done = task.status === 'completed' || Boolean(task.done);
  const date = task.date === null || task.date === '' ? null : /^\d{4}-\d{2}-\d{2}$/.test(task.date) ? task.date : localDateKey();
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks.slice(0, 100).map((subtask) => {
    const subtaskTitle = String(subtask?.title || '').trim().slice(0, 160);
    if (!subtaskTitle) return null;
    return {
      id: String(subtask.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 120),
      title: subtaskTitle,
      done: Boolean(subtask.done),
      createdAt: Number.isFinite(Number(subtask.createdAt)) ? Number(subtask.createdAt) : createdAt,
      completedAt: subtask.completedAt && Number.isFinite(Number(subtask.completedAt)) ? Number(subtask.completedAt) : null
    };
  }).filter(Boolean) : [];
  const focusSessions = Array.isArray(task.focusSessions) ? task.focusSessions.slice(-200).map((session) => {
    if (!session || typeof session !== 'object') return null;
    const startedAt = Number(session.startedAt);
    const endedAt = Number(session.endedAt);
    return {
      id: String(session.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 120),
      startedAt: Number.isFinite(startedAt) ? startedAt : createdAt,
      endedAt: Number.isFinite(endedAt) ? endedAt : null,
      durationSeconds: Math.max(0, Math.min(86400, Math.round(Number(session.durationSeconds) || 0))),
      completed: Boolean(session.completed)
    };
  }).filter(Boolean) : [];
  const rawActiveSession = task.activeSession && typeof task.activeSession === 'object' ? task.activeSession : null;
  const activeSession = rawActiveSession ? {
    id: String(rawActiveSession.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 120),
    startedAt: Number.isFinite(Number(rawActiveSession.startedAt)) ? Number(rawActiveSession.startedAt) : Date.now(),
    accumulatedSeconds: Math.max(0, Math.min(86400, Number(rawActiveSession.accumulatedSeconds) || 0)),
    lastResumedAt: Number.isFinite(Number(rawActiveSession.lastResumedAt)) ? Number(rawActiveSession.lastResumedAt) : null,
    running: Boolean(rawActiveSession.running)
  } : null;
  return {
    id: String(task.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    title,
    description: String(task.description || '').trim().slice(0, 4000),
    status: done ? 'completed' : 'open',
    priority: ['high', 'normal', 'low'].includes(task.priority) ? task.priority : 'normal',
    done,
    archived: Boolean(task.archived),
    deletedAt: task.deletedAt && Number.isFinite(Number(task.deletedAt)) ? Number(task.deletedAt) : null,
    date,
    dueTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime || '') ? task.dueTime : null,
    estimatedMinutes: Number(task.estimatedMinutes) > 0 ? Math.min(1440, Math.round(Number(task.estimatedMinutes))) : null,
    projectId: task.projectId ? String(task.projectId).slice(0, 120) : null,
    subtasks,
    recurrence: ['none', 'daily', 'weekdays', 'weekly', 'monthly'].includes(task.recurrence) ? task.recurrence : 'none',
    reminderAt: Number(task.reminderAt) > 0 ? Number(task.reminderAt) : null,
    createdAt,
    completedAt,
    updatedAt: Number.isFinite(Number(task.updatedAt)) ? Number(task.updatedAt) : (completedAt || createdAt),
    order: Number.isFinite(Number(task.order)) ? Number(task.order) : createdAt,
    seriesId: task.seriesId ? String(task.seriesId).slice(0, 120) : null,
    weeklyTargetId: task.weeklyTargetId ? String(task.weeklyTargetId).slice(0, 120) : null,
    actualSeconds: Math.max(0, Math.min(31536000, Math.round(Number(task.actualSeconds) || 0))),
    focusNotes: String(task.focusNotes || '').slice(0, 4000),
    focusSessions,
    activeSession
  };
}

function normalizeProject(project) {
  if (!project || typeof project !== 'object') return null;
  const name = String(project.name || '').trim().slice(0, 60);
  if (!name) return null;
  return {
    id: String(project.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`).slice(0, 120),
    name,
    color: /^#[0-9a-f]{6}$/i.test(project.color || '') ? project.color : '#0a84ff',
    archived: Boolean(project.archived),
    createdAt: Number.isFinite(Number(project.createdAt)) ? Number(project.createdAt) : Date.now(),
    updatedAt: Number.isFinite(Number(project.updatedAt)) ? Number(project.updatedAt) : Date.now()
  };
}

function readProjects() {
  const projects = readJson(projectsFile(), []);
  return Array.isArray(projects) ? projects.map(normalizeProject).filter(Boolean) : [];
}

function writeProjects(projects) {
  const safeProjects = Array.isArray(projects) ? projects.slice(0, 250).map(normalizeProject).filter(Boolean) : [];
  writeJson(projectsFile(), safeProjects);
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('projects:changed');
  return true;
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
  let tasks = readJson(dataFile(), null);
  if (!Array.isArray(tasks)) tasks = readJson(path.join(app.getPath('userData'), 'tasks.backup.json'), null);
  if (!Array.isArray(tasks)) tasks = readJson(path.join(app.getPath('userData'), 'tasks.backup.2.json'), []);
  const normalized = Array.isArray(tasks) ? tasks.map(normalizeTask).filter(Boolean) : [];
  if (normalized.some((task) => task.order < -1000000000)) {
    normalized
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((task, index) => { task.order = index; });
  }
  return normalized;
}

function writeTasks(tasks) {
  const incomingTasks = Array.isArray(tasks) ? tasks.slice(0, 5000).map(normalizeTask).filter(Boolean) : [];
  const taskMap = new Map(readTasks().map((task) => [task.id, task]));
  for (const task of incomingTasks) {
    const existing = taskMap.get(task.id);
    if (!existing || task.updatedAt >= existing.updatedAt) taskMap.set(task.id, task);
  }
  const safeTasks = [...taskMap.values()].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt).slice(0, 5000);
  if (fs.existsSync(dataFile())) {
    try {
      const firstBackup = path.join(app.getPath('userData'), 'tasks.backup.json');
      const secondBackup = path.join(app.getPath('userData'), 'tasks.backup.2.json');
      if (fs.existsSync(firstBackup)) fs.copyFileSync(firstBackup, secondBackup);
      fs.copyFileSync(dataFile(), firstBackup);
    } catch { /* Keep saving even if backup rotation fails. */ }
  }
  writeJson(dataFile(), safeTasks);
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('tasks:changed');
  }
  return true;
}

function checkReminders() {
  if (!Notification.isSupported()) return;
  const now = Date.now();
  const notified = new Set(readJson(reminderLogFile(), []));
  let changed = false;
  for (const task of readTasks()) {
    const reminderKey = `${task.id}:${task.reminderAt}`;
    if (!task.archived && !task.done && task.reminderAt && task.reminderAt <= now && task.reminderAt > now - 86400000 && !notified.has(reminderKey)) {
      const notification = new Notification({ title: task.title, body: task.description || 'TaskNest reminder' });
      notification.on('click', () => createMainWindow());
      notification.show();
      notified.add(reminderKey);
      changed = true;
    }
  }
  if (changed) writeJson(reminderLogFile(), [...notified].slice(-1000));
}

function recognizeVoice(language) {
  return new Promise((resolve) => {
    if (voiceRecognitionProcess) return resolve({ ok: false, error: 'busy' });
    const culture = /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(language || '') ? language : 'en-US';
    const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const bundledScript = path.join(__dirname, 'voice-recognition.ps1');
    const speechScript = app.isPackaged ? bundledScript.replace('app.asar', 'app.asar.unpacked') : bundledScript;
    const child = spawn(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', speechScript, '-CultureName', culture, '-TimeoutSeconds', '10'
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    voiceRecognitionProcess = child;
    let stdout = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (voiceRecognitionProcess === child) voiceRecognitionProcess = null;
      resolve(result);
    };
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.on('error', () => finish({ ok: false, error: 'unavailable' }));
    child.on('close', (code) => {
      const raw = stdout.trim().replace(/^\uFEFF/, '');
      if (code === 0 && raw) {
        try {
          const result = JSON.parse(raw);
          const text = String(result.text || '').trim().slice(0, 160);
          if (text) return finish({ ok: true, text, confidence: Number(result.confidence), culture: result.culture, alternatives: result.alternatives || [] });
        } catch {
          return finish({ ok: true, text: raw.slice(0, 160) });
        }
      }
      if (code === 3) return finish({ ok: false, error: 'no-speech' });
      finish({ ok: false, error: code === 2 ? 'language' : 'audio-capture' });
    });
    const watchdog = setTimeout(() => {
      child.kill();
      finish({ ok: false, error: 'no-speech' });
    }, 15000);
  });
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
  const isLocalTaskNest = (webContents) => Boolean(webContents && webContents.getURL().startsWith('file://'));
  session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => (
    isLocalTaskNest(webContents) && permission === 'media' && (!details?.mediaType || details.mediaType === 'audio')
  ));
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const mediaTypes = Array.isArray(details?.mediaTypes) ? details.mediaTypes : [];
    const audioOnly = mediaTypes.length === 0 || mediaTypes.every((type) => type === 'audio');
    callback(isLocalTaskNest(webContents) && permission === 'media' && audioOnly);
  });
  createMainWindow();
  if (readSettings().widgetEnabled) createWidgetWindow();
  checkReminders();
  setInterval(checkReminders, 30000);
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
ipcMain.handle('projects:load', () => readProjects());
ipcMain.handle('projects:save', (_event, projects) => writeProjects(projects));
ipcMain.handle('voice:recognize', (_event, language) => recognizeVoice(language));
ipcMain.handle('voice:cancel', () => {
  if (!voiceRecognitionProcess) return false;
  voiceRecognitionProcess.kill();
  voiceRecognitionProcess = null;
  return true;
});

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
