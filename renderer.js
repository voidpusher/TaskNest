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
    loadWeeklyTargets: async () => read(keys.targets, []),
    saveWeeklyTargets: async (items) => write(keys.targets, items),
    loadProjects: async () => read(keys.projects, []),
    saveProjects: async (items) => write(keys.projects, items),
    openWidget: async () => { const settings = { ...read(keys.settings, {}), widgetEnabled: true }; write(keys.settings, settings); return settings; },
    removeWidget: async () => { const settings = { ...read(keys.settings, {}), widgetEnabled: false }; write(keys.settings, settings); return settings; },
    onTasksChanged: () => {},
    onWeeklyTargetsChanged: () => {},
    onProjectsChanged: () => {},
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

let tasks = [];
let weeklyTargets = [];
let projects = [];
let selectedDate = localDateKey(new Date());
let activeView = 'today';
let activeFilter = 'all';
let searchQuery = '';
let widgetEnabled = false;
let editingTaskId = null;
let editingSubtasks = [];
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

const VOICE_LANGUAGE_KEY = 'tasknest-voice-language';

const icon = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4 4-.8L18 8.4 14.6 5 4 16ZM13.5 6.1l3.4 3.4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>',
  drag: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="1"/><circle cx="15" cy="7" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="17" r="1"/><circle cx="15" cy="17" r="1"/></svg>'
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
    recurrence: ['none', 'daily', 'weekdays', 'weekly', 'monthly'].includes(task.recurrence) ? task.recurrence : 'none',
    reminderAt: Number(task.reminderAt) || null,
    createdAt,
    completedAt: Number(task.completedAt) || null,
    updatedAt: Number(task.updatedAt) || Number(task.completedAt) || createdAt,
    order: Number.isFinite(Number(task.order)) ? Number(task.order) : createdAt,
    seriesId: task.seriesId || null,
    weeklyTargetId: task.weeklyTargetId || null
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
    reminderAt: null, createdAt: now, completedAt: null, updatedAt: now, order: nextTaskOrder(),
    seriesId: null, weeklyTargetId: null, ...overrides
  });
}

function nextOccurrenceDate(task) {
  if (!task.date || task.recurrence === 'none') return null;
  const date = parseDate(task.date);
  if (task.recurrence === 'daily') date.setDate(date.getDate() + 1);
  if (task.recurrence === 'weekly') date.setDate(date.getDate() + 7);
  if (task.recurrence === 'monthly') {
    const preferredDay = date.getDate();
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    date.setDate(Math.min(preferredDay, lastDay));
  }
  if (task.recurrence === 'weekdays') {
    do { date.setDate(date.getDate() + 1); } while ([0, 6].includes(date.getDay()));
  }
  return localDateKey(date);
}

function createNextOccurrence(task) {
  const nextDate = nextOccurrenceDate(task);
  if (!nextDate) return null;
  const seriesId = task.seriesId || task.id;
  task.seriesId = seriesId;
  if (activeTasks().some((item) => item.seriesId === seriesId && item.date === nextDate)) return null;
  const dayDelta = Math.round((parseDate(nextDate) - parseDate(task.date)) / 86400000);
  const next = newTask(task.title, {
    ...task,
    id: uid(), date: nextDate, status: 'open', done: false, archived: false, deletedAt: null,
    completedAt: null, createdAt: Date.now(), updatedAt: Date.now(), order: nextTaskOrder(), seriesId,
    subtasks: task.subtasks.map((subtask) => ({ ...subtask, id: uid('subtask'), done: false, completedAt: null, createdAt: Date.now() })),
    reminderAt: task.reminderAt ? task.reminderAt + dayDelta * 86400000 : null
  });
  tasks.push(next);
  touch(task);
  return next;
}

