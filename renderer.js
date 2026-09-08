if (!window.tasknest) {
  document.documentElement.classList.add('web-runtime');
  const keys = {
    tasks: 'tasknest-browser-tasks',
    settings: 'tasknest-browser-settings',
    targets: 'tasknest-browser-weekly-targets',
    projects: 'tasknest-browser-projects'
  };
  const read = (key, fallback) => JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  const write = (key, value) => { localStorage.setItem(key, JSON.stringify(value)); return true; };
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const starterTasks = [
    { id: 'preview-1', title: 'Polish the project presentation', description: 'Tighten the story and check the final slides.', priority: 'high', done: false, status: 'open', archived: false, date: todayKey, dueTime: '10:00', estimatedMinutes: 45, createdAt: Date.now() - 3600000 },
    { id: 'preview-2', title: 'Review today’s top priorities', priority: 'normal', done: true, status: 'completed', archived: false, date: todayKey, createdAt: Date.now() - 2700000, completedAt: Date.now() - 900000 },
    { id: 'preview-3', title: 'Take a 30-minute mountain walk', priority: 'low', done: false, status: 'open', archived: false, date: todayKey, estimatedMinutes: 30, createdAt: Date.now() - 1800000 }
  ];
  window.tasknest = {
    loadTasks: async () => read(keys.tasks, starterTasks),
    saveTasks: async (items) => write(keys.tasks, items),
    loadSettings: async () => read(keys.settings, { widgetEnabled: false }),
    saveSettings: async (settings) => { const next = { ...read(keys.settings, {}), ...settings }; write(keys.settings, next); return next; },
    loadWeeklyTargets: async () => read(keys.targets, []),
    saveWeeklyTargets: async (items) => write(keys.targets, items),
    loadProjects: async () => read(keys.projects, []),
    saveProjects: async (items) => write(keys.projects, items),
    openWidget: async () => { const settings = { ...read(keys.settings, {}), widgetEnabled: true }; write(keys.settings, settings); return settings; },
    removeWidget: async () => { const settings = { ...read(keys.settings, {}), widgetEnabled: false }; write(keys.settings, settings); return settings; },
    onTasksChanged: () => {},
    onWeeklyTargetsChanged: () => {},
    onProjectsChanged: () => {},
    onReminderDue: () => {},
    onWidgetSettings: () => {}
  };
}

const $ = (id) => document.getElementById(id);
const taskForm = $('taskForm');
const taskInput = $('taskInput');
const priorityInput = $('priorityInput');
const taskList = $('taskList');
const emptyState = $('emptyState');
const clearButton = $('clearButton');
const toast = $('toast');
const toastText = $('toastText');
const toastUndo = $('toastUndo');
const datePicker = $('datePicker');
const editDialog = $('editDialog');
const editForm = $('editForm');
const searchInput = $('searchInput');
const calendarGrid = $('calendarGrid');
const weeklyTargetForm = $('weeklyTargetForm');
const weeklyTargetList = $('weeklyTargetList');
const projectForm = $('projectForm');
const projectGrid = $('projectGrid');
const bulkBar = $('bulkBar');
const voiceButton = $('voiceButton');
const voiceStatus = $('voiceStatus');
const voiceLanguage = $('voiceLanguage');
const todayCommand = $('todayCommand');
const focusDialog = $('focusDialog');
const recoveryDialog = $('recoveryDialog');

let tasks = [];
let weeklyTargets = [];
let projects = [];
let selectedDate = localDateKey(new Date());
let activeView = 'today';
let activeFilter = 'all';
let searchQuery = '';
let widgetEnabled = false;
let timeTarget = null;
let timeTargetTimer = null;
let editingTaskId = null;
let editingSubtasks = [];
let editingReminders = [];
let editingWeekdays = [];
let selectionMode = false;
let selectedTaskIds = new Set();
let draggedTaskId = null;
let toastTimer;
let undoAction = null;
let voiceRecognition = null;
let voiceListening = false;
let voiceSeed = '';
let voiceHadResult = false;
let silenceVoiceEnd = false;
let nativeVoiceActive = false;
let nativeVoiceCancelled = false;
let voiceFinalTranscript = '';
let voiceInterimTranscript = '';
let voiceStopRequested = false;
let voiceTimeoutTimer = null;
let voiceFinishTimer = null;
let focusTaskId = null;
let recoveryTaskId = null;
let focusTimerInterval = null;
let focusNoteTimer = null;
let activeReminder = null;
let reminderCheckTimer = null;
const shownReminderKeys = new Set();

const VOICE_LANGUAGE_KEY = 'tasknest-voice-language';

const icon = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4 4-.8L18 8.4 14.6 5 4 16ZM13.5 6.1l3.4 3.4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
  drag: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6V6Z"/></svg>',
  recover: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V4m0 0h4M4 4l4 4a7 7 0 1 1-1.4 7.9"/></svg>'
};

function uid(prefix = 'task') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDate(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function validDateKey(key) {
  return /^\d{4}-\d{2}-\d{2}$/.test(key || '') && localDateKey(parseDate(key)) === key;
}

function normalizedRecurrenceRule(task, date = null) {
  const recurrence = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'].includes(task?.recurrence) ? task.recurrence : 'none';
  const raw = task?.recurrenceRule && typeof task.recurrenceRule === 'object' ? task.recurrenceRule : {};
  const fallbackFrequency = recurrence === 'weekly' || recurrence === 'weekdays' ? 'week' : recurrence === 'monthly' ? 'month' : 'day';
  const fallbackWeekdays = recurrence === 'weekdays' ? [1, 2, 3, 4, 5] : [];
  const weekdays = [...new Set((Array.isArray(raw.weekdays) ? raw.weekdays : fallbackWeekdays).map(Number).filter((day) => day >= 0 && day <= 6))].sort();
  const anchorDate = validDateKey(raw.anchorDate) ? raw.anchorDate : validDateKey(date || task?.date) ? (date || task.date) : null;
  return {
    frequency: ['day', 'week', 'month'].includes(raw.frequency) ? raw.frequency : fallbackFrequency,
    interval: Math.max(1, Math.min(99, Math.round(Number(raw.interval) || 1))),
    weekdays,
    anchorDay: Math.max(1, Math.min(31, Math.round(Number(raw.anchorDay) || 0))) || (anchorDate ? parseDate(anchorDate).getDate() : null),
    anchorDate
  };
}

function normalizeClientReminders(task) {
  const source = Array.isArray(task?.reminders) ? task.reminders : task?.reminderAt ? [{ id: `legacy-${task.reminderAt}`, kind: 'exact', at: task.reminderAt }] : [];
  const seen = new Set();
  return source.slice(0, 10).map((reminder) => {
    if (!reminder || typeof reminder !== 'object') return null;
    const kind = reminder.kind === 'before' ? 'before' : 'exact';
    const minutesBefore = kind === 'before' ? Math.max(0, Math.min(525600, Math.round(Number(reminder.minutesBefore) || 0))) : null;
    const at = kind === 'exact' ? Number(reminder.at) || null : null;
    if (kind === 'exact' && !at) return null;
    const id = String(reminder.id || uid('reminder'));
    if (seen.has(id)) return null;
    seen.add(id);
    return { id, kind, minutesBefore, at, snoozedUntil: Number(reminder.snoozedUntil) || null, dismissedAt: Number(reminder.dismissedAt) || null, lastTriggeredAt: Number(reminder.lastTriggeredAt) || null };
  }).filter(Boolean);
}

function formatDay(key, options) {
  return key ? new Intl.DateTimeFormat(undefined, options).format(parseDate(key)) : 'Inbox';
}

function formatTimestamp(timestamp) {
  return timestamp ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp)) : '—';
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function normalizeClientTask(task) {
  const createdAt = Number(task.createdAt) || Date.now();
  const done = task.status === 'completed' || Boolean(task.done);
  return {
    ...task,
    id: String(task.id || uid()),
    title: String(task.title || '').trim(),
    description: String(task.description || ''),
    status: done ? 'completed' : 'open',
    done,
    priority: ['high', 'normal', 'low'].includes(task.priority) ? task.priority : 'normal',
    archived: Boolean(task.archived),
    deletedAt: Number(task.deletedAt) || null,
    date: validDateKey(task.date) ? task.date : null,
    dueTime: /^([01]\d|2[0-3]):[0-5]\d$/.test(task.dueTime || '') ? task.dueTime : null,
    estimatedMinutes: Number(task.estimatedMinutes) || null,
    projectId: task.projectId || null,
    subtasks: Array.isArray(task.subtasks) ? task.subtasks : [],
    recurrence: ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'custom'].includes(task.recurrence) ? task.recurrence : 'none',
    recurrenceRule: normalizedRecurrenceRule(task),
    reminders: normalizeClientReminders(task),
    reminderAt: null,
    createdAt,
    completedAt: Number(task.completedAt) || null,
    updatedAt: Number(task.updatedAt) || Number(task.completedAt) || createdAt,
    order: Number.isFinite(Number(task.order)) ? Number(task.order) : createdAt,
    occurrenceKey: task.occurrenceKey || null,
    seriesId: task.seriesId || null,
    weeklyTargetId: task.weeklyTargetId || null,
    timeTargetId: task.timeTargetId || null,
    actualSeconds: Math.max(0, Math.round(Number(task.actualSeconds) || 0)),
    focusNotes: String(task.focusNotes || '').slice(0, 4000),
    focusSessions: Array.isArray(task.focusSessions) ? task.focusSessions.slice(-200).map((session) => ({
      id: String(session.id || uid('session')),
      startedAt: Number(session.startedAt) || createdAt,
      endedAt: Number(session.endedAt) || null,
      durationSeconds: Math.max(0, Math.round(Number(session.durationSeconds) || 0)),
      completed: Boolean(session.completed)
    })) : [],
    activeSession: task.activeSession && typeof task.activeSession === 'object' ? {
      id: String(task.activeSession.id || uid('session')),
      startedAt: Number(task.activeSession.startedAt) || Date.now(),
      accumulatedSeconds: Math.max(0, Number(task.activeSession.accumulatedSeconds) || 0),
      lastResumedAt: Number(task.activeSession.lastResumedAt) || null,
      running: Boolean(task.activeSession.running)
    } : null
  };
}

function touch(task) {
  task.updatedAt = Date.now();
}

function activeTasks() {
  return tasks.filter((task) => !task.archived);
}

function prepareTasks(items) {
  const normalized = items.map(normalizeClientTask);
  if (normalized.some((task) => task.order < -1000000000)) {
    normalized
      .sort((a, b) => a.createdAt - b.createdAt)
      .forEach((task, index) => { task.order = index; });
  }
  return normalized;
}

function projectById(id) {
  return projects.find((project) => project.id === id && !project.archived);
}

function sortedTasks(items) {
  return [...items].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}

function nextTaskOrder() {
  return tasks.length ? Math.max(...tasks.map((task) => task.order)) + 1 : 0;
}

function viewBaseTasks() {
  const today = localDateKey(new Date());
  const live = activeTasks();
  if (activeView === 'inbox') return live.filter((task) => !task.date && !task.done);
  if (activeView === 'today') return live.filter((task) => task.date === today);
  if (activeView === 'date') return live.filter((task) => task.date === selectedDate);
  if (activeView === 'upcoming') return live.filter((task) => !task.done && task.date && task.date > today);
  if (activeView === 'overdue') return live.filter((task) => !task.done && task.date && task.date < today);
  if (activeView === 'completed') return live.filter((task) => task.done);
  if (activeView.startsWith('project:')) return live.filter((task) => task.projectId === activeView.slice(8));
  return [];
}

function visibleTasks() {
  let items = viewBaseTasks();
  if (activeFilter === 'active') items = items.filter((task) => !task.done);
  if (activeFilter === 'done') items = items.filter((task) => task.done);
  if (searchQuery) {
    items = items.filter((task) => [task.title, task.description, ...task.subtasks.map((subtask) => subtask.title)]
      .join(' ').toLocaleLowerCase().includes(searchQuery));
  }
  return sortedTasks(items);
}

