if (!window.tasknest) {
  const browserTaskKey = 'tasknest-browser-tasks';
  const browserSettingsKey = 'tasknest-browser-settings';
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const starterTasks = [
    { id: 'preview-1', title: 'Polish the project presentation', priority: 'high', done: false, archived: false, date: todayKey, createdAt: Date.now() - 3600000, completedAt: null },
    { id: 'preview-2', title: 'Review today’s top priorities', priority: 'normal', done: true, archived: false, date: todayKey, createdAt: Date.now() - 2700000, completedAt: Date.now() - 900000 },
    { id: 'preview-3', title: 'Take a 30-minute mountain walk', priority: 'low', done: false, archived: false, date: todayKey, createdAt: Date.now() - 1800000, completedAt: null },
    { id: 'preview-4', title: 'Read ten pages before bed', priority: 'normal', done: false, archived: false, date: todayKey, createdAt: Date.now() - 900000, completedAt: null }
  ];
  const loadBrowserTasks = () => {
    const saved = localStorage.getItem(browserTaskKey);
    if (saved) return JSON.parse(saved);
    localStorage.setItem(browserTaskKey, JSON.stringify(starterTasks));
    return starterTasks;
  };
  const loadBrowserSettings = () => JSON.parse(localStorage.getItem(browserSettingsKey) || '{"widgetEnabled":false}');
  const saveBrowserSettings = (settings) => localStorage.setItem(browserSettingsKey, JSON.stringify(settings));

  window.tasknest = {
    loadTasks: async () => loadBrowserTasks(),
    saveTasks: async (items) => { localStorage.setItem(browserTaskKey, JSON.stringify(items)); return true; },
    loadSettings: async () => loadBrowserSettings(),
    openWidget: async () => { const settings = { ...loadBrowserSettings(), widgetEnabled: true }; saveBrowserSettings(settings); return settings; },
    removeWidget: async () => { const settings = { ...loadBrowserSettings(), widgetEnabled: false }; saveBrowserSettings(settings); return settings; },
    onTasksChanged: () => {},
    onWidgetSettings: () => {}
  };
}

const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const priorityInput = document.getElementById('priorityInput');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const clearButton = document.getElementById('clearButton');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toastText');
const toastUndo = document.getElementById('toastUndo');
const datePicker = document.getElementById('datePicker');
const editDialog = document.getElementById('editDialog');
const editForm = document.getElementById('editForm');
const searchInput = document.getElementById('searchInput');
const calendarGrid = document.getElementById('calendarGrid');

let tasks = [];
let selectedDate = localDateKey(new Date());
let activeFilter = 'all';
let searchQuery = '';
let widgetEnabled = false;
let editingTaskId = null;
let toastTimer;
let undoAction = null;

const icon = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-.8 4 4-.8L18 8.4 14.6 5 4 16ZM13.5 6.1l3.4 3.4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>'
};

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
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && localDateKey(parseDate(key)) === key;
}

function formatDay(key, options) {
  return new Intl.DateTimeFormat(undefined, options).format(parseDate(key));
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function timeLabel(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp));
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
  }, action ? 5000 : 1700);
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

function dayTasks(date = selectedDate) {
  return tasks.filter((task) => task.date === date && !task.archived);
}

function visibleTasks() {
  let dated = dayTasks();
  if (activeFilter === 'active') dated = dated.filter((task) => !task.done);
  if (activeFilter === 'done') dated = dated.filter((task) => task.done);
  if (searchQuery) dated = dated.filter((task) => task.title.toLocaleLowerCase().includes(searchQuery));
  return dated;
}

function setFilter(filter) {
  activeFilter = filter;
  document.querySelectorAll('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === filter));
  document.getElementById('sidebarToday').classList.toggle('active', filter === 'all' && selectedDate === localDateKey(new Date()));
}

function renderCalendar() {
  const selected = parseDate(selectedDate);
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const taskDates = new Set(tasks.filter((task) => !task.archived).map((task) => task.date));

  document.getElementById('calendarMonth').textContent = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric'
  }).format(selected);

  const cells = Array.from({ length: firstWeekday }, () => '<span class="calendar-spacer"></span>');
  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = localDateKey(new Date(year, month, day));
    cells.push(`<button class="calendar-day ${key === selectedDate ? 'selected' : ''} ${taskDates.has(key) ? 'has-tasks' : ''}" data-date="${key}" type="button" aria-label="${formatDay(key, { month: 'long', day: 'numeric' })}">${day}</button>`);
  }
  calendarGrid.innerHTML = cells.join('');
}

