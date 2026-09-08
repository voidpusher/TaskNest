const { app, BrowserWindow, ipcMain, screen, Notification, session, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let widgetWindow;
let voiceRecognitionProcess;
let tray;
let isQuitting = false;

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

function normalizeRecurrence(task) {
  const recurrence = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'].includes(task.recurrence) ? task.recurrence : 'none';
  const raw = task.recurrenceRule && typeof task.recurrenceRule === 'object' ? task.recurrenceRule : {};
  const fallbackFrequency = recurrence === 'custom' ? 'day' : recurrence === 'weekly' || recurrence === 'weekdays' ? 'week' : recurrence === 'monthly' ? 'month' : 'day';
  const weekdays = [...new Set((Array.isArray(raw.weekdays) ? raw.weekdays : recurrence === 'weekdays' ? [1, 2, 3, 4, 5] : []).map(Number).filter((day) => day >= 0 && day <= 6))].sort();
  return {
    recurrence,
    recurrenceRule: {
      frequency: ['day', 'week', 'month'].includes(raw.frequency) ? raw.frequency : fallbackFrequency,
      interval: Math.max(1, Math.min(99, Math.round(Number(raw.interval) || 1))),
      weekdays,
      anchorDay: Math.max(1, Math.min(31, Math.round(Number(raw.anchorDay) || 0))) || null,
      anchorDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.anchorDate || '') ? raw.anchorDate : null
    }
  };
}

function normalizeReminders(task, createdAt) {
  const source = Array.isArray(task.reminders) ? task.reminders : task.reminderAt ? [{ id: `legacy-${task.reminderAt}`, kind: 'exact', at: task.reminderAt }] : [];
  const seen = new Set();
  return source.slice(0, 10).map((reminder) => {
    if (!reminder || typeof reminder !== 'object') return null;
    const kind = reminder.kind === 'before' ? 'before' : 'exact';
    const minutesBefore = kind === 'before' ? Math.max(0, Math.min(525600, Math.round(Number(reminder.minutesBefore) || 0))) : null;
    const at = kind === 'exact' && Number(reminder.at) > 0 ? Number(reminder.at) : null;
    if (kind === 'exact' && !at) return null;
    const id = String(reminder.id || `${createdAt}-${kind}-${minutesBefore ?? at}`).slice(0, 120);
    if (seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      kind,
      minutesBefore,
      at,
      snoozedUntil: Number(reminder.snoozedUntil) > 0 ? Number(reminder.snoozedUntil) : null,
      dismissedAt: Number(reminder.dismissedAt) > 0 ? Number(reminder.dismissedAt) : null,
      lastTriggeredAt: Number(reminder.lastTriggeredAt) > 0 ? Number(reminder.lastTriggeredAt) : null
    };
  }).filter(Boolean);
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
  const { recurrence, recurrenceRule } = normalizeRecurrence(task);
  const reminders = normalizeReminders(task, createdAt);
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
    recurrence,
    recurrenceRule,
    reminders,
    reminderAt: null,
    createdAt,
    completedAt,
    updatedAt: Number.isFinite(Number(task.updatedAt)) ? Number(task.updatedAt) : (completedAt || createdAt),
    order: Number.isFinite(Number(task.order)) ? Number(task.order) : createdAt,
    occurrenceKey: task.occurrenceKey ? String(task.occurrenceKey).slice(0, 260) : null,
    seriesId: task.seriesId ? String(task.seriesId).slice(0, 120) : null,
    weeklyTargetId: task.weeklyTargetId ? String(task.weeklyTargetId).slice(0, 120) : null,
    timeTargetId: task.timeTargetId ? String(task.timeTargetId).slice(0, 120) : null,
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
  updateLoginBehavior(safeTasks);
  return true;
}

function updateLoginBehavior(currentTasks = null) {
  if (!app.isReady()) return;
  const reminderTasks = (currentTasks || readTasks()).some((task) => !task.archived && !task.done && task.reminders.length);
  const settings = readSettings();
  const shouldStart = settings.widgetEnabled || reminderTasks || (settings.timeTarget && settings.timeTarget.endsAt > Date.now());
  app.setLoginItemSettings({ openAtLogin: shouldStart, args: shouldStart ? ['--background'] : [] });
}

function taskDeadline(task) {
  if (!task.date) return null;
  const [year, month, day] = task.date.split('-').map(Number);
  const [hour, minute] = (task.dueTime || '09:00').split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).getTime();
}

function reminderTimestamp(task, reminder) {
  if (reminder.snoozedUntil) return reminder.snoozedUntil;
  if (reminder.kind === 'exact') return reminder.at;
  const deadline = taskDeadline(task);
  return deadline ? deadline - reminder.minutesBefore * 60000 : null;
}