function weekBounds(key = selectedDate) {
  const date = parseDate(key);
  const mondayOffset = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(date.getDate() - mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: localDateKey(start), end: localDateKey(end) };
}

function weeklyTargetProgress(target, date = selectedDate) {
  const { start, end } = weekBounds(date);
  return new Set(activeTasks().filter((task) => task.done && task.weeklyTargetId === target.id && task.date >= start && task.date <= end).map((task) => task.date)).size;
}

function targetTaskForDay(targetId, date = selectedDate) {
  return activeTasks().find((task) => task.weeklyTargetId === targetId && task.date === date);
}

function showToast(message, action = null) {
  clearTimeout(toastTimer);
  toastText.textContent = message;
  undoAction = action;
  toastUndo.classList.toggle('hidden', !action);
  toast.classList.add('show');
  toastTimer = setTimeout(() => { toast.classList.remove('show'); undoAction = null; }, action ? 6000 : 1900);
}

function inferredVoiceLanguage() {
  const browserLanguage = navigator.language || 'en-US';
  if (browserLanguage.toLowerCase().startsWith('hi')) return 'hi-IN';
  if (browserLanguage.toLowerCase() === 'en-in') return 'en-IN';
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone === 'Asia/Kolkata' || zone === 'Asia/Calcutta') return 'en-IN';
  } catch {}
  return browserLanguage;
}

function selectedVoiceLanguage() {
  return voiceLanguage.value === 'auto' ? inferredVoiceLanguage() : voiceLanguage.value;
}

function voiceLanguageName(language = selectedVoiceLanguage()) {
  const names = { 'en-IN': 'English / Hinglish', 'hi-IN': 'Hindi', 'en-US': 'English (US)', 'en-GB': 'English (UK)' };
  return names[language] || language;
}

function setVoiceStatus(message, state = 'idle') {
  voiceStatus.lastChild.textContent = message;
  voiceStatus.dataset.state = state;
}

function cleanTranscript(value) {
  return String(value || '').replace(/\s+/g, ' ').replace(/\s+([,.;!?])/g, '$1').trim();
}

function updateVoiceDraft() {
  const spoken = cleanTranscript([voiceFinalTranscript, voiceInterimTranscript].filter(Boolean).join(' '));
  if (!spoken) return;
  voiceHadResult = true;
  taskInput.value = `${voiceSeed}${voiceSeed ? ' ' : ''}${spoken}`.slice(0, taskInput.maxLength);
  taskInput.dispatchEvent(new Event('input', { bubbles: true }));
  setVoiceStatus(`Hearing: ${spoken}`, 'listening');
}

function clearVoiceTimers() {
  clearTimeout(voiceTimeoutTimer);
  clearTimeout(voiceFinishTimer);
  voiceTimeoutTimer = null;
  voiceFinishTimer = null;
}

function setVoiceListening(listening) {
  voiceListening = listening;
  voiceButton.classList.toggle('listening', listening);
  voiceButton.setAttribute('aria-pressed', String(listening));
  voiceButton.setAttribute('aria-label', listening ? 'Stop listening' : 'Add task with your voice');
  voiceButton.title = listening ? 'Listening… click to stop' : 'Speak a task';
  taskForm.classList.toggle('voice-listening', listening);
  if (listening) setVoiceStatus(`Listening in ${voiceLanguageName()}…`, 'listening');
  voiceLanguage.disabled = listening;
}

function speechErrorMessage(error) {
  if (error === 'not-allowed' || error === 'service-not-allowed') return 'Microphone blocked — allow microphone access and try again';
  if (error === 'audio-capture') return 'No microphone was found';
  if (error === 'network') return 'Voice recognition needs an internet connection';
  if (error === 'no-speech') return 'I didn’t hear anything — try again';
  if (error === 'language') return 'Windows speech recognition language is not installed';
  if (error === 'busy') return 'The microphone is already in use';
  return 'Voice recognition could not start';
}

function stopVoiceInput(silent = false) {
  silenceVoiceEnd = silent;
  voiceStopRequested = true;
  clearVoiceTimers();
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

  voiceSeed = taskInput.value.trim();
  voiceHadResult = false;
  silenceVoiceEnd = false;
  voiceStopRequested = false;
  voiceFinalTranscript = '';
  voiceInterimTranscript = '';
  clearVoiceTimers();
  const language = selectedVoiceLanguage();

  if (typeof window.tasknest.recognizeVoice === 'function') {
    nativeVoiceActive = true;
    nativeVoiceCancelled = false;
    setVoiceListening(true);
    const result = await window.tasknest.recognizeVoice(language);
    const cancelled = nativeVoiceCancelled;
    nativeVoiceActive = false;
    setVoiceListening(false);
    voiceLanguage.disabled = false;
    taskInput.focus();
    if (cancelled) {
      if (!silenceVoiceEnd) showToast('Listening stopped');
      return;
    }
    if (!result?.ok) return showToast(speechErrorMessage(result?.error));
    const spoken = cleanTranscript(result.text);
    if (!spoken) return showToast('I didn’t hear anything — try again');
    voiceHadResult = true;
    taskInput.value = `${voiceSeed}${voiceSeed ? ' ' : ''}${spoken}`.slice(0, taskInput.maxLength);
    taskInput.dispatchEvent(new Event('input', { bubbles: true }));
    const confidence = Number(result.confidence);
    setVoiceStatus(Number.isFinite(confidence) ? `Captured · ${Math.round(confidence * 100)}% confidence` : 'Captured — review before adding', 'captured');
    showToast('Voice captured — review it, then press Add');
    return;
  }

  const SpeechRecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionApi) {
    taskInput.focus();
    showToast('Voice recognition is unavailable here — press Win + H for Windows voice typing');
    return;
  }

  voiceSeed = taskInput.value.trim();
  voiceHadResult = false;
  silenceVoiceEnd = false;
  voiceRecognition = new SpeechRecognitionApi();
  voiceRecognition.lang = language;
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;
  voiceRecognition.maxAlternatives = 3;
  voiceRecognition.onstart = () => {
    setVoiceListening(true);
    voiceTimeoutTimer = setTimeout(() => stopVoiceInput(), 15000);
  };
  voiceRecognition.onresult = (event) => {
    const finals = [];
    const interim = [];
    for (const result of Array.from(event.results)) {
      const alternatives = Array.from(result);
      const best = alternatives.reduce((winner, option) => Number(option.confidence || 0) > Number(winner?.confidence || 0) ? option : winner, alternatives[0]);
      const transcript = cleanTranscript(best?.transcript);
      if (!transcript) continue;
      (result.isFinal ? finals : interim).push(transcript);
    }
    voiceFinalTranscript = cleanTranscript(finals.join(' '));
    voiceInterimTranscript = cleanTranscript(interim.join(' '));
    updateVoiceDraft();
    if (voiceFinalTranscript) {
      clearTimeout(voiceFinishTimer);
      voiceFinishTimer = setTimeout(() => stopVoiceInput(), 1800);
    }
  };
  voiceRecognition.onerror = (event) => {
    if (event.error === 'aborted') return;
    silenceVoiceEnd = true;
    voiceStopRequested = true;
    clearVoiceTimers();
    showToast(speechErrorMessage(event.error));
    setVoiceStatus(speechErrorMessage(event.error), 'error');
  };
  voiceRecognition.onend = () => {
    clearVoiceTimers();
    setVoiceListening(false);
    voiceLanguage.disabled = false;
    voiceRecognition = null;
    taskInput.focus();
    if (!silenceVoiceEnd) {
      setVoiceStatus(voiceHadResult ? 'Captured — review before adding' : 'No speech captured — try closer to the mic', voiceHadResult ? 'captured' : 'idle');
      showToast(voiceHadResult ? 'Voice captured — review it, then press Add' : 'I didn’t hear anything — try again');
    }
  };

  try {
    voiceRecognition.start();
  } catch {
    voiceRecognition = null;
    setVoiceListening(false);
    showToast('Voice recognition is already starting');
  }
}

async function persist(message, action = null) {
  await window.tasknest.saveTasks(tasks);
  if (message) showToast(message, action);
}

async function persistWeeklyTargets(message, action = null) {
  await window.tasknest.saveWeeklyTargets(weeklyTargets);
  if (message) showToast(message, action);
}

async function persistProjects(message, action = null) {
  await window.tasknest.saveProjects(projects);
  if (message) showToast(message, action);
}

function newTask(title, overrides = {}) {
  const now = Date.now();
  return normalizeClientTask({
    id: uid(), title, description: '', status: 'open', done: false, priority: 'normal', archived: false,
    date: selectedDate, dueTime: null, estimatedMinutes: null, projectId: null, subtasks: [], recurrence: 'none',
    recurrenceRule: normalizedRecurrenceRule({ recurrence: 'none' }, selectedDate), reminders: [], reminderAt: null,
    createdAt: now, completedAt: null, updatedAt: now, order: nextTaskOrder(), occurrenceKey: null,
    seriesId: null, weeklyTargetId: null, timeTargetId: null, actualSeconds: 0, focusNotes: '', focusSessions: [], activeSession: null, ...overrides
  });
}

function startOfWeek(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = copy.getDay() || 7;
  copy.setDate(copy.getDate() - weekday + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function nextOccurrenceDate(task) {
  if (!task.date || task.recurrence === 'none') return null;
  const rule = normalizedRecurrenceRule(task);
  const date = parseDate(task.date);
  const frequency = task.recurrence === 'daily' ? 'day' : task.recurrence === 'weekly' || task.recurrence === 'weekdays' ? 'week' : task.recurrence === 'monthly' ? 'month' : rule.frequency;
  const interval = task.recurrence === 'custom' ? rule.interval : 1;
  if (frequency === 'day') date.setDate(date.getDate() + interval);
  if (frequency === 'month') {
    const preferredDay = rule.anchorDay || date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + interval);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(preferredDay, lastDay));
  }
  if (frequency === 'week') {
    const selectedDays = rule.weekdays.length ? rule.weekdays : task.recurrence === 'weekdays' ? [1, 2, 3, 4, 5] : [date.getDay()];
    const anchorWeek = startOfWeek(parseDate(rule.anchorDate || task.date));
    let attempts = 0;
    do {
      date.setDate(date.getDate() + 1);
      const weeksFromAnchor = Math.floor((startOfWeek(date) - anchorWeek) / 604800000);
      if (weeksFromAnchor >= 0 && weeksFromAnchor % interval === 0 && selectedDays.includes(date.getDay())) break;
      attempts += 1;
    } while (attempts < 3700);
  }
  return localDateKey(date);
}

function shiftExactReminder(timestamp, fromDate, toDate) {
  const original = new Date(timestamp);
  const target = parseDate(toDate);
  target.setHours(original.getHours(), original.getMinutes(), original.getSeconds(), 0);
  if (localDateKey(original) !== fromDate) {
    const dayOffset = Math.round((parseDate(localDateKey(original)) - parseDate(fromDate)) / 86400000);
    target.setDate(target.getDate() + dayOffset);
  }
  return target.getTime();
}

function createNextOccurrence(task) {
  const nextDate = nextOccurrenceDate(task);
  if (!nextDate) return null;
  const seriesId = task.seriesId || task.id;
  task.seriesId = seriesId;
  const occurrenceKey = `${seriesId}:${nextDate}`;
  if (tasks.some((item) => item.id !== task.id && (item.occurrenceKey === occurrenceKey || (item.seriesId === seriesId && item.date === nextDate)))) return null;
  const nextDueTime = task.dueTime ? nearestAvailableTime(nextDate, task.dueTime) : null;
  const next = newTask(task.title, {
    ...task,
    id: uid(), date: nextDate, dueTime: nextDueTime, status: 'open', done: false, archived: false, deletedAt: null,
    completedAt: null, createdAt: Date.now(), updatedAt: Date.now(), order: nextTaskOrder(), seriesId, occurrenceKey,
    subtasks: task.subtasks.map((subtask) => ({ ...subtask, id: uid('subtask'), done: false, completedAt: null, createdAt: Date.now() })),
    reminders: task.reminders.map((reminder) => ({ ...reminder, id: uid('reminder'), at: reminder.kind === 'exact' ? shiftExactReminder(reminder.at, task.date, nextDate) : null, snoozedUntil: null, dismissedAt: null, lastTriggeredAt: null })),
    reminderAt: null,
    timeTargetId: null, actualSeconds: 0, focusNotes: '', focusSessions: [], activeSession: null
  });
  tasks.push(next);
  touch(task);
  return next;
}

