if (!window.tasknest) {
  const taskKey = 'tasknest-browser-tasks';
  const settingsKey = 'tasknest-browser-settings';
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  window.tasknest = {
    loadTasks: async () => read(taskKey, []),
    saveTasks: async (items) => { write(taskKey, items); return true; },
    loadSettings: async () => read(settingsKey, { widgetPinned: true, widgetView: 'today', timeTarget: null }),
    saveSettings: async (update) => { const settings = { ...read(settingsKey, {}), ...update }; write(settingsKey, settings); return settings; },
    toggleWidgetPin: async () => { const current = read(settingsKey, {}); const settings = { ...current, widgetPinned: !current.widgetPinned }; write(settingsKey, settings); return settings; },
    openMain: () => { window.location.href = 'index.html'; },
    minimizeWidget: () => {}, closeWidget: () => window.close(), removeWidget: () => {}, cancelVoice: () => {},
    onTasksChanged: () => {}, onWidgetSettings: () => {}
  };
}

const widgetList = document.getElementById('widgetList');
const emptyState = document.getElementById('emptyState');
const quickInput = document.getElementById('quickInput');
const pinButton = document.getElementById('pinButton');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');
const toastUndo = document.getElementById('toastUndo');
const widgetVoiceButton = document.getElementById('widgetVoiceButton');

let tasks = [];
let today = localDateKey(new Date());
let toastTimer;
let undoAction = null;
let voiceRecognition = null;
let voiceListening = false;
let voiceSeed = '';
let voiceHadResult = false;
let silenceVoiceEnd = false;
let nativeVoiceActive = false;
let nativeVoiceCancelled = false;
let settings = { widgetPinned: true, widgetView: 'today', timeTarget: null };
let widgetMode = 'today';

function normalizeTask(task) {
  const createdAt = Number(task.createdAt) || Date.now();
  const done = task.status === 'completed' || Boolean(task.done);
  return {
    ...task,
    status: done ? 'completed' : 'open',
    done,
    description: task.description || '',
    dueTime: task.dueTime || null,
    estimatedMinutes: Number(task.estimatedMinutes) || null,
    projectId: task.projectId || null,
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    recurrence: task.recurrence || 'none',
    reminderAt: Number(task.reminderAt) || null,
    createdAt,
    completedAt: Number(task.completedAt) || null,
    updatedAt: Number(task.updatedAt) || Number(task.completedAt) || createdAt,
    order: Number.isFinite(Number(task.order)) ? Number(task.order) : createdAt,
    archived: Boolean(task.archived),
    deletedAt: Number(task.deletedAt) || null,
    seriesId: task.seriesId || null,
    timeTargetId: task.timeTargetId || null
  };
}

function touch(task) {
  task.updatedAt = Date.now();
}

function prepareTasks(items) {
  const normalized = items.map(normalizeTask);
  if (normalized.some((task) => task.order < -1000000000)) {
    normalized
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((task, index) => { task.order = index; });
  }
  return normalized;
}

function nextTaskOrder() {
  return tasks.length ? Math.max(...tasks.map((task) => task.order)) + 1 : 0;
}

function nextOccurrenceDate(task) {
  if (!task.date || task.recurrence === 'none') return null;
  const [year, month, day] = task.date.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (task.recurrence === 'daily') date.setDate(date.getDate() + 1);
  if (task.recurrence === 'weekly') date.setDate(date.getDate() + 7);
  if (task.recurrence === 'monthly') {
    const preferredDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(preferredDay, lastDay));
  }
  if (task.recurrence === 'weekdays') do { date.setDate(date.getDate() + 1); } while ([0, 6].includes(date.getDay()));
  return localDateKey(date);
}

function createNextOccurrence(task) {
  const nextDate = nextOccurrenceDate(task);
  if (!nextDate) return;
  const seriesId = task.seriesId || task.id;
  task.seriesId = seriesId;
  if (tasks.some((item) => !item.archived && item.seriesId === seriesId && item.date === nextDate)) return;
  const now = Date.now();
  tasks.push(normalizeTask({
    ...task,
    id: `${now}-${Math.random().toString(16).slice(2)}`,
    date: nextDate,
    status: 'open',
    done: false,
    archived: false,
    deletedAt: null,
    createdAt: now,
    completedAt: null,
    updatedAt: now,
    order: nextTaskOrder(),
    reminderAt: null,
    seriesId,
    timeTargetId: null,
    subtasks: task.subtasks.map((item) => ({ ...item, id: `${now}-${Math.random().toString(16).slice(2)}`, done: false, completedAt: null, createdAt: now }))
  }));
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function showToast(message, action = null) {
  clearTimeout(toastTimer);
  toastText.textContent = message;
  undoAction = action;
  toastUndo.classList.toggle('hidden', !action);
  toast.classList.add('show');
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    undoAction = null;
  }, action ? 5000 : 1500);
}