function sendReminderToWindows(task, reminder, dueAt) {
  const payload = { taskId: task.id, reminderId: reminder.id, title: task.title, dueAt };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('reminder:due', payload);
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.webContents.send('reminder:due', payload);
}

function openReminder(task, reminder, dueAt) {
  const window = createMainWindow();
  const send = () => window.webContents.send('reminder:due', { taskId: task.id, reminderId: reminder.id, title: task.title, dueAt });
  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send); else send();
}

function checkReminders() {
  if (!Notification.isSupported()) return;
  const now = Date.now();
  const notified = new Set(readJson(reminderLogFile(), []));
  let changed = false;
  for (const task of readTasks()) {
    if (task.archived || task.done) continue;
    for (const reminder of task.reminders) {
      const dueAt = reminderTimestamp(task, reminder);
      const reminderKey = `${task.id}:${reminder.id}:${dueAt}`;
      if (!reminder.dismissedAt && dueAt && dueAt <= now && dueAt > now - 86400000 && !notified.has(reminderKey)) {
        const dueCopy = task.dueTime ? `Due ${task.dueTime}` : task.date ? `Scheduled ${task.date}` : 'Open TaskNest to review';
        const notification = new Notification({ title: task.title, body: task.description || dueCopy });
        notification.on('click', () => openReminder(task, reminder, dueAt));
        notification.show();
        sendReminderToWindows(task, reminder, dueAt);
        notified.add(reminderKey);
        changed = true;
      }
    }
  }
  const target = readSettings().timeTarget;
  if (target && target.endsAt <= now && target.endsAt > now - 86400000) {
    const targetKey = `time-target:${target.id}:${target.endsAt}`;
    if (!notified.has(targetKey)) {
      const notification = new Notification({ title: 'Time target complete', body: `${target.label || 'Focused window'} is finished.` });
      notification.on('click', () => createMainWindow());
      notification.show();
      notified.add(targetKey);
      changed = true;
    }
  }
  if (changed) writeJson(reminderLogFile(), [...notified].slice(-1000));
}

function createTray() {
  if (tray) return tray;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="9" fill="#0a84ff"/><path d="M8 16l5 5L24 10" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('TaskNest — reminders are active');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open TaskNest', click: () => createMainWindow() },
    { label: 'Check reminders now', click: () => checkReminders() },
    { type: 'separator' },
    { label: 'Quit TaskNest', click: () => { isQuitting = true; app.quit(); } }
  ]));
  tray.on('double-click', () => createMainWindow());
  return tray;
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
  const raw = { widgetEnabled: false, widgetPinned: true, widgetBounds: null, timeTarget: null, ...readJson(settingsFile(), {}) };
  const target = raw.timeTarget && typeof raw.timeTarget === 'object' && Number(raw.timeTarget.endsAt) > 0 ? {
    id: String(raw.timeTarget.id || `target-${Date.now()}`).slice(0, 120),
    label: String(raw.timeTarget.label || 'Focused window').slice(0, 80),
    startedAt: Number(raw.timeTarget.startedAt) || Date.now(),
    endsAt: Number(raw.timeTarget.endsAt),
    durationSeconds: Math.max(60, Math.round(Number(raw.timeTarget.durationSeconds) || (Number(raw.timeTarget.endsAt) - Number(raw.timeTarget.startedAt)) / 1000)),
    notifiedAt: Number(raw.timeTarget.notifiedAt) || null
  } : null;
  return { ...raw, timeTarget: target };
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
  if (!process.argv.includes('--background')) createMainWindow();
  createTray();
  if (readSettings().widgetEnabled) createWidgetWindow();
  updateLoginBehavior();
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
  if (process.platform === 'darwin' && isQuitting) app.quit();
});

app.on('before-quit', () => { isQuitting = true; });

ipcMain.handle('tasks:load', () => readTasks());
ipcMain.handle('tasks:save', (_event, tasks) => {
  const saved = writeTasks(tasks);
  setImmediate(checkReminders);
  return saved;
});
ipcMain.handle('settings:load', () => readSettings());
ipcMain.handle('settings:save', (_event, update) => {
  const settings = saveSettings(update && typeof update === 'object' ? update : {});
  updateLoginBehavior();
  setImmediate(checkReminders);
  return settings;
});
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
  updateLoginBehavior();
  createWidgetWindow();
  return readSettings();
});

ipcMain.handle('widget:remove', () => {
  saveSettings({ widgetEnabled: false });
  updateLoginBehavior();
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