function renderHistory() {
  const dateGroups = new Map();
  for (const task of tasks.filter((item) => !item.archived)) {
    if (!dateGroups.has(task.date)) dateGroups.set(task.date, []);
    dateGroups.get(task.date).push(task);
  }

  const keys = [...dateGroups.keys()].sort().reverse().slice(0, 7);
  const historyList = document.getElementById('historyList');
  if (!keys.length) {
    historyList.innerHTML = '<p class="history-empty">Your completed days will appear here.</p>';
    return;
  }

  historyList.innerHTML = keys.map((key) => {
    const group = dateGroups.get(key);
    const done = group.filter((task) => task.done).length;
    return `<button class="history-day ${key === selectedDate ? 'selected' : ''}" data-date="${key}">
      <span><strong>${formatDay(key, { month: 'short', day: 'numeric' })}</strong><small>${formatDay(key, { weekday: 'short' })}</small></span>
      <span class="history-score">${done}/${group.length}</span>
    </button>`;
  }).join('');
}

function renderWidgetCard() {
  document.getElementById('widgetCardTitle').textContent = widgetEnabled ? 'Today’s desktop widget is active' : 'Put today’s tasks on your desktop';
  document.getElementById('widgetCardText').textContent = widgetEnabled ? 'It stays synced and opens again with Windows.' : 'Mark tasks done without opening the full planner.';
  document.getElementById('widgetCardAction').textContent = widgetEnabled ? 'Remove widget' : 'Add widget';
  document.getElementById('desktopWidgetButton').classList.toggle('active', widgetEnabled);
}

function renderEmptyState(visibleCount) {
  const heading = emptyState.querySelector('h3');
  const copy = emptyState.querySelector('p');
  if (visibleCount) return;
  if (searchQuery) {
    heading.textContent = 'No matching tasks';
    copy.textContent = 'Try a different search phrase.';
  } else if (activeFilter === 'done' && dayTasks().length) {
    heading.textContent = 'Nothing completed yet';
    copy.textContent = 'Complete a task and it will appear here.';
  } else if (activeFilter === 'active' && dayTasks().length) {
    heading.textContent = 'Everything is finished';
    copy.textContent = 'That is a very good-looking empty list.';
  } else {
    heading.textContent = 'No tasks on this day';
    copy.textContent = 'Add one small thing, or choose another date.';
  }
}

function render() {
  datePicker.value = selectedDate;
  const today = localDateKey(new Date());
  const isToday = selectedDate === today;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';
  document.getElementById('todayButton').classList.toggle('hidden', isToday);
  document.getElementById('selectedDayLabel').textContent = formatDay(selectedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  document.getElementById('greetingTitle').textContent = isToday ? greeting : formatDay(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('listTitle').textContent = isToday ? 'Here’s what needs your attention today.' : 'Your saved plan and record for this day.';

  const visible = visibleTasks();
  taskList.innerHTML = visible.map((task) => `
    <article class="task-item ${task.done ? 'done' : ''}" data-id="${task.id}">
      <button class="task-check" data-action="toggle" aria-label="${task.done ? 'Mark as open' : 'Mark as complete'}">${icon.check}</button>
      <div class="task-copy">
        <span class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</span>
        <span class="task-meta"><span class="priority-dot ${task.priority}"></span>${task.priority === 'high' ? 'Important' : task.priority === 'low' ? 'Whenever' : 'Normal'} · ${task.done && task.completedAt ? `Completed ${timeLabel(task.completedAt)}` : `Added ${timeLabel(task.createdAt)}`}</span>
      </div>
      <button class="task-action edit-task" data-action="edit" aria-label="Edit task" title="Edit task">${icon.edit}</button>
      <button class="task-action delete-task" data-action="delete" aria-label="Delete task" title="Delete task">${icon.trash}</button>
    </article>
  `).join('');

  renderEmptyState(visible.length);
  emptyState.classList.toggle('hidden', visible.length !== 0);
  taskList.classList.toggle('hidden', visible.length === 0);

  const dated = dayTasks();
  const completed = dated.filter((task) => task.done).length;
  const remaining = dated.length - completed;
  const percentage = dated.length ? Math.round((completed / dated.length) * 100) : 0;
  document.getElementById('progressValue').textContent = `${percentage}%`;
  document.getElementById('progressCount').textContent = `${completed} of ${dated.length} completed`;
  document.getElementById('progressBar').style.width = `${percentage}%`;
  document.getElementById('focusBar').style.width = `${percentage}%`;
  document.getElementById('focusMessage').textContent = dated.length === 0 ? 'Start with one small task.' : percentage === 100 ? 'Everything is complete. Beautiful work.' : percentage >= 50 ? 'You’re over halfway there. Keep going.' : 'Pick one task and build momentum.';
  document.getElementById('remainingLabel').textContent = remaining ? `${remaining} ${remaining === 1 ? 'task' : 'tasks'} still open` : dated.length ? 'Everything complete' : 'Nothing pending';
  clearButton.textContent = activeFilter === 'active' ? 'Show all tasks' : 'Hide completed';
  clearButton.disabled = activeFilter !== 'active' && completed === 0;
  renderHistory();
  renderCalendar();
  renderWidgetCard();
}

function addTask(title, priority = 'normal') {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    taskInput.focus();
    return;
  }
  tasks.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: cleanTitle,
    priority,
    done: false,
    archived: false,
    date: selectedDate,
    createdAt: Date.now(),
    completedAt: null
  });
  persist(`Saved under ${formatDay(selectedDate, { month: 'short', day: 'numeric' })}`);
  setFilter('all');
  render();
}