function setVoiceListening(listening) {
  voiceListening = listening;
  widgetVoiceButton.classList.toggle('listening', listening);
  widgetVoiceButton.setAttribute('aria-pressed', String(listening));
  widgetVoiceButton.setAttribute('aria-label', listening ? 'Stop listening' : 'Add task with your voice');
  widgetVoiceButton.title = listening ? 'Listening… click to stop' : 'Speak a task';
}

function speechErrorMessage(error) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'Allow microphone access and try again';
  if (error === 'audio-capture') return 'No microphone was found';
  if (error === 'network') return 'Voice recognition needs internet';
  if (error === 'no-speech') return 'I didn’t hear anything';
  if (error === 'language') return 'Speech language is not installed';
  if (error === 'busy') return 'Microphone is already in use';
  return 'Voice recognition could not start';
}

function stopVoiceInput(silent = false) {
  silenceVoiceEnd = silent;
  if (nativeVoiceActive) {
    nativeVoiceCancelled = true;
    window.tasknest.cancelVoice?.();
    setVoiceListening(false);
    return;
  }
  if (voiceRecognition && voiceListening) voiceRecognition.stop();
}

async function toggleVoiceInput() {
  if (voiceListening) return stopVoiceInput();

  if (typeof window.tasknest.recognizeVoice === 'function') {
    voiceSeed = quickInput.value.trim();
    voiceHadResult = false;
    silenceVoiceEnd = false;
    nativeVoiceActive = true;
    nativeVoiceCancelled = false;
    setVoiceListening(true);
    const result = await window.tasknest.recognizeVoice(navigator.language || 'en-US');
    const cancelled = nativeVoiceCancelled;
    nativeVoiceActive = false;
    setVoiceListening(false);
    quickInput.focus();
    if (cancelled) {
      if (!silenceVoiceEnd) showToast('Listening stopped');
      return;
    }
    if (!result?.ok) return showToast(speechErrorMessage(result?.error));
    const spoken = String(result.text || '').trim();
    if (!spoken) return showToast('I didn’t hear anything');
    voiceHadResult = true;
    quickInput.value = `${voiceSeed}${voiceSeed ? ' ' : ''}${spoken}`.slice(0, quickInput.maxLength);
    quickInput.dispatchEvent(new Event('input', { bubbles: true }));
    showToast('Voice captured — press + to save');
    return;
  }

  const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionApi) {
    quickInput.focus();
    showToast('Press Win + H for voice typing');
    return;
  }

  voiceSeed = quickInput.value.trim();
  voiceHadResult = false;
  silenceVoiceEnd = false;
  voiceRecognition = new SpeechRecognitionApi();
  voiceRecognition.lang = navigator.language || 'en-US';
  voiceRecognition.continuous = false;
  voiceRecognition.interimResults = true;
  voiceRecognition.maxAlternatives = 1;
  voiceRecognition.onstart = () => setVoiceListening(true);
  voiceRecognition.onresult = (event) => {
    const spoken = Array.from(event.results).map((result) => result[0]?.transcript || '').join(' ').trim();
    if (!spoken) return;
    voiceHadResult = true;
    quickInput.value = `${voiceSeed}${voiceSeed ? ' ' : ''}${spoken}`.slice(0, quickInput.maxLength);
    quickInput.dispatchEvent(new Event('input', { bubbles: true }));
  };
  voiceRecognition.onerror = (event) => {
    if (event.error === 'aborted') return;
    silenceVoiceEnd = true;
    showToast(speechErrorMessage(event.error));
  };
  voiceRecognition.onend = () => {
    setVoiceListening(false);
    voiceRecognition = null;
    quickInput.focus();
    if (!silenceVoiceEnd) showToast(voiceHadResult ? 'Voice captured — press + to save' : 'Listening stopped');
  };

  try {
    voiceRecognition.start();
  } catch {
    voiceRecognition = null;
    setVoiceListening(false);
    showToast('Voice recognition is already starting');
  }
}