function rescheduleTask(task, nextDate) {
  const previousDate = task.date;
  const conflict = timedTaskConflict(nextDate, task.dueTime, task.id);
  if (conflict) return conflict;
  if (previousDate && nextDate && previousDate !== nextDate) {
    task.reminders = task.reminders.map((reminder) => ({
      ...reminder,
      at: reminder.kind === 'exact' ? shiftExactReminder(reminder.at, previousDate, nextDate) : null,
      snoozedUntil: null,
      dismissedAt: null,
      lastTriggeredAt: null
    }));
  }
  task.date = nextDate;
  touch(task);
  return null;
}

function setTaskCompletion(task, done) {
  if (done && task.activeSession) commitFocusSession(task, true);
  task.done = done;
  task.status = done ? 'completed' : 'open';
  task.completedAt = done ? Date.now() : null;
  touch(task);
  return done ? createNextOccurrence(task) : null;
}

function setView(view) {
  activeView = view;
  if (view === 'today') selectedDate = localDateKey(new Date());
  activeFilter = view === 'completed' ? 'done' : 'all';
  selectionMode = false;
  selectedTaskIds.clear();
  render();
}

function chooseDate(key) {
  if (!validDateKey(key)) return;
  selectedDate = key;
  activeView = key === localDateKey(new Date()) ? 'today' : 'date';
  activeFilter = 'all';
  selectionMode = false;
  selectedTaskIds.clear();
  render();
}

function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === filter));
}

function headerContent() {
  const today = localDateKey(new Date());
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  if (activeView === 'inbox') return ['INBOX', 'Capture first. Plan later.', 'Tasks without a due date stay safely in your inbox.'];
  if (activeView === 'today') return [formatDay(today, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), greeting, 'Here’s what needs your attention today.'];
  if (activeView === 'date') return [formatDay(selectedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), formatDay(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' }), 'Your saved plan and record for this day.'];
  if (activeView === 'upcoming') return ['UPCOMING', 'What’s ahead.', 'All open tasks scheduled after today.'];
  if (activeView === 'overdue') return ['OVERDUE', 'Needs a decision.', 'Complete these tasks or reschedule them to a realistic date.'];
  if (activeView === 'completed') return ['COMPLETED', 'Your finished work.', 'A searchable record of everything you have completed.'];
  if (activeView.startsWith('project:')) {
    const project = projectById(activeView.slice(8));
    return ['PROJECT', project?.name || 'Unknown project', 'Every open and completed task in this project.'];
  }
  return ['TASKS', 'Your tasks.', 'Everything in one dependable place.'];
}

function taskDateLabel(task) {
  if (!task.date) return 'Inbox';
  const today = localDateKey(new Date());
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  if (task.date === today) return 'Today';
  if (task.date === localDateKey(tomorrow)) return 'Tomorrow';
  return formatDay(task.date, { month: 'short', day: 'numeric' });
}

function recurrenceLabel(value, rule = null) {
  if (value === 'none') return '';
  if (value === 'daily') return 'Daily';
  if (value === 'weekly') return 'Weekly';
  if (value === 'monthly') return 'Monthly';
  if (value === 'weekdays') {
    const days = (rule?.weekdays?.length ? rule.weekdays : [1, 2, 3, 4, 5]).map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]);
    return days.join(', ');
  }
  if (value === 'custom') {
    const interval = rule?.interval || 1;
    const unit = rule?.frequency || 'day';
    const base = `Every ${interval === 1 ? '' : `${interval} `}${unit}${interval === 1 ? '' : 's'}`;
    if (unit === 'week' && rule?.weekdays?.length) return `${base} · ${rule.weekdays.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ')}`;
    return base;
  }
  return '';
}

function taskDeadline(task) {
  if (!task.date) return null;
  const date = parseDate(task.date);
  const [hour, minute] = (task.dueTime || '09:00').split(':').map(Number);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

function minutesFromTime(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value || '')) return null;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function timedTaskConflict(date, time, excludeId = null) {
  const minutes = minutesFromTime(time);
  if (!date || minutes === null) return null;
  return activeTasks().find((task) => task.id !== excludeId && !task.done && task.date === date && task.dueTime && Math.abs(minutesFromTime(task.dueTime) - minutes) < 120) || null;
}

function nearestAvailableTime(date, preferredTime, excludeId = null) {
  const preferred = minutesFromTime(preferredTime);
  if (preferred === null) return null;
  for (let offset = 0; offset <= 1440; offset += 30) {
    const candidates = offset ? [preferred + offset, preferred - offset] : [preferred];
    for (const candidate of candidates) {
      if (candidate < 0 || candidate >= 1440) continue;
      const value = `${String(Math.floor(candidate / 60)).padStart(2, '0')}:${String(candidate % 60).padStart(2, '0')}`;
      if (!timedTaskConflict(date, value, excludeId)) return value;
    }
  }
  return null;
}

function effectiveReminderAt(task, reminder) {
  if (reminder.snoozedUntil) return reminder.snoozedUntil;
  if (reminder.kind === 'exact') return reminder.at;
  const deadline = taskDeadline(task);
  return deadline ? deadline - reminder.minutesBefore * 60000 : null;
}

function formatReminderLabel(task, reminder) {
  if (reminder.snoozedUntil) return `Snoozed until ${formatTimestamp(reminder.snoozedUntil)}`;
  if (reminder.kind === 'exact') return formatTimestamp(reminder.at);
  if (reminder.minutesBefore === 0) return 'At deadline';
  if (reminder.minutesBefore < 60) return `${reminder.minutesBefore} minutes before`;
  if (reminder.minutesBefore % 1440 === 0) return `${reminder.minutesBefore / 1440} day${reminder.minutesBefore === 1440 ? '' : 's'} before`;
  if (reminder.minutesBefore % 60 === 0) return `${reminder.minutesBefore / 60} hour${reminder.minutesBefore === 60 ? '' : 's'} before`;
  return formatTimestamp(effectiveReminderAt(task, reminder));
}

function taskMetaHtml(task) {
  const pieces = [];
  pieces.push(`<span><span class="priority-dot ${task.priority}"></span>${task.priority === 'high' ? 'Important' : task.priority === 'low' ? 'Whenever' : 'Normal'}</span>`);
  pieces.push(`<span>${escapeHtml(taskDateLabel(task))}${task.dueTime ? ` · ${escapeHtml(task.dueTime)}` : ''}</span>`);
  if (task.estimatedMinutes) pieces.push(`<span>${task.estimatedMinutes >= 60 ? `${task.estimatedMinutes / 60}h` : `${task.estimatedMinutes}m`}</span>`);
  const project = projectById(task.projectId);
  if (project) pieces.push(`<span class="project-meta" data-project-color="${escapeHtml(project.color)}">${escapeHtml(project.name)}</span>`);
  if (task.recurrence !== 'none') pieces.push(`<span>↻ ${escapeHtml(recurrenceLabel(task.recurrence, task.recurrenceRule))}</span>`);
  if (task.reminders.length) pieces.push(`<span>◷ ${task.reminders.length} reminder${task.reminders.length === 1 ? '' : 's'}</span>`);
  if (task.subtasks.length) pieces.push(`<span>${task.subtasks.filter((item) => item.done).length}/${task.subtasks.length} steps</span>`);
  if (task.weeklyTargetId) pieces.push('<span>Weekly target</span>');
  if (task.timeTargetId) pieces.push('<span>Time block</span>');
  if (task.actualSeconds) pieces.push(`<span>${formatCompactDuration(task.actualSeconds)} focused</span>`);
  if (task.activeSession) pieces.push(`<span class="focus-live-meta">${task.activeSession.running ? '● In focus' : 'Paused focus'}</span>`);
  return pieces.join('');
}