function setTaskCompletion(task, done) {
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

function recurrenceLabel(value) {
  return { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly', monthly: 'Monthly' }[value] || '';
}

function taskMetaHtml(task) {
  const pieces = [];
  pieces.push(`<span><span class="priority-dot ${task.priority}"></span>${task.priority === 'high' ? 'Important' : task.priority === 'low' ? 'Whenever' : 'Normal'}</span>`);
  pieces.push(`<span>${escapeHtml(taskDateLabel(task))}${task.dueTime ? ` · ${escapeHtml(task.dueTime)}` : ''}</span>`);
  if (task.estimatedMinutes) pieces.push(`<span>${task.estimatedMinutes >= 60 ? `${task.estimatedMinutes / 60}h` : `${task.estimatedMinutes}m`}</span>`);
  const project = projectById(task.projectId);
  if (project) pieces.push(`<span class="project-meta" data-project-color="${escapeHtml(project.color)}">${escapeHtml(project.name)}</span>`);
  if (task.recurrence !== 'none') pieces.push(`<span>↻ ${recurrenceLabel(task.recurrence)}</span>`);
  if (task.reminderAt) pieces.push('<span>◷ Reminder</span>');
  if (task.subtasks.length) pieces.push(`<span>${task.subtasks.filter((item) => item.done).length}/${task.subtasks.length} steps</span>`);
  if (task.weeklyTargetId) pieces.push('<span>Weekly target</span>');
  return pieces.join('');
}

function renderTaskList() {
  const visible = visibleTasks();
  taskList.classList.toggle('selection-mode', selectionMode);
  taskList.innerHTML = visible.map((task) => `
    <article class="task-item ${task.done ? 'done' : ''} ${selectedTaskIds.has(task.id) ? 'selected' : ''}" data-id="${escapeHtml(task.id)}" draggable="${selectionMode ? 'false' : 'true'}">
      <label class="bulk-check-wrap" aria-label="Select ${escapeHtml(task.title)}"><input class="bulk-check" data-select-id="${escapeHtml(task.id)}" type="checkbox" ${selectedTaskIds.has(task.id) ? 'checked' : ''}><span></span></label>
      <button class="task-check" data-action="toggle" aria-label="${task.done ? 'Mark as open' : 'Mark as complete'}">${icon.check}</button>
      <div class="task-copy" data-action="edit">
        <span class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</span>
        ${task.description ? `<span class="task-description">${escapeHtml(task.description)}</span>` : ''}
        <span class="task-meta">${taskMetaHtml(task)}</span>
      </div>
      <button class="task-action duplicate-task" data-action="duplicate" aria-label="Duplicate task" title="Duplicate">${icon.copy}</button>
      <button class="task-action edit-task" data-action="edit" aria-label="Edit task" title="Edit">${icon.edit}</button>
      <button class="task-action delete-task" data-action="delete" aria-label="Delete task" title="Delete">${icon.trash}</button>
      <span class="drag-handle" aria-label="Drag to reorder" title="Drag to reorder">${icon.drag}</span>
    </article>`).join('');
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
  $('weeklyPage').classList.toggle('hidden', activeView !== 'weekly');
  $('projectsPage').classList.toggle('hidden', activeView !== 'projects');
  if (!special) { renderHeaderAndProgress(); renderTaskList(); }
  renderNav();
  renderHistory();
  renderCalendar();
  renderWeeklyTargets();
  renderProjects();
  if (special) renderSpecialUtility();
  renderWidgetCard();
  renderBulkBar();
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

function renderSubtaskEditor() {
  const done = editingSubtasks.filter((item) => item.done).length;
  $('subtaskProgress').textContent = `${done} of ${editingSubtasks.length}`;
  $('subtaskEditList').innerHTML = editingSubtasks.map((subtask) => `<div class="subtask-edit-row" data-subtask-id="${escapeHtml(subtask.id)}"><input data-subtask-action="toggle" type="checkbox" ${subtask.done ? 'checked' : ''} aria-label="Complete ${escapeHtml(subtask.title)}"><span class="${subtask.done ? 'done' : ''}">${escapeHtml(subtask.title)}</span><button data-subtask-action="remove" type="button" aria-label="Remove subtask">×</button></div>`).join('');
}

function openEditor(task = null) {
  editingTaskId = task?.id || null;
  editingSubtasks = (task?.subtasks || []).map((subtask) => ({ ...subtask }));
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
  $('editReminder').value = toDatetimeLocal(task?.reminderAt);
  $('timestampRow').innerHTML = task ? `<span>Created ${formatTimestamp(task.createdAt)}</span>${task.completedAt ? `<span>Completed ${formatTimestamp(task.completedAt)}</span>` : '<span>Not completed</span>'}` : '<span>Created when you save</span>';
  renderSubtaskEditor();
  editDialog.showModal();
  setTimeout(() => $('editTitle').focus(), 40);
}

function duplicateTask(task) {
  const duplicate = newTask(`${task.title} copy`, {
    ...task, id: uid(), title: `${task.title} copy`, status: 'open', done: false, archived: false, deletedAt: null,
    completedAt: null, createdAt: Date.now(), updatedAt: Date.now(), order: nextTaskOrder(), seriesId: null, reminderAt: null,
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
    persist(next ? `Completed · next ${recurrenceLabel(task.recurrence).toLowerCase()} task created` : targetReached ? `${target.title}: weekly target reached` : task.done ? 'Nicely done' : 'Task reopened');
    render();
  } else if (actionButton.dataset.action === 'edit') openEditor(task);
  else if (actionButton.dataset.action === 'duplicate') duplicateTask(task);
  else if (actionButton.dataset.action === 'delete') softDeleteTasks(new Set([task.id]));
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
    for (const task of tasks.filter((item) => selectedTaskIds.has(item.id))) { task.date = date; touch(task); }
    persist(`${selectedTaskIds.size} tasks moved`); selectedTaskIds.clear(); render();
  }
});

editForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') return editDialog.close();
  const title = $('editTitle').value.trim();
  const date = $('editDate').value || null;
  if (!title || (date && !validDateKey(date))) return;
  let task = tasks.find((item) => item.id === editingTaskId);
  if (!task) { task = newTask(title); tasks.push(task); }
  const wasDone = task.done;
  task.title = title;
  task.description = $('editDescription').value.trim();
  task.priority = $('editPriority').value;
  task.projectId = $('editProject').value || null;
  task.date = date;
  task.dueTime = date && $('editTime').value ? $('editTime').value : null;
  task.estimatedMinutes = Number($('editEstimate').value) || null;
  task.recurrence = date ? $('editRecurrence').value : 'none';
  task.reminderAt = $('editReminder').value ? new Date($('editReminder').value).getTime() : null;
  task.subtasks = editingSubtasks;
  const shouldBeDone = $('editStatus').value === 'completed';
  if (wasDone !== shouldBeDone) setTaskCompletion(task, shouldBeDone); else touch(task);
  editDialog.close();
  persist(date ? 'Task saved' : 'Task saved to Inbox');
  render();
});
editDialog.addEventListener('close', () => { editingTaskId = null; editingSubtasks = []; });

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
  $('bulkDate').value = selectedDate;
  render();
  setTimeout(() => taskInput.focus(), 200);
}

init();