toastUndo.addEventListener('click', () => {
  if (!undoAction) return;
  const action = undoAction;
  undoAction = null;
  clearTimeout(toastTimer);
  toast.classList.remove('show');
  action();
});

async function persist(message, action = null) {
  await window.tasknest.saveTasks(tasks);
  if (message) showToast(message, action);
}

function render() {
  const target = settings.timeTarget;
  if (widgetMode === 'timeTarget' && !target) widgetMode = 'today';
  const visibleTasks = tasks
    .filter((task) => !task.archived && (widgetMode === 'timeTarget' ? task.timeTargetId === target?.id : task.date === today))
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const complete = visibleTasks.filter((task) => task.done).length;
  const percent = visibleTasks.length ? Math.round(complete / visibleTasks.length * 100) : 0;
  document.querySelectorAll('[data-widget-mode]').forEach((button) => button.classList.toggle('active', button.dataset.widgetMode === widgetMode));
  document.querySelector('[data-widget-mode="timeTarget"]').disabled = !target;
  document.getElementById('dateLabel').textContent = widgetMode === 'timeTarget' ? 'ACTIVE TIME TARGET' : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date()).toUpperCase();
  document.getElementById('widgetHeading').textContent = widgetMode === 'timeTarget' ? target.label : 'Today’s focus';
  document.getElementById('scoreValue').textContent = `${percent}%`;
  document.getElementById('progressBar').style.width = `${percent}%`;
  document.getElementById('remainingLabel').textContent = visibleTasks.length - complete ? `${visibleTasks.length - complete} still open` : visibleTasks.length ? 'Everything complete' : 'Nothing pending';
  quickInput.placeholder = widgetMode === 'timeTarget' ? 'Add to this time target…' : 'Add today’s task…';
  quickInput.setAttribute('aria-label', widgetMode === 'timeTarget' ? 'Add a task to this time target' : 'Add today’s task');
  document.getElementById('targetSummary').classList.toggle('hidden', widgetMode !== 'timeTarget');
  document.getElementById('emptyTitle').textContent = widgetMode === 'timeTarget' ? 'This block is empty' : 'Nothing here yet';
  document.getElementById('emptyCopy').textContent = widgetMode === 'timeTarget' ? 'Add the first to-do for this time period.' : 'Add today’s first task above.';
  emptyState.classList.toggle('hidden', visibleTasks.length !== 0);
  widgetList.classList.toggle('hidden', visibleTasks.length === 0);
  widgetList.innerHTML = visibleTasks.map((task) => `<article class="widget-task ${task.done ? 'done' : ''}" data-id="${task.id}">
    <button class="check" data-action="toggle" aria-label="${task.done ? 'Reopen' : 'Complete'} task"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></button>
    <button class="task-title" data-action="edit" title="Click to edit">${escapeHtml(task.title)}</button>
    <button class="edit" data-action="edit" aria-label="Edit task" title="Edit task"><svg viewBox="0 0 24 24"><path d="m4 16-.8 4 4-.8L18 8.4 14.6 5 4 16Z"/></svg></button>
    <button class="delete" data-action="delete" aria-label="Delete task" title="Delete task"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>
  </article>`).join('');
  renderTargetClock();
}

function renderTargetClock() {
  if (widgetMode !== 'timeTarget' || !settings.timeTarget) return;
  const target = settings.timeTarget;
  const seconds = Math.max(0, Math.ceil((target.endsAt - Date.now()) / 1000));
  const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor(seconds % 3600 / 60)).padStart(2, '0');
  const remainder = String(seconds % 60).padStart(2, '0');
  document.getElementById('targetCountdown').textContent = seconds ? `${hours}:${minutes}:${remainder}` : 'Complete';
  document.getElementById('targetEnds').textContent = `${seconds ? 'Ends' : 'Finished'} at ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(target.endsAt))}`;
}