function formatCompactDuration(seconds) {
  const rawSeconds = Math.max(0, Number(seconds) || 0);
  if (rawSeconds < 60) return `${Math.round(rawSeconds)}s`;
  const roundedMinutes = Math.max(1, Math.round(rawSeconds / 60));
  if (roundedMinutes < 60) return `${roundedMinutes}m`;
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatClock(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = String(Math.floor(value / 3600)).padStart(2, '0');
  const minutes = String(Math.floor(value % 3600 / 60)).padStart(2, '0');
  const secs = String(value % 60).padStart(2, '0');
  return `${hours}:${minutes}:${secs}`;
}

function priorityRank(task) {
  return { high: 0, normal: 1, low: 2 }[task.priority] ?? 1;
}

function todayPriorityTasks() {
  const today = localDateKey(new Date());
  return activeTasks().filter((task) => task.date === today && !task.done)
    .sort((a, b) => priorityRank(a) - priorityRank(b) || String(a.dueTime || '99:99').localeCompare(String(b.dueTime || '99:99')) || a.order - b.order)
    .slice(0, 3);
}

function sessionElapsed(task) {
  const session = task?.activeSession;
  if (!session) return 0;
  const liveSeconds = session.running && session.lastResumedAt ? (Date.now() - session.lastResumedAt) / 1000 : 0;
  return Math.max(0, Number(session.accumulatedSeconds || 0) + liveSeconds);
}

function commitFocusSession(task, completed = false) {
  if (!task?.activeSession) return 0;
  const session = task.activeSession;
  const durationSeconds = Math.max(1, Math.round(sessionElapsed(task)));
  task.actualSeconds = Math.max(0, Number(task.actualSeconds) || 0) + durationSeconds;
  task.focusSessions.push({ id: session.id, startedAt: session.startedAt, endedAt: Date.now(), durationSeconds, completed });
  task.focusSessions = task.focusSessions.slice(-200);
  task.activeSession = null;
  touch(task);
  return durationSeconds;
}

function renderTodayCommand() {
  const isToday = activeView === 'today';
  todayCommand.classList.toggle('hidden', !isToday);
  if (!isToday) return;
  const today = localDateKey(new Date());
  const todayTasks = activeTasks().filter((task) => task.date === today);
  const openToday = todayTasks.filter((task) => !task.done);
  const overdue = activeTasks().filter((task) => !task.done && task.date && task.date < today)
    .sort((a, b) => a.date.localeCompare(b.date) || priorityRank(a) - priorityRank(b) || a.order - b.order);
  const estimatedMinutes = openToday.reduce((sum, task) => sum + (task.estimatedMinutes || 0), 0);
  const unestimated = openToday.filter((task) => !task.estimatedMinutes).length;
  const completed = todayTasks.filter((task) => task.done).length;
  const percentage = todayTasks.length ? Math.round(completed / todayTasks.length * 100) : 0;
  const priorities = todayPriorityTasks();

  $('todayWorkload').textContent = estimatedMinutes ? formatCompactDuration(estimatedMinutes * 60) : '0m';
  $('todayWorkloadNote').textContent = unestimated ? `${unestimated} without estimate` : estimatedMinutes ? 'fully estimated' : 'No estimates yet';
  $('todayRemaining').textContent = openToday.length;
  $('todayOverdueCount').textContent = overdue.length;
  $('todayProgress').textContent = `${percentage}%`;
  $('todayProgressNote').textContent = percentage === 100 ? 'Day complete' : completed ? `${completed} finished` : 'Start with one win';
  $('topPriorityCount').textContent = `${priorities.length} selected`;

  $('topPriorityList').innerHTML = priorities.length ? priorities.map((task, index) => `
    <article class="priority-row" data-task-id="${escapeHtml(task.id)}">
      <span class="priority-number">${index + 1}</span>
      <button class="priority-copy" data-today-action="edit" type="button"><strong>${escapeHtml(task.title)}</strong><small><span class="priority-dot ${task.priority}"></span>${task.dueTime ? escapeHtml(task.dueTime) : 'Any time'}${task.estimatedMinutes ? ` · ${formatCompactDuration(task.estimatedMinutes * 60)}` : ''}</small></button>
      <button class="priority-start ${task.activeSession?.running ? 'active' : ''}" data-today-action="focus" type="button" aria-label="${task.activeSession?.running ? 'Resume' : 'Focus on'} ${escapeHtml(task.title)}" title="${task.activeSession?.running ? 'Resume focus' : 'Start focus'}">${task.activeSession?.running ? 'Resume' : 'Focus'}</button>
    </article>`).join('') : '<div class="lane-empty"><strong>You are clear.</strong><span>Add a task to build today’s priority queue.</span></div>';

  $('todayOverdueList').innerHTML = overdue.length ? overdue.slice(0, 2).map((task) => `
    <article class="overdue-mini" data-task-id="${escapeHtml(task.id)}"><div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(taskDateLabel(task))} · ${task.priority === 'high' ? 'Important' : 'Needs a decision'}</span></div><button data-today-action="recover" type="button">Recover</button></article>`).join('') : '<div class="lane-empty"><strong>Nothing overdue.</strong><span>Your plan is up to date.</span></div>';
}

function renderFocusClock(task) {
  if (!task || !task.activeSession) return;
  const elapsed = sessionElapsed(task);
  const total = Number(task.actualSeconds || 0) + elapsed;
  $('focusTimer').textContent = formatClock(elapsed);
  $('focusTimerState').textContent = task.activeSession.running ? 'Session running' : 'Session paused';
  $('focusActual').textContent = total ? formatCompactDuration(total) : '0m';
  $('focusPause').textContent = task.activeSession.running ? 'Pause' : 'Resume';
  const estimateSeconds = Number(task.estimatedMinutes || 0) * 60;
  const progress = estimateSeconds ? Math.min(100, Math.round(elapsed / estimateSeconds * 100)) : Math.min(100, Math.round(elapsed / 1500 * 100));
  $('focusOrbit').style.setProperty('--focus-progress', `${progress * 3.6}deg`);
}

function renderFocusDialog(task) {
  if (!task) return;
  $('focusTaskTitle').textContent = task.title;
  const project = projectById(task.projectId);
  $('focusTaskMeta').textContent = [project?.name, task.dueTime ? `Due ${task.dueTime}` : null, task.priority === 'high' ? 'Important' : null].filter(Boolean).join(' · ') || 'Stay with one thing.';
  $('focusEstimate').textContent = task.estimatedMinutes ? formatCompactDuration(task.estimatedMinutes * 60) : 'Not set';
  const completedSubtasks = task.subtasks.filter((subtask) => subtask.done).length;
  $('focusSubtaskProgress').textContent = `${completedSubtasks} of ${task.subtasks.length}`;
  $('focusSubtasks').innerHTML = task.subtasks.length ? task.subtasks.map((subtask) => `<label class="focus-subtask ${subtask.done ? 'done' : ''}" data-subtask-id="${escapeHtml(subtask.id)}"><input type="checkbox" ${subtask.done ? 'checked' : ''}><span>${escapeHtml(subtask.title)}</span></label>`).join('') : '<button class="focus-empty-steps" data-focus-action="add-subtasks" type="button"><strong>No subtasks yet</strong><span>Break this task into smaller steps →</span></button>';
  if (document.activeElement !== $('focusNotes')) $('focusNotes').value = task.focusNotes || '';
  renderFocusClock(task);
}

function startFocus(task) {
  if (!task || task.done) return;
  const now = Date.now();
  for (const other of activeTasks().filter((item) => item.id !== task.id && item.activeSession?.running)) {
    other.activeSession.accumulatedSeconds = sessionElapsed(other);
    other.activeSession.lastResumedAt = null;
    other.activeSession.running = false;
    touch(other);
  }
  if (!task.activeSession) task.activeSession = { id: uid('session'), startedAt: now, accumulatedSeconds: 0, lastResumedAt: now, running: true };
  else if (!task.activeSession.running) { task.activeSession.running = true; task.activeSession.lastResumedAt = now; }
  touch(task);
  focusTaskId = task.id;
  persist('Focus session started');
  render();
  renderFocusDialog(task);
  if (!focusDialog.open) focusDialog.showModal();
  clearInterval(focusTimerInterval);
  focusTimerInterval = setInterval(() => renderFocusClock(tasks.find((item) => item.id === focusTaskId)), 1000);
}

function toggleFocusPause() {
  const task = tasks.find((item) => item.id === focusTaskId);
  if (!task?.activeSession) return;
  if (task.activeSession.running) {
    task.activeSession.accumulatedSeconds = sessionElapsed(task);
    task.activeSession.lastResumedAt = null;
    task.activeSession.running = false;
  } else {
    task.activeSession.running = true;
    task.activeSession.lastResumedAt = Date.now();
  }
  touch(task);
  persist(task.activeSession.running ? 'Focus resumed' : 'Focus paused');
  renderFocusClock(task);
  renderTodayCommand();
}

function finishFocusSession(completeTask = false) {
  const task = tasks.find((item) => item.id === focusTaskId);
  if (!task?.activeSession) return;
  const duration = commitFocusSession(task, completeTask);
  if (completeTask) setTaskCompletion(task, true);
  persist(completeTask ? `Task completed · ${formatCompactDuration(duration)} focused` : `Session saved · ${formatCompactDuration(duration)}`);
  focusDialog.close();
  render();
}

function openRecovery(task) {
  if (!task || task.done) return;
  recoveryTaskId = task.id;
  $('recoveryTaskTitle').textContent = task.title;
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  $('recoveryDate').value = localDateKey(tomorrow);
  $('recoveryPriority').value = task.priority;
  recoveryDialog.showModal();
}

function completeRecovery(task, message) {
  touch(task);
  recoveryDialog.close();
  persist(message);
  render();
}

function renderTaskList() {
  const visible = visibleTasks();
  const today = localDateKey(new Date());
  taskList.classList.toggle('selection-mode', selectionMode);
  taskList.innerHTML = visible.map((task) => {
    const missed = !task.done && task.date && task.date < today;
    return `
    <article class="task-item ${task.done ? 'done' : ''} ${selectedTaskIds.has(task.id) ? 'selected' : ''}" data-id="${escapeHtml(task.id)}" draggable="${selectionMode ? 'false' : 'true'}">
      <label class="bulk-check-wrap" aria-label="Select ${escapeHtml(task.title)}"><input class="bulk-check" data-select-id="${escapeHtml(task.id)}" type="checkbox" ${selectedTaskIds.has(task.id) ? 'checked' : ''}><span></span></label>
      <button class="task-check" data-action="toggle" aria-label="${task.done ? 'Mark as open' : 'Mark as complete'}">${icon.check}</button>
      <div class="task-copy" data-action="edit">
        <span class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</span>
        ${task.description ? `<span class="task-description">${escapeHtml(task.description)}</span>` : ''}
        <span class="task-meta">${taskMetaHtml(task)}</span>
      </div>
      ${task.done ? '<span class="task-action-spacer"></span>' : `<button class="task-action phase-task-action ${task.activeSession?.running ? 'active' : ''}" data-action="${missed ? 'recover' : 'focus'}" aria-label="${missed ? 'Recover missed task' : 'Start focus mode'}" title="${missed ? 'Recover' : 'Focus'}">${missed ? icon.recover : icon.play}</button>`}
      <button class="task-action duplicate-task" data-action="duplicate" aria-label="Duplicate task" title="Duplicate">${icon.copy}</button>
      <button class="task-action edit-task" data-action="edit" aria-label="Edit task" title="Edit">${icon.edit}</button>
      <button class="task-action delete-task" data-action="delete" aria-label="Delete task" title="Delete">${icon.trash}</button>
      <span class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">${icon.drag}</span>
    </article>`;
  }).join('');
  taskList.querySelectorAll('[data-project-color]').forEach((element) => { element.style.setProperty('--project-color', element.dataset.projectColor); });
  emptyState.classList.toggle('hidden', visible.length > 0);
  taskList.classList.toggle('hidden', visible.length === 0);
  const heading = emptyState.querySelector('h3');
  const copy = emptyState.querySelector('p');
  if (searchQuery) { heading.textContent = 'No matching tasks'; copy.textContent = 'Try a different search phrase.'; }
  else if (activeView === 'overdue') { heading.textContent = 'Nothing overdue'; copy.textContent = 'You are clear—keep it that way.'; }
  else if (activeView === 'completed') { heading.textContent = 'No completed tasks'; copy.textContent = 'Finished work will collect here.'; }
  else if (activeView === 'inbox') { heading.textContent = 'Inbox cleared'; copy.textContent = 'Unscheduled tasks will appear here.'; }
  else { heading.textContent = 'No tasks here'; copy.textContent = 'Add one small thing or choose another view.'; }
}

function renderHeaderAndProgress() {
  const [eyebrow, title, subtitle] = headerContent();
  $('selectedDayLabel').textContent = eyebrow;
  $('greetingTitle').textContent = title;
  $('listTitle').textContent = subtitle;
  const base = viewBaseTasks();
  const completed = base.filter((task) => task.done).length;
  const percentage = base.length ? Math.round(completed / base.length * 100) : 0;
  const remaining = base.filter((task) => !task.done).length;
  $('progressValue').textContent = `${percentage}%`;
  $('progressCount').textContent = `${completed} of ${base.length} completed`;
  $('progressBar').style.width = `${percentage}%`;
  $('focusBar').style.width = `${percentage}%`;
  $('focusMessage').textContent = base.length === 0 ? 'This view is clear.' : percentage === 100 ? 'Everything here is complete.' : `${remaining} ${remaining === 1 ? 'task' : 'tasks'} still open.`;
  $('remainingLabel').textContent = remaining ? `${remaining} open` : base.length ? 'Everything complete' : 'Nothing pending';
  clearButton.textContent = activeFilter === 'active' ? 'Show all tasks' : 'Hide completed';
  clearButton.disabled = activeView === 'completed' || (activeFilter !== 'active' && completed === 0);
  taskInput.placeholder = activeView === 'inbox' ? 'Add to inbox...' : activeView.startsWith('project:') ? `Add to ${projectById(activeView.slice(8))?.name || 'project'}...` : 'Add a task...';
}

function renderCalendar() {
  const selected = parseDate(selectedDate);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const taskDates = new Set(activeTasks().filter((task) => task.date).map((task) => task.date));
  $('calendarMonth').textContent = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(selected);
  const cells = Array.from({ length: firstWeekday }, () => '<span class="calendar-spacer"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = localDateKey(new Date(year, month, day));
    cells.push(`<button class="calendar-day ${key === selectedDate ? 'selected' : ''} ${taskDates.has(key) ? 'has-tasks' : ''}" data-date="${key}" type="button" aria-label="${formatDay(key, { month: 'long', day: 'numeric' })}">${day}</button>`);
  }
  calendarGrid.innerHTML = cells.join('');
  datePicker.value = selectedDate;
  $('todayButton').classList.toggle('hidden', selectedDate === localDateKey(new Date()));
}

function renderHistory() {
  const groups = new Map();
  for (const task of activeTasks().filter((item) => item.date)) {
    if (!groups.has(task.date)) groups.set(task.date, []);
    groups.get(task.date).push(task);
  }
  const keys = [...groups.keys()].sort().reverse().slice(0, 6);
  $('historyList').innerHTML = keys.length ? keys.map((key) => {
    const group = groups.get(key);
    const done = group.filter((task) => task.done).length;
    return `<button class="history-day ${key === selectedDate && ['today', 'date'].includes(activeView) ? 'selected' : ''}" data-date="${key}"><span><strong>${formatDay(key, { month: 'short', day: 'numeric' })}</strong><small>${formatDay(key, { weekday: 'short' })}</small></span><span class="history-score">${done}/${group.length}</span></button>`;
  }).join('') : '<p class="history-empty">Your dated tasks will appear here.</p>';
}

function renderNav() {
  const today = localDateKey(new Date());
  const live = activeTasks();
  $('inboxCount').textContent = live.filter((task) => !task.date && !task.done).length;
  $('todayCount').textContent = live.filter((task) => task.date === today && !task.done).length;
  $('upcomingCount').textContent = live.filter((task) => task.date > today && !task.done).length;
  $('overdueCount').textContent = live.filter((task) => task.date && task.date < today && !task.done).length;
  $('completedCount').textContent = live.filter((task) => task.done).length;
  $('projectsCount').textContent = projects.filter((project) => !project.archived).length;
  document.querySelectorAll('[data-view]').forEach((button) => {
    const view = button.dataset.view;
    button.classList.toggle('active', activeView === view || (view === 'projects' && activeView.startsWith('project:')));
  });
  setFilter(activeFilter);
}

function renderWidgetCard() {
  $('widgetCardTitle').textContent = widgetEnabled ? 'Today’s desktop widget is active' : 'Put today’s tasks on your desktop';
  $('widgetCardText').textContent = widgetEnabled ? 'It stays synced and opens again with Windows.' : 'Mark tasks done without opening the full planner.';
  $('widgetCardAction').textContent = widgetEnabled ? 'Remove widget' : 'Add widget';
  $('desktopWidgetButton').classList.toggle('active', widgetEnabled);
}

function upcomingReminders() {
  const now = Date.now();
  return activeTasks().filter((task) => !task.done).flatMap((task) => task.reminders
    .filter((reminder) => !reminder.dismissedAt && effectiveReminderAt(task, reminder))
    .map((reminder) => ({ task, reminder, at: effectiveReminderAt(task, reminder) })))
    .filter((entry) => entry.at >= now)
    .sort((a, b) => a.at - b.at);
}

function renderReminderCard() {
  const upcoming = upcomingReminders();
  $('reminderCardCount').textContent = upcoming.length ? `${upcoming.length} scheduled` : 'None scheduled';
  $('reminderPreviewList').innerHTML = upcoming.length ? upcoming.slice(0, 3).map(({ task, at }) => `<button type="button" data-reminder-task="${escapeHtml(task.id)}"><span>${escapeHtml(task.title)}</span><small>${escapeHtml(formatTimestamp(at))}</small></button>`).join('') : '<p>No upcoming reminders.</p>';
  const permissionButton = $('notificationPermissionButton');
  const desktop = !document.documentElement.classList.contains('web-runtime');
  if (desktop) {
    permissionButton.textContent = 'Desktop alerts on';
    permissionButton.disabled = true;
  } else if (!('Notification' in window)) {
    permissionButton.textContent = 'Unavailable';
    permissionButton.disabled = true;
  } else {
    permissionButton.disabled = Notification.permission === 'denied';
    permissionButton.textContent = Notification.permission === 'granted' ? 'Browser alerts on' : Notification.permission === 'denied' ? 'Blocked in browser' : 'Enable alerts';
  }
}

function formatClockTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
}