function chooseDate(key) {
  if (!validDateKey(key)) return;
  selectedDate = key;
  setFilter('all');
  render();
  taskInput.focus();
}

function openEditor(task) {
  editingTaskId = task.id;
  document.getElementById('editTitle').value = task.title;
  document.getElementById('editPriority').value = task.priority;
  document.getElementById('editDate').value = task.date;
  editDialog.showModal();
  setTimeout(() => {
    document.getElementById('editTitle').focus();
    document.getElementById('editTitle').select();
  }, 50);
}

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addTask(taskInput.value, priorityInput.value);
  taskInput.value = '';
});

taskList.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const item = actionButton.closest('.task-item');
  const index = tasks.findIndex((task) => task.id === item.dataset.id);
  if (index < 0) return;

  if (actionButton.dataset.action === 'toggle') {
    tasks[index].done = !tasks[index].done;
    tasks[index].completedAt = tasks[index].done ? Date.now() : null;
    persist(tasks[index].done ? 'Nicely done' : 'Task reopened');
  } else if (actionButton.dataset.action === 'edit') {
    openEditor(tasks[index]);
    return;
  } else {
    const deletedTask = { ...tasks[index] };
    tasks.splice(index, 1);
    persist('Task deleted', () => {
      tasks.splice(Math.min(index, tasks.length), 0, deletedTask);
      persist('Task restored');
      render();
    });
  }
  render();
});

taskList.addEventListener('dblclick', (event) => {
  const item = event.target.closest('.task-item');
  if (!item) return;
  const task = tasks.find((entry) => entry.id === item.dataset.id);
  if (task) openEditor(task);
});

editForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.submitter?.value === 'cancel') {
    editDialog.close();
    editingTaskId = null;
    return;
  }
  const title = document.getElementById('editTitle').value.trim();
  const date = document.getElementById('editDate').value;
  const index = tasks.findIndex((task) => task.id === editingTaskId);
  if (!title || !validDateKey(date) || index < 0) return;
  tasks[index].title = title;
  tasks[index].priority = document.getElementById('editPriority').value;
  tasks[index].date = date;
  editDialog.close();
  editingTaskId = null;
  persist('Changes saved');
  render();
});

editDialog.addEventListener('close', () => { editingTaskId = null; });

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    setFilter(button.dataset.filter);
    render();
  });
});

document.getElementById('sidebarToday').addEventListener('click', () => chooseDate(localDateKey(new Date())));

searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLocaleLowerCase();
  render();
});

calendarGrid.addEventListener('click', (event) => {
  const day = event.target.closest('[data-date]');
  if (day) chooseDate(day.dataset.date);
});

document.getElementById('historyList').addEventListener('click', (event) => {
  const day = event.target.closest('[data-date]');
  if (day) chooseDate(day.dataset.date);
});

datePicker.addEventListener('change', () => chooseDate(datePicker.value));
document.getElementById('todayButton').addEventListener('click', () => chooseDate(localDateKey(new Date())));
function chooseAdjacentMonth(offset) {
  const date = parseDate(selectedDate);
  const preferredDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + offset);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(preferredDay, lastDay));
  chooseDate(localDateKey(date));
}

document.getElementById('previousDay').addEventListener('click', () => chooseAdjacentMonth(-1));
document.getElementById('nextDay').addEventListener('click', () => chooseAdjacentMonth(1));

clearButton.addEventListener('click', () => {
  setFilter(activeFilter === 'active' ? 'all' : 'active');
  render();
});

async function toggleWidget() {
  const settings = widgetEnabled ? await window.tasknest.removeWidget() : await window.tasknest.openWidget();
  widgetEnabled = settings.widgetEnabled;
  renderWidgetCard();
  showToast(widgetEnabled ? 'Desktop widget added' : 'Desktop widget removed');
}

document.getElementById('desktopWidgetButton').addEventListener('click', toggleWidget);
document.getElementById('titleWidgetButton').addEventListener('click', async () => {
  if (!widgetEnabled) await toggleWidget();
  else {
    await window.tasknest.openWidget();
    showToast('Widget brought to front');
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    taskInput.focus();
    taskInput.select();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') {
    event.preventDefault();
    chooseDate(localDateKey(new Date()));
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

window.tasknest.onTasksChanged(async () => {
  tasks = await window.tasknest.loadTasks();
  render();
});

window.tasknest.onWidgetSettings((settings) => {
  widgetEnabled = settings.widgetEnabled;
  renderWidgetCard();
});

async function init() {
  tasks = await window.tasknest.loadTasks();
  const settings = await window.tasknest.loadSettings();
  widgetEnabled = settings.widgetEnabled;
  render();
  setTimeout(() => taskInput.focus(), 250);
}

init();