function beginInlineEdit(item, index) {
  const oldTitle = tasks[index].title;
  const titleButton = item.querySelector('.task-title');
  const input = document.createElement('input');
  input.className = 'inline-edit';
  input.maxLength = 160;
  input.value = oldTitle;
  titleButton.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  const finish = (save) => {
    if (finished) return;
    finished = true;
    const nextTitle = input.value.trim();
    if (save && nextTitle && nextTitle !== oldTitle) {
      tasks[index].title = nextTitle;
      touch(tasks[index]);
      persist('Task updated');
    }
    render();
  };

  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    if (event.key === 'Escape') { event.preventDefault(); finish(false); }
  });
}

document.getElementById('quickForm').addEventListener('submit', (event) => {
  event.preventDefault();
  stopVoiceInput(true);
  const title = quickInput.value.trim();
  if (!title) { quickInput.focus(); return; }
  const now = Date.now();
  tasks.push(normalizeTask({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title,
    description: '',
    priority: 'normal',
    status: 'open',
    done: false,
    archived: false,
    date: today,
    dueTime: null,
    estimatedMinutes: null,
    projectId: null,
    subtasks: [],
    recurrence: 'none',
    reminderAt: null,
    createdAt: now,
    completedAt: null,
    updatedAt: now,
    order: nextTaskOrder(),
    timeTargetId: widgetMode === 'timeTarget' ? settings.timeTarget?.id || null : null
  }));
  quickInput.value = '';
  persist('Task saved');
  render();
  quickInput.focus();
});

widgetVoiceButton.addEventListener('click', toggleVoiceInput);
document.querySelector('.widget-mode-switch').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-widget-mode]');
  if (!button || button.disabled) return;
  widgetMode = button.dataset.widgetMode;
  settings = await window.tasknest.saveSettings({ widgetView: widgetMode });
  render();
  quickInput.focus();
});

widgetList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const item = button.closest('.widget-task');
  const index = tasks.findIndex((task) => task.id === item.dataset.id);
  if (index < 0) return;

  if (button.dataset.action === 'toggle') {
    tasks[index].done = !tasks[index].done;
    tasks[index].status = tasks[index].done ? 'completed' : 'open';
    tasks[index].completedAt = tasks[index].done ? Date.now() : null;
    touch(tasks[index]);
    if (tasks[index].done) createNextOccurrence(tasks[index]);
    persist(tasks[index].done ? 'Nicely done' : 'Task reopened');
    render();
  } else if (button.dataset.action === 'edit') {
    beginInlineEdit(item, index);
  } else {
    const deletedTask = { ...tasks[index] };
    tasks[index].archived = true;
    tasks[index].deletedAt = Date.now();
    touch(tasks[index]);
    persist('Task deleted', () => {
      tasks[index].archived = deletedTask.archived;
      tasks[index].deletedAt = deletedTask.deletedAt;
      touch(tasks[index]);
      persist('Task restored');
      render();
    });
    render();
  }
});

pinButton.addEventListener('click', async () => applySettings(await window.tasknest.toggleWidgetPin()));
document.getElementById('openMainButton').addEventListener('click', () => window.tasknest.openMain());
document.getElementById('minimizeButton').addEventListener('click', () => window.tasknest.minimizeWidget());
document.getElementById('closeButton').addEventListener('click', () => window.tasknest.closeWidget());
document.getElementById('removeWidget').addEventListener('click', () => window.tasknest.removeWidget());

function applySettings(nextSettings) {
  settings = { ...settings, ...nextSettings };
  widgetMode = settings.widgetView === 'timeTarget' && settings.timeTarget ? 'timeTarget' : 'today';
  pinButton.classList.toggle('unpinned', !settings.widgetPinned);
  pinButton.title = settings.widgetPinned ? 'Stop keeping above other windows' : 'Keep above other windows';
  render();
}

window.tasknest.onTasksChanged(async () => {
  tasks = prepareTasks(await window.tasknest.loadTasks());
  render();
});
window.tasknest.onWidgetSettings(applySettings);

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    quickInput.focus();
    quickInput.select();
  }
});

setInterval(async () => {
  const currentDate = localDateKey(new Date());
  if (currentDate === today) return;
  today = currentDate;
  tasks = prepareTasks(await window.tasknest.loadTasks());
  render();
}, 60000);

async function init() {
  tasks = prepareTasks(await window.tasknest.loadTasks());
  applySettings(await window.tasknest.loadSettings());
  setTimeout(() => quickInput.focus(), 200);
}

init();