async function saveTimeTarget(message = null) {
  const settings = await window.tasknest.saveSettings({ timeTarget });
  timeTarget = settings.timeTarget || null;
  if (message) showToast(message);
  renderTimeTarget();
}

function renderTimeTarget() {
  const active = Boolean(timeTarget);
  $('timeTargetSetup').classList.toggle('hidden', active);
  $('timeTargetLive').classList.toggle('hidden', !active);
  $('clearTimeTarget').classList.toggle('hidden', !active);
  $('resetTimeTarget').classList.toggle('hidden', !active);
  $('timeTargetWidgetButton').classList.toggle('hidden', !active);
  if (!active) {
    $('timeTargetTitle').textContent = 'Set a focused window';
    $('timeTargetTaskList').innerHTML = '';
    $('timeTargetTaskList').dataset.signature = '';
    $('timeTargetTaskProgress').textContent = '0 / 0 done';
    return;
  }
  const now = Date.now();
  const remainingSeconds = Math.max(0, Math.ceil((timeTarget.endsAt - now) / 1000));
  const elapsedSeconds = Math.max(0, timeTarget.durationSeconds - remainingSeconds);
  const progress = Math.min(100, Math.round(elapsedSeconds / Math.max(1, timeTarget.durationSeconds) * 100));
  $('timeTargetTitle').textContent = timeTarget.label || 'Focused window';
  $('timeTargetRemaining').textContent = remainingSeconds ? formatClock(remainingSeconds) : 'Complete';
  $('timeTargetEnds').textContent = remainingSeconds ? `Ends at ${formatClockTime(timeTarget.endsAt)}` : `Finished at ${formatClockTime(timeTarget.endsAt)}`;
  $('timeTargetBar').style.width = `${progress}%`;
  renderTimeTargetTasks();
  if (!remainingSeconds && !timeTarget.notifiedAt) {
    timeTarget.notifiedAt = now;
    saveTimeTarget('Time target complete');
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification('Time target complete', { body: `${timeTarget.label || 'Focused window'} is finished.`, icon: 'assets/tasknest-icon.svg' });
  }
}

function renderTimeTargetTasks() {
  if (!timeTarget) return;
  const blockTasks = sortedTasks(activeTasks().filter((task) => task.timeTargetId === timeTarget.id));
  const completed = blockTasks.filter((task) => task.done).length;
  $('timeTargetTaskProgress').textContent = `${completed} / ${blockTasks.length} done`;
  const list = $('timeTargetTaskList');
  const signature = blockTasks.map((task) => `${task.id}:${task.done ? 1 : 0}:${task.title}`).join('|');
  if (list.dataset.signature === signature) return;
  list.dataset.signature = signature;
  list.innerHTML = blockTasks.length ? blockTasks.map((task) => `
    <div class="time-target-task ${task.done ? 'done' : ''}" data-task-id="${escapeHtml(task.id)}">
      <button class="time-target-check" data-time-target-action="toggle" type="button" aria-label="${task.done ? 'Reopen' : 'Complete'} ${escapeHtml(task.title)}"><span>✓</span></button>
      <button class="time-target-task-title" data-time-target-action="edit" type="button">${escapeHtml(task.title)}</button>
    </div>`).join('') : '<p class="time-target-task-empty">Add what you want to finish inside this block.</p>';
}

function startTimeTarget(endsAt, label) {
  const now = Date.now();
  if (!Number.isFinite(endsAt) || endsAt <= now) return showToast('Choose a time later than now');
  timeTarget = { id: uid('time-target'), label, startedAt: now, endsAt, durationSeconds: Math.max(60, Math.round((endsAt - now) / 1000)), notifiedAt: null };
  saveTimeTarget(`${label} started`);
}

function resetTimeTargetClock() {
  if (!timeTarget) return;
  const now = Date.now();
  const durationSeconds = Math.max(60, Math.round(Number(timeTarget.durationSeconds) || 60));
  timeTarget = { ...timeTarget, startedAt: now, endsAt: now + durationSeconds * 1000, durationSeconds, notifiedAt: null };
  saveTimeTarget('Time target restarted');
}

async function showBrowserNotification(task, reminder, at) {
  if (!document.documentElement.classList.contains('web-runtime') || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  const options = { body: task.description || `${task.dueTime ? `Due ${task.dueTime}` : 'TaskNest reminder'}`, tag: `tasknest-${task.id}-${reminder.id}-${at}`, data: { taskId: task.id }, icon: 'assets/tasknest-icon.svg' };
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready.catch(() => null);
    if (registration) return registration.showNotification(task.title, options);
  }
  new Notification(task.title, options);
}

function presentReminder(task, reminder, at) {
  if (!task || !reminder || task.done || task.archived || reminder.dismissedAt) return;
  const key = `${task.id}:${reminder.id}:${at}`;
  if (shownReminderKeys.has(key) || reminder.lastTriggeredAt === at) return;
  shownReminderKeys.add(key);
  reminder.lastTriggeredAt = at;
  activeReminder = { taskId: task.id, reminderId: reminder.id };
  $('reminderAlertTitle').textContent = task.title;
  $('reminderAlertMeta').textContent = task.dueTime ? `Due ${taskDateLabel(task)} at ${task.dueTime}` : task.date ? `Scheduled for ${taskDateLabel(task)}` : 'Open TaskNest to review it.';
  $('reminderAlert').classList.add('show');
  touch(task);
  persist();
  renderReminderCard();
  showBrowserNotification(task, reminder, at);
}

function checkClientReminders() {
  const now = Date.now();
  for (const task of activeTasks().filter((item) => !item.done)) {
    for (const reminder of task.reminders) {
      const at = effectiveReminderAt(task, reminder);
      if (!reminder.dismissedAt && at && at <= now && at > now - 86400000) presentReminder(task, reminder, at);
    }
  }
}

function closeReminderAlert() {
  $('reminderAlert').classList.remove('show');
  activeReminder = null;
}

function renderWeeklyTargets() {
  const activeTargets = weeklyTargets.filter((target) => !target.archived);
  const totalGoal = activeTargets.reduce((sum, target) => sum + target.target, 0);
  const totalDone = activeTargets.reduce((sum, target) => sum + Math.min(target.target, weeklyTargetProgress(target)), 0);
  const percentage = totalGoal ? Math.round(totalDone / totalGoal * 100) : 0;
  const completedTargets = activeTargets.filter((target) => weeklyTargetProgress(target) >= target.target).length;
  const selectedDayName = formatDay(selectedDate, { weekday: 'short', month: 'short', day: 'numeric' });
  const { start, end } = weekBounds();
  $('weeklyTargetsBadge').textContent = activeTargets.length ? `${completedTargets}/${activeTargets.length}` : 'New';
  $('weeklySummaryCount').textContent = `${totalDone} / ${totalGoal}`;
  $('weeklySummaryBar').style.width = `${percentage}%`;
  $('weeklyPagePercent').textContent = `${percentage}%`;
  $('weeklySummaryCopy').textContent = activeTargets.length ? `${completedTargets} of ${activeTargets.length} targets reached · ${totalGoal - totalDone} check-ins left` : 'Set a weekly target and turn it into daily action.';
  $('weeklyRangeLabel').textContent = `${formatDay(start, { month: 'short', day: 'numeric' })} – ${formatDay(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  $('weeklyEmpty').classList.toggle('hidden', activeTargets.length > 0);
  weeklyTargetList.innerHTML = activeTargets.map((target) => {
    const completed = Math.min(weeklyTargetProgress(target), target.target);
    const linkedTask = targetTaskForDay(target.id);
    return `<article class="weekly-target-row" data-target-id="${escapeHtml(target.id)}"><div class="weekly-target-main"><div class="weekly-target-titleline"><strong>${escapeHtml(target.title)}</strong><span>${completed} / ${target.target} days</span></div><div class="weekly-target-meter" data-progress="${Math.round(completed / target.target * 100)}"><span></span></div></div><button class="weekly-plan-button ${linkedTask ? 'linked' : ''}" data-weekly-action="plan" type="button" ${linkedTask ? 'disabled' : ''}>${linkedTask ? `Added to ${selectedDayName}` : `Add to ${selectedDayName}`}</button><button class="weekly-delete-button" data-weekly-action="delete" type="button" aria-label="Delete ${escapeHtml(target.title)} target" title="Delete target">×</button></article>`;
  }).join('');
  weeklyTargetList.querySelectorAll('[data-progress]').forEach((meter) => { meter.firstElementChild.style.width = `${meter.dataset.progress}%`; });
}

function renderProjects() {
  const activeProjects = projects.filter((project) => !project.archived);
  const openTotal = activeTasks().filter((task) => task.projectId && !task.done).length;
  $('projectTaskTotal').textContent = openTotal;
  $('projectEmpty').classList.toggle('hidden', activeProjects.length > 0);
  projectGrid.innerHTML = activeProjects.map((project) => {
    const projectTasks = activeTasks().filter((task) => task.projectId === project.id);
    const open = projectTasks.filter((task) => !task.done).length;
    const done = projectTasks.filter((task) => task.done).length;
    const percent = projectTasks.length ? Math.round(done / projectTasks.length * 100) : 0;
    return `<article class="project-card" data-project-id="${escapeHtml(project.id)}"><button class="project-open" data-project-action="open" type="button"><span class="project-color" data-color="${escapeHtml(project.color)}"></span><span class="project-card-copy"><strong>${escapeHtml(project.name)}</strong><small>${open} open · ${done} complete</small></span><span class="project-percent">${percent}%</span></button><button class="project-delete" data-project-action="delete" type="button" aria-label="Delete ${escapeHtml(project.name)}">×</button></article>`;
  }).join('');
  projectGrid.querySelectorAll('[data-color]').forEach((dot) => { dot.style.background = dot.dataset.color; });
  const options = activeProjects.map((project) => `<option value="${escapeHtml(project.id)}">${escapeHtml(project.name)}</option>`).join('');
  $('editProject').innerHTML = `<option value="">No project</option>${options}`;
}

function renderBulkBar() {
  bulkBar.classList.toggle('hidden', !selectionMode);
  $('bulkToggle').textContent = selectionMode ? 'Done selecting' : 'Select';
  $('bulkCount').textContent = `${selectedTaskIds.size} selected`;
  bulkBar.querySelectorAll('button:not(.bulk-cancel)').forEach((button) => { button.disabled = selectedTaskIds.size === 0; });
}

function renderSpecialUtility() {
  if (activeView === 'weekly') {
    const activeTargets = weeklyTargets.filter((target) => !target.archived);
    const totalGoal = activeTargets.reduce((sum, target) => sum + target.target, 0);
    const totalDone = activeTargets.reduce((sum, target) => sum + Math.min(target.target, weeklyTargetProgress(target)), 0);
    const percentage = totalGoal ? Math.round(totalDone / totalGoal * 100) : 0;
    $('progressValue').textContent = `${percentage}%`;
    $('focusBar').style.width = `${percentage}%`;
    $('focusMessage').textContent = totalGoal ? `${totalGoal - totalDone} weekly check-ins remaining.` : 'Create your first weekly target.';
  }
  if (activeView === 'projects') {
    const projectTasks = activeTasks().filter((task) => task.projectId);
    const completed = projectTasks.filter((task) => task.done).length;
    const percentage = projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0;
    $('progressValue').textContent = `${percentage}%`;
    $('focusBar').style.width = `${percentage}%`;
    $('focusMessage').textContent = projectTasks.length ? `${projectTasks.length - completed} project tasks still open.` : 'Create a project to group related work.';
  }
}

function render() {
  const special = ['weekly', 'projects'].includes(activeView);
  $('taskView').classList.toggle('hidden', special);
  $('taskView').classList.toggle('today-mode', activeView === 'today');
  $('weeklyPage').classList.toggle('hidden', activeView !== 'weekly');
  $('projectsPage').classList.toggle('hidden', activeView !== 'projects');
  if (!special) { renderHeaderAndProgress(); renderTaskList(); }
  renderTodayCommand();
  renderNav();
  renderHistory();
  renderCalendar();
  renderWeeklyTargets();
  renderProjects();
  if (special) renderSpecialUtility();
  renderWidgetCard();
  renderTimeTarget();
  renderReminderCard();
  renderBulkBar();
  $('taskListHeading').textContent = activeView === 'today' ? 'All today’s tasks' : activeView === 'overdue' ? 'Missed tasks' : 'Tasks';
}

function defaultQuickTaskOverrides() {
  if (activeView === 'inbox') return { date: null };
  if (activeView === 'upcoming') { const date = new Date(); date.setDate(date.getDate() + 1); return { date: localDateKey(date) }; }
  if (activeView.startsWith('project:')) return { date: selectedDate, projectId: activeView.slice(8) };
  return { date: selectedDate };
}

function addQuickTask(title, priority = 'normal') {
  const cleanTitle = title.trim();
  if (!cleanTitle) return taskInput.focus();
  const task = newTask(cleanTitle, { ...defaultQuickTaskOverrides(), priority });
  tasks.push(task);
  persist(task.date ? `Saved for ${formatDay(task.date, { month: 'short', day: 'numeric' })}` : 'Saved to Inbox');
  activeFilter = 'all';
  render();
}

function toDatetimeLocal(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function editorTaskDraft() {
  return {
    date: $('editDate').value || null,
    dueTime: $('editTime').value || null,
    reminders: editingReminders
  };
}

function editorRecurrenceRule() {
  const recurrence = $('editRecurrence').value;
  const existing = tasks.find((task) => task.id === editingTaskId)?.recurrenceRule || {};
  const date = $('editDate').value || null;
  const frequency = recurrence === 'custom' ? $('editRecurrenceUnit').value : recurrence === 'weekly' || recurrence === 'weekdays' ? 'week' : recurrence === 'monthly' ? 'month' : 'day';
  return {
    frequency,
    interval: recurrence === 'custom' ? Math.max(1, Math.min(99, Number($('editRecurrenceInterval').value) || 1)) : 1,
    weekdays: recurrence === 'weekdays' || (recurrence === 'custom' && frequency === 'week') ? [...editingWeekdays].sort() : [],
    anchorDay: date ? parseDate(date).getDate() : existing.anchorDay || null,
    anchorDate: validDateKey(existing.anchorDate) && editingTaskId ? existing.anchorDate : date
  };
}

function renderScheduleEditor() {
  const recurrence = $('editRecurrence').value;
  const custom = recurrence === 'custom';
  const showWeekdays = recurrence === 'weekdays' || (custom && $('editRecurrenceUnit').value === 'week');
  $('recurrenceIntervalField').classList.toggle('hidden', !custom);
  $('weekdayPicker').classList.toggle('hidden', !showWeekdays);
  if (showWeekdays && !editingWeekdays.length) editingWeekdays = recurrence === 'weekdays' ? [1, 2, 3, 4, 5] : [$('editDate').value ? parseDate($('editDate').value).getDay() : new Date().getDay()];
  document.querySelectorAll('[data-weekday]').forEach((button) => button.classList.toggle('selected', editingWeekdays.includes(Number(button.dataset.weekday))));
  $('recurrenceSummary').textContent = recurrence === 'none' ? 'One-time task' : recurrenceLabel(recurrence, editorRecurrenceRule());
}

function renderReminderEditor() {
  const draft = editorTaskDraft();
  $('reminderSummary').textContent = editingReminders.length ? `${editingReminders.length} active` : 'No reminders';
  $('reminderHelp').textContent = draft.date && draft.dueTime ? 'Deadline reminders follow the task when it repeats or is rescheduled.' : 'Set a due date and time to use deadline reminders.';
  $('reminderEditList').innerHTML = editingReminders.length ? editingReminders
    .sort((a, b) => (effectiveReminderAt(draft, a) || Infinity) - (effectiveReminderAt(draft, b) || Infinity))
    .map((reminder) => `<div class="reminder-edit-row" data-reminder-id="${escapeHtml(reminder.id)}"><span><strong>${escapeHtml(formatReminderLabel(draft, reminder))}</strong><small>${reminder.kind === 'before' ? 'Moves with deadline' : 'Exact date and time'}</small></span><button data-reminder-action="remove" type="button" aria-label="Remove reminder">×</button></div>`).join('') : '<p class="reminder-empty">Add one or more alerts so this task does not slip.</p>';
}

function renderSubtaskEditor() {
  const done = editingSubtasks.filter((item) => item.done).length;
  $('subtaskProgress').textContent = `${done} of ${editingSubtasks.length}`;
  $('subtaskEditList').innerHTML = editingSubtasks.map((subtask) => `<div class="subtask-edit-row" data-subtask-id="${escapeHtml(subtask.id)}"><input data-subtask-action="toggle" type="checkbox" ${subtask.done ? 'checked' : ''} aria-label="Complete ${escapeHtml(subtask.title)}"><span class="${subtask.done ? 'done' : ''}">${escapeHtml(subtask.title)}</span><button data-subtask-action="remove" type="button" aria-label="Remove subtask">×</button></div>`).join('');
}

function openEditor(task = null) {
  editingTaskId = task?.id || null;
  editingSubtasks = (task?.subtasks || []).map((subtask) => ({ ...subtask }));
  editingReminders = normalizeClientReminders(task || {}).map((reminder) => ({ ...reminder }));
  const rule = normalizedRecurrenceRule(task || { recurrence: 'none' }, task?.date || selectedDate);
  editingWeekdays = [...rule.weekdays];
  $('editEyebrow').textContent = task ? 'TASK DETAILS' : 'NEW TASK';
  $('editHeading').textContent = task ? 'Edit task' : 'Create a complete task';
  $('editTitle').value = task?.title || '';
  $('editDescription').value = task?.description || '';
  $('editStatus').value = task?.status || 'open';
  $('editPriority').value = task?.priority || 'normal';
  $('editProject').value = task?.projectId || (activeView.startsWith('project:') ? activeView.slice(8) : '');
  $('editDate').value = task?.date || (activeView === 'inbox' ? '' : selectedDate);
  $('editTime').value = task?.dueTime || '';
  $('editEstimate').value = task?.estimatedMinutes || '';
  $('editRecurrence').value = task?.recurrence || 'none';
  $('editRecurrenceInterval').value = rule.interval;
  $('editRecurrenceUnit').value = rule.frequency;
  $('reminderPreset').value = '15';
  $('customReminderAt').value = '';
  $('customReminderAt').classList.add('hidden');
  $('timestampRow').innerHTML = task ? `<span>Created ${formatTimestamp(task.createdAt)}</span>${task.completedAt ? `<span>Completed ${formatTimestamp(task.completedAt)}</span>` : '<span>Not completed</span>'}` : '<span>Created when you save</span>';
  renderSubtaskEditor();
  renderScheduleEditor();
  renderReminderEditor();
  editDialog.showModal();
  setTimeout(() => $('editTitle').focus(), 40);
}

function duplicateTask(task) {
  const duplicate = newTask(`${task.title} copy`, {
    ...task, id: uid(), title: `${task.title} copy`, status: 'open', done: false, archived: false, deletedAt: null,
    completedAt: null, createdAt: Date.now(), updatedAt: Date.now(), order: nextTaskOrder(), seriesId: null, occurrenceKey: null, reminderAt: null, timeTargetId: null,
    reminders: task.reminders.map((reminder) => ({ ...reminder, id: uid('reminder'), snoozedUntil: null, dismissedAt: null, lastTriggeredAt: null })),
    actualSeconds: 0, focusNotes: '', focusSessions: [], activeSession: null,
    subtasks: task.subtasks.map((subtask) => ({ ...subtask, id: uid('subtask'), done: false, completedAt: null, createdAt: Date.now() }))
  });
  tasks.push(duplicate);
  persist('Task duplicated');
  render();
}

function softDeleteTasks(taskIds, message = 'Task deleted') {
  const snapshots = tasks.filter((task) => taskIds.has(task.id)).map((task) => ({ id: task.id, archived: task.archived, deletedAt: task.deletedAt, updatedAt: task.updatedAt }));
  const now = Date.now();
  for (const task of tasks.filter((item) => taskIds.has(item.id))) { task.archived = true; task.deletedAt = now; touch(task); }
  persist(message, async () => {
    for (const snapshot of snapshots) {
      const task = tasks.find((item) => item.id === snapshot.id);
      if (task) { task.archived = snapshot.archived; task.deletedAt = snapshot.deletedAt; touch(task); }
    }
    await persist(snapshots.length > 1 ? 'Tasks restored' : 'Task restored');
    render();
  });
  selectedTaskIds.clear();
  render();
}

taskForm.addEventListener('submit', (event) => { event.preventDefault(); stopVoiceInput(true); addQuickTask(taskInput.value, priorityInput.value); taskInput.value = ''; });
voiceButton.addEventListener('click', toggleVoiceInput);
voiceLanguage.addEventListener('change', () => {
  localStorage.setItem(VOICE_LANGUAGE_KEY, voiceLanguage.value);
  setVoiceStatus(`Ready for ${voiceLanguageName()}`, 'idle');
});
$('newTaskButton').addEventListener('click', () => openEditor());
$('editRecurrence').addEventListener('change', renderScheduleEditor);
$('editRecurrenceInterval').addEventListener('input', renderScheduleEditor);
$('editRecurrenceUnit').addEventListener('change', renderScheduleEditor);
$('editDate').addEventListener('change', () => { renderScheduleEditor(); renderReminderEditor(); });
$('editTime').addEventListener('change', renderReminderEditor);
$('weekdayPicker').addEventListener('click', (event) => {
  const button = event.target.closest('[data-weekday]');
  if (!button) return;
  const day = Number(button.dataset.weekday);
  editingWeekdays = editingWeekdays.includes(day) ? editingWeekdays.filter((value) => value !== day) : [...editingWeekdays, day];
  renderScheduleEditor();
});
$('reminderPreset').addEventListener('change', () => $('customReminderAt').classList.toggle('hidden', $('reminderPreset').value !== 'custom'));
$('addReminderButton').addEventListener('click', () => {
  if (editingReminders.length >= 10) return showToast('A task can have up to 10 reminders');
  const preset = $('reminderPreset').value;
  let reminder;
  if (preset === 'custom') {
    const at = new Date($('customReminderAt').value).getTime();
    if (!at) return showToast('Choose an exact reminder date and time');
    reminder = { id: uid('reminder'), kind: 'exact', at, minutesBefore: null, snoozedUntil: null, dismissedAt: null, lastTriggeredAt: null };
  } else {
    if (!$('editDate').value || !$('editTime').value) return showToast('Set a due date and time first');
    reminder = { id: uid('reminder'), kind: 'before', minutesBefore: Number(preset), at: null, snoozedUntil: null, dismissedAt: null, lastTriggeredAt: null };
  }
  const duplicate = editingReminders.some((item) => item.kind === reminder.kind && (item.kind === 'before' ? item.minutesBefore === reminder.minutesBefore : item.at === reminder.at));
  if (duplicate) return showToast('That reminder is already added');
  editingReminders.push(reminder);
  $('customReminderAt').value = '';
  renderReminderEditor();
});
$('reminderEditList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-reminder-action="remove"]');
  if (!button) return;
  const row = button.closest('[data-reminder-id]');
  editingReminders = editingReminders.filter((reminder) => reminder.id !== row.dataset.reminderId);
  renderReminderEditor();
});

taskList.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const item = actionButton.closest('.task-item');
  const task = tasks.find((entry) => entry.id === item?.dataset.id);
  if (!task) return;
  if (actionButton.dataset.action === 'toggle') {
    const next = setTaskCompletion(task, !task.done);
    const target = weeklyTargets.find((entry) => entry.id === task.weeklyTargetId && !entry.archived);
    const targetReached = target && task.done && weeklyTargetProgress(target) >= target.target;
    persist(next ? `Completed · next ${recurrenceLabel(task.recurrence, task.recurrenceRule).toLowerCase()} task created` : targetReached ? `${target.title}: weekly target reached` : task.done ? 'Nicely done' : 'Task reopened');
    render();
  } else if (actionButton.dataset.action === 'edit') openEditor(task);
  else if (actionButton.dataset.action === 'focus') startFocus(task);
  else if (actionButton.dataset.action === 'recover') openRecovery(task);
  else if (actionButton.dataset.action === 'duplicate') duplicateTask(task);
  else if (actionButton.dataset.action === 'delete') softDeleteTasks(new Set([task.id]));
});

todayCommand.addEventListener('click', (event) => {
  const button = event.target.closest('[data-today-action]');
  if (!button) return;
  const action = button.dataset.todayAction;
  if (action === 'overdue') return setView('overdue');
  const row = button.closest('[data-task-id]');
  const task = tasks.find((item) => item.id === row?.dataset.taskId);
  if (!task) return;
  if (action === 'focus') startFocus(task);
  if (action === 'edit') openEditor(task);
  if (action === 'recover') openRecovery(task);
});

$('focusPause').addEventListener('click', toggleFocusPause);
$('focusEnd').addEventListener('click', () => finishFocusSession(false));
$('focusComplete').addEventListener('click', () => finishFocusSession(true));
$('focusClose').addEventListener('click', () => focusDialog.close());
focusDialog.addEventListener('close', () => {
  clearInterval(focusTimerInterval);
  clearTimeout(focusNoteTimer);
  const task = tasks.find((item) => item.id === focusTaskId);
  if (task) persist();
  focusTimerInterval = null;
  focusTaskId = null;
});
$('focusSubtasks').addEventListener('change', (event) => {
  const checkbox = event.target.closest('input[type="checkbox"]');
  const row = checkbox?.closest('[data-subtask-id]');
  const task = tasks.find((item) => item.id === focusTaskId);
  const subtask = task?.subtasks.find((item) => item.id === row?.dataset.subtaskId);
  if (!subtask) return;
  subtask.done = checkbox.checked;
  subtask.completedAt = checkbox.checked ? Date.now() : null;
  touch(task);
  persist();
  renderFocusDialog(task);
  renderTodayCommand();
});
$('focusSubtasks').addEventListener('click', (event) => {
  if (!event.target.closest('[data-focus-action="add-subtasks"]')) return;
  const task = tasks.find((item) => item.id === focusTaskId);
  if (task?.activeSession?.running) {
    task.activeSession.accumulatedSeconds = sessionElapsed(task);
    task.activeSession.lastResumedAt = null;
    task.activeSession.running = false;
    touch(task);
  }
  focusDialog.close();
  openEditor(task);
  setTimeout(() => $('subtaskInput').focus(), 60);
});
$('focusNotes').addEventListener('input', () => {
  const task = tasks.find((item) => item.id === focusTaskId);
  if (!task) return;
  task.focusNotes = $('focusNotes').value.slice(0, 4000);
  touch(task);
  $('focusNotesStatus').textContent = 'Saving…';
  clearTimeout(focusNoteTimer);
  focusNoteTimer = setTimeout(async () => { await persist(); $('focusNotesStatus').textContent = 'Saved with this task'; }, 500);
});

$('recoveryClose').addEventListener('click', () => recoveryDialog.close());
recoveryDialog.addEventListener('close', () => { recoveryTaskId = null; });
recoveryDialog.addEventListener('click', (event) => {
  const button = event.target.closest('[data-recovery-action]');
  if (!button) return;
  const task = tasks.find((item) => item.id === recoveryTaskId);
  if (!task) return recoveryDialog.close();
  const action = button.dataset.recoveryAction;
  if (action === 'tomorrow') {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const conflict = rescheduleTask(task, localDateKey(tomorrow));
    if (conflict) return showToast(`Cannot move · ${conflict.title} is at ${conflict.dueTime}`);
    return completeRecovery(task, 'Moved to tomorrow');
  }
  if (action === 'date') {
    const date = $('recoveryDate').value;
    if (!validDateKey(date)) return showToast('Choose a valid date');
    const conflict = rescheduleTask(task, date);
    if (conflict) return showToast(`Cannot move · ${conflict.title} is at ${conflict.dueTime}`);
    return completeRecovery(task, `Moved to ${formatDay(date, { month: 'short', day: 'numeric' })}`);
  }
  if (action === 'priority') {
    task.priority = $('recoveryPriority').value;
    return completeRecovery(task, 'Priority updated');
  }
  if (action === 'backlog') {
    task.date = null; task.dueTime = null; task.reminders = []; task.reminderAt = null;
    return completeRecovery(task, 'Moved to Inbox backlog');
  }
  if (action === 'subtasks') {
    recoveryDialog.close();
    openEditor(task);
    return setTimeout(() => $('subtaskInput').focus(), 60);
  }
  if (action === 'delete') {
    recoveryDialog.close();
    softDeleteTasks(new Set([task.id]));
  }
});

taskList.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-select-id]');
  if (!checkbox) return;
  checkbox.checked ? selectedTaskIds.add(checkbox.dataset.selectId) : selectedTaskIds.delete(checkbox.dataset.selectId);
  renderTaskList(); renderBulkBar();
});

taskList.addEventListener('dragstart', (event) => { const item = event.target.closest('.task-item'); if (item) { draggedTaskId = item.dataset.id; item.classList.add('dragging'); } });
taskList.addEventListener('dragend', () => { draggedTaskId = null; taskList.querySelectorAll('.dragging,.drag-over').forEach((item) => item.classList.remove('dragging', 'drag-over')); });
taskList.addEventListener('dragover', (event) => { event.preventDefault(); const item = event.target.closest('.task-item'); taskList.querySelectorAll('.drag-over').forEach((row) => row.classList.remove('drag-over')); if (item && item.dataset.id !== draggedTaskId) item.classList.add('drag-over'); });
taskList.addEventListener('drop', (event) => {
  event.preventDefault();
  const targetRow = event.target.closest('.task-item');
  if (!targetRow || !draggedTaskId || targetRow.dataset.id === draggedTaskId) return;
  const ordered = sortedTasks(activeTasks());
  const sourceIndex = ordered.findIndex((task) => task.id === draggedTaskId);
  const targetIndex = ordered.findIndex((task) => task.id === targetRow.dataset.id);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const [moved] = ordered.splice(sourceIndex, 1);
  ordered.splice(targetIndex, 0, moved);
  ordered.forEach((task, index) => { task.order = index; touch(task); });
  persist('Tasks reordered'); render();
});

$('bulkToggle').addEventListener('click', () => { selectionMode = !selectionMode; selectedTaskIds.clear(); render(); });
bulkBar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-bulk-action]');
  if (!button) return;
  const action = button.dataset.bulkAction;
  if (action === 'cancel') { selectionMode = false; selectedTaskIds.clear(); return render(); }
  if (!selectedTaskIds.size) return;
  if (action === 'delete') return softDeleteTasks(selectedTaskIds, `${selectedTaskIds.size} tasks deleted`);
  if (action === 'complete') {
    let recurringCreated = 0;
    for (const task of tasks.filter((item) => selectedTaskIds.has(item.id) && !item.done)) if (setTaskCompletion(task, true)) recurringCreated += 1;
    persist(`${selectedTaskIds.size} tasks completed${recurringCreated ? ` · ${recurringCreated} recurring tasks created` : ''}`); selectedTaskIds.clear(); render();
  }
  if (action === 'move') {
    const date = $('bulkDate').value;
    if (!validDateKey(date)) return showToast('Choose a valid date first');
    let moved = 0;
    let conflicts = 0;
    for (const task of tasks.filter((item) => selectedTaskIds.has(item.id))) rescheduleTask(task, date) ? conflicts += 1 : moved += 1;
    persist(`${moved} moved${conflicts ? ` · ${conflicts} need a 2-hour gap` : ''}`); selectedTaskIds.clear(); render();
  }
});

editForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') return editDialog.close();
  const title = $('editTitle').value.trim();
  const date = $('editDate').value || null;
  const dueTime = date && $('editTime').value ? $('editTime').value : null;
  if (!title || (date && !validDateKey(date))) return;
  const conflict = timedTaskConflict(date, dueTime, editingTaskId);
  if (conflict) return showToast(`Keep 2 hours free · ${conflict.title} is at ${conflict.dueTime}`);
  if (editingReminders.some((reminder) => reminder.kind === 'before') && (!date || !$('editTime').value)) return showToast('Set a due date and time for deadline reminders');
  const needsWeekdays = $('editRecurrence').value === 'weekdays' || ($('editRecurrence').value === 'custom' && $('editRecurrenceUnit').value === 'week');
  if (date && needsWeekdays && !editingWeekdays.length) return showToast('Choose at least one weekday');
  let task = tasks.find((item) => item.id === editingTaskId);
  if (!task) { task = newTask(title); tasks.push(task); }
  const wasDone = task.done;
  task.title = title;
  task.description = $('editDescription').value.trim();
  task.priority = $('editPriority').value;
  task.projectId = $('editProject').value || null;
  const previousDate = task.date;
  if (previousDate && date && previousDate !== date) editingReminders = editingReminders.map((reminder) => ({ ...reminder, at: reminder.kind === 'exact' ? shiftExactReminder(reminder.at, previousDate, date) : null, snoozedUntil: null, dismissedAt: null, lastTriggeredAt: null }));
  task.date = date;
  task.dueTime = dueTime;
  task.estimatedMinutes = Number($('editEstimate').value) || null;
  task.recurrence = date ? $('editRecurrence').value : 'none';
  task.recurrenceRule = normalizedRecurrenceRule({ recurrence: task.recurrence, recurrenceRule: editorRecurrenceRule(), date }, date);
  task.reminders = editingReminders.map((reminder) => ({ ...reminder }));
  task.reminderAt = null;
  task.subtasks = editingSubtasks;
  const shouldBeDone = $('editStatus').value === 'completed';
  if (wasDone !== shouldBeDone) setTaskCompletion(task, shouldBeDone); else touch(task);
  editDialog.close();
  persist(date ? 'Task saved' : 'Task saved to Inbox');
  render();
});
editDialog.addEventListener('close', () => { editingTaskId = null; editingSubtasks = []; editingReminders = []; editingWeekdays = []; });

$('subtaskAdd').addEventListener('click', () => {
  const title = $('subtaskInput').value.trim();
  if (!title) return;
  editingSubtasks.push({ id: uid('subtask'), title, done: false, createdAt: Date.now(), completedAt: null });
  $('subtaskInput').value = '';
  renderSubtaskEditor();
});
$('subtaskInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); $('subtaskAdd').click(); } });
$('subtaskEditList').addEventListener('click', (event) => {
  const action = event.target.closest('[data-subtask-action]');
  if (!action) return;
  const row = action.closest('[data-subtask-id]');
  const index = editingSubtasks.findIndex((item) => item.id === row.dataset.subtaskId);
  if (index < 0) return;
  if (action.dataset.subtaskAction === 'remove') editingSubtasks.splice(index, 1);
  if (action.dataset.subtaskAction === 'toggle') { editingSubtasks[index].done = action.checked; editingSubtasks[index].completedAt = action.checked ? Date.now() : null; }
  renderSubtaskEditor();
});

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.view)));
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { setFilter(button.dataset.filter); render(); }));
searchInput.addEventListener('input', () => { searchQuery = searchInput.value.trim().toLocaleLowerCase(); render(); });
calendarGrid.addEventListener('click', (event) => { const day = event.target.closest('[data-date]'); if (day) chooseDate(day.dataset.date); });
$('historyList').addEventListener('click', (event) => { const day = event.target.closest('[data-date]'); if (day) chooseDate(day.dataset.date); });
datePicker.addEventListener('change', () => chooseDate(datePicker.value));
$('todayButton').addEventListener('click', () => chooseDate(localDateKey(new Date())));

function chooseAdjacentMonth(offset) {
  const date = parseDate(selectedDate);
  const preferredDay = date.getDate();
  date.setDate(1); date.setMonth(date.getMonth() + offset);
  date.setDate(Math.min(preferredDay, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  chooseDate(localDateKey(date));
}
$('previousDay').addEventListener('click', () => chooseAdjacentMonth(-1));
$('nextDay').addEventListener('click', () => chooseAdjacentMonth(1));
clearButton.addEventListener('click', () => { setFilter(activeFilter === 'active' ? 'all' : 'active'); render(); });

weeklyTargetForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = $('weeklyTargetTitle').value.trim();
  if (!title) return;
  weeklyTargets.push({ id: uid('target'), title, target: Number($('weeklyTargetCount').value), createdAt: Date.now(), archived: false });
  $('weeklyTargetTitle').value = '';
  await persistWeeklyTargets('Weekly target created'); render();
});
weeklyTargetList.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-weekly-action]');
  if (!action) return;
  const target = weeklyTargets.find((item) => item.id === action.closest('[data-target-id]').dataset.targetId);
  if (!target) return;
  if (action.dataset.weeklyAction === 'plan') {
    if (targetTaskForDay(target.id)) return;
    tasks.push(newTask(target.title, { date: selectedDate, weeklyTargetId: target.id }));
    await persist(`Added ${target.title} to ${formatDay(selectedDate, { weekday: 'short' })}`);
  } else {
    target.archived = true;
    await persistWeeklyTargets('Weekly target deleted', async () => { target.archived = false; await persistWeeklyTargets('Weekly target restored'); render(); });
  }
  render();
});
$('weeklySummaryButton').addEventListener('click', () => setView('weekly'));

projectForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = $('projectName').value.trim();
  if (!name) return;
  projects.push({ id: uid('project'), name, color: $('projectColor').value, archived: false, createdAt: Date.now(), updatedAt: Date.now() });
  $('projectName').value = '';
  await persistProjects('Project created'); render();
});
projectGrid.addEventListener('click', async (event) => {
  const action = event.target.closest('[data-project-action]');
  if (!action) return;
  const project = projects.find((item) => item.id === action.closest('[data-project-id]').dataset.projectId);
  if (!project) return;
  if (action.dataset.projectAction === 'open') return setView(`project:${project.id}`);
  project.archived = true; project.updatedAt = Date.now();
  await persistProjects('Project removed; its tasks are safe', async () => { project.archived = false; project.updatedAt = Date.now(); await persistProjects('Project restored'); render(); });
  render();
});

async function toggleWidget() {
  const settings = widgetEnabled ? await window.tasknest.removeWidget() : await window.tasknest.openWidget();
  widgetEnabled = settings.widgetEnabled; renderWidgetCard(); showToast(widgetEnabled ? 'Desktop widget added' : 'Desktop widget removed');
}
$('desktopWidgetButton').addEventListener('click', toggleWidget);
$('titleWidgetButton').addEventListener('click', async () => { if (!widgetEnabled) await toggleWidget(); else { await window.tasknest.openWidget(); showToast('Widget brought to front'); } });
$('timeTargetSetup').addEventListener('click', (event) => {
  const preset = event.target.closest('[data-target-hours]');
  if (!preset) return;
  const hours = Number(preset.dataset.targetHours);
  startTimeTarget(Date.now() + hours * 3600000, `${hours}-hour target`);
});
$('startUntilTarget').addEventListener('click', () => {
  const value = $('timeTargetUntil').value;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return showToast('Choose a valid finish time');
  const [hour, minute] = value.split(':').map(Number);
  const end = new Date();
  end.setHours(hour, minute, 0, 0);
  startTimeTarget(end.getTime(), `Until ${formatClockTime(end.getTime())}`);
});
$('clearTimeTarget').addEventListener('click', () => { timeTarget = null; saveTimeTarget('Time target cleared'); });
$('resetTimeTarget').addEventListener('click', resetTimeTargetClock);
$('timeTargetWidgetButton').addEventListener('click', async () => {
  await window.tasknest.saveSettings({ timeTarget, widgetView: 'timeTarget' });
  const settings = await window.tasknest.openWidget();
  widgetEnabled = settings.widgetEnabled;
  renderWidgetCard();
  showToast('Time target widget opened');
});
$('timeTargetTaskForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!timeTarget) return showToast('Start a time target first');
  const input = $('timeTargetTaskInput');
  const title = input.value.trim();
  if (!title) return input.focus();
  const task = newTask(title, { date: localDateKey(new Date()), timeTargetId: timeTarget.id });
  tasks.push(task);
  input.value = '';
  persist('Added to this time target');
  render();
  input.focus();
});
$('timeTargetTaskList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-time-target-action]');
  const row = button?.closest('[data-task-id]');
  const task = tasks.find((item) => item.id === row?.dataset.taskId);
  if (!task) return;
  if (button.dataset.timeTargetAction === 'edit') return openEditor(task);
  const next = setTaskCompletion(task, !task.done);
  persist(next ? 'Completed · next recurring task created' : task.done ? 'Block task completed' : 'Block task reopened');
  render();
});
$('notificationPermissionButton').addEventListener('click', async () => {
  if (!('Notification' in window)) return showToast('Browser notifications are unavailable here');
  const permission = await Notification.requestPermission();
  renderReminderCard();
  showToast(permission === 'granted' ? 'Browser alerts enabled' : 'Notifications were not enabled');
});
$('reminderPreviewList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-reminder-task]');
  const task = tasks.find((item) => item.id === button?.dataset.reminderTask);
  if (task) openEditor(task);
});
$('reminderAlertClose').addEventListener('click', () => {
  const task = tasks.find((item) => item.id === activeReminder?.taskId);
  const reminder = task?.reminders.find((item) => item.id === activeReminder?.reminderId);
  if (task && reminder) { reminder.dismissedAt = Date.now(); touch(task); persist('Reminder dismissed'); renderReminderCard(); }
  closeReminderAlert();
});
$('reminderSnoozeButton').addEventListener('click', () => {
  const task = tasks.find((item) => item.id === activeReminder?.taskId);
  const reminder = task?.reminders.find((item) => item.id === activeReminder?.reminderId);
  if (!task || !reminder) return closeReminderAlert();
  reminder.snoozedUntil = Date.now() + 10 * 60000;
  reminder.dismissedAt = null;
  touch(task);
  persist('Snoozed for 10 minutes');
  closeReminderAlert();
  renderReminderCard();
});
$('reminderDoneButton').addEventListener('click', () => {
  const task = tasks.find((item) => item.id === activeReminder?.taskId);
  if (!task) return closeReminderAlert();
  const next = setTaskCompletion(task, true);
  persist(next ? 'Completed · next occurrence created' : 'Task completed');
  closeReminderAlert();
  render();
});

toastUndo.addEventListener('click', () => { if (!undoAction) return; const action = undoAction; undoAction = null; clearTimeout(toastTimer); toast.classList.remove('show'); action(); });

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); taskInput.focus(); taskInput.select(); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') { event.preventDefault(); setView('today'); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); searchInput.focus(); searchInput.select(); }
  if (event.key === 'Escape' && selectionMode) { selectionMode = false; selectedTaskIds.clear(); render(); }
});

window.tasknest.onTasksChanged(async () => { tasks = prepareTasks(await window.tasknest.loadTasks()); render(); });
window.tasknest.onWeeklyTargetsChanged(async () => { weeklyTargets = await window.tasknest.loadWeeklyTargets(); render(); });
window.tasknest.onProjectsChanged(async () => { projects = await window.tasknest.loadProjects(); render(); });
window.tasknest.onReminderDue((payload) => {
  const task = tasks.find((item) => item.id === payload?.taskId);
  const reminder = task?.reminders.find((item) => item.id === payload?.reminderId);
  if (task && reminder) presentReminder(task, reminder, payload.dueAt || effectiveReminderAt(task, reminder));
});
window.tasknest.onWidgetSettings((settings) => { widgetEnabled = settings.widgetEnabled; renderWidgetCard(); });

async function init() {
  const savedVoiceLanguage = localStorage.getItem(VOICE_LANGUAGE_KEY);
  if ([...voiceLanguage.options].some((option) => option.value === savedVoiceLanguage)) voiceLanguage.value = savedVoiceLanguage;
  setVoiceStatus(`Ready for ${voiceLanguageName()}`, 'idle');
  const [savedTasks, savedTargets, savedProjects, settings] = await Promise.all([
    window.tasknest.loadTasks(), window.tasknest.loadWeeklyTargets(), window.tasknest.loadProjects(), window.tasknest.loadSettings()
  ]);
  tasks = prepareTasks(savedTasks);
  weeklyTargets = savedTargets;
  projects = savedProjects;
  widgetEnabled = settings.widgetEnabled;
  timeTarget = settings.timeTarget || null;
  $('bulkDate').value = selectedDate;
  render();
  if (document.documentElement.classList.contains('web-runtime') && 'serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
  clearInterval(reminderCheckTimer);
  reminderCheckTimer = setInterval(checkClientReminders, 15000);
  clearInterval(timeTargetTimer);
  timeTargetTimer = setInterval(renderTimeTarget, 1000);
  checkClientReminders();
  setTimeout(() => taskInput.focus(), 200);
}

init();
