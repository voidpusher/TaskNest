const taskForm = document.getElementById('taskForm');
const taskInput = document.getElementById('taskInput');
const priorityInput = document.getElementById('priorityInput');
const taskList = document.getElementById('taskList');
const emptyState = document.getElementById('emptyState');
const clearButton = document.getElementById('clearButton');
const toast = document.getElementById('toast');
const datePicker = document.getElementById('datePicker');

let tasks = [];
let selectedDate = localDateKey(new Date());
let activeFilter = 'all';
let widgetEnabled = false;
let toastTimer;

const icon = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-9"/></svg>',
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

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
}

async function persist(message) {
  await window.tasknest.saveTasks(tasks);
  if (message) showToast(message);
}

function dayTasks(date = selectedDate) {
  return tasks.filter((task) => task.date === date);
}

function visibleTasks() {
  const dated = dayTasks();
  if (activeFilter === 'active') return dated.filter((task) => !task.done);
  if (activeFilter === 'done') return dated.filter((task) => task.done);
  return dated;
}

function renderHistory() {
  const dateGroups = new Map();
  for (const task of tasks) {
    if (!dateGroups.has(task.date)) dateGroups.set(task.date, []);
    dateGroups.get(task.date).push(task);
  }

  const keys = [...dateGroups.keys()].sort().reverse().slice(0, 6);
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

function render() {
  datePicker.value = selectedDate;
  const today = localDateKey(new Date());
  const isToday = selectedDate === today;
  document.getElementById('todayButton').classList.toggle('hidden', isToday);
  document.getElementById('selectedDayLabel').textContent = isToday ? 'TODAY' : formatDay(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();
  document.getElementById('listTitle').textContent = isToday ? 'Today’s tasks' : formatDay(selectedDate, { weekday: 'long', month: 'short', day: 'numeric' });

  const visible = visibleTasks();
  taskList.innerHTML = visible.map((task) => `
    <article class="task-item ${task.done ? 'done' : ''}" data-id="${task.id}">
      <button class="task-check" data-action="toggle" aria-label="${task.done ? 'Mark as open' : 'Mark as complete'}">${icon.check}</button>
      <div class="task-copy">
        <span class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</span>
        <span class="task-meta"><span class="priority-dot ${task.priority}"></span>${task.priority === 'high' ? 'Important' : task.priority === 'low' ? 'Whenever' : 'Added'} · ${timeLabel(task.createdAt)}</span>
      </div>
      <button class="delete-task" data-action="delete" aria-label="Delete task">${icon.trash}</button>
    </article>
  `).join('');

  emptyState.classList.toggle('hidden', visible.length !== 0);
  taskList.classList.toggle('hidden', visible.length === 0);

  const dated = dayTasks();
  const completed = dated.filter((task) => task.done).length;
  const remaining = dated.length - completed;
  const percentage = dated.length ? Math.round((completed / dated.length) * 100) : 0;
  document.getElementById('progressValue').textContent = `${percentage}%`;
  document.getElementById('progressCount').textContent = `${completed} of ${dated.length}`;
  document.getElementById('progressBar').style.width = `${percentage}%`;
  document.getElementById('remainingLabel').textContent = remaining ? `${remaining} ${remaining === 1 ? 'task' : 'tasks'} still open` : 'Nothing pending';
  clearButton.disabled = completed === 0;
  renderHistory();
  renderWidgetCard();
}

function addTask(title, priority = 'normal') {
  const cleanTitle = title.trim();
  if (!cleanTitle) return;
  tasks.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: cleanTitle,
    priority,
    done: false,
    date: selectedDate,
    createdAt: Date.now()
  });
  persist(`Saved under ${formatDay(selectedDate, { month: 'short', day: 'numeric' })}`);
  render();
}

function chooseDate(key) {
  selectedDate = key;
  activeFilter = 'all';
  document.querySelectorAll('.filter').forEach((filter) => filter.classList.toggle('active', filter.dataset.filter === 'all'));
  render();
  taskInput.focus();
}

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();
  addTask(taskInput.value, priorityInput.value);
  taskInput.value = '';
});

taskList.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const index = tasks.findIndex((task) => task.id === actionButton.closest('.task-item').dataset.id);
  if (index < 0) return;
  if (actionButton.dataset.action === 'toggle') {
    tasks[index].done = !tasks[index].done;
    persist(tasks[index].done ? 'Nicely done' : 'Task reopened');
  } else {
    tasks.splice(index, 1);
    persist('Task removed');
  }
  render();
});

document.querySelectorAll('.filter').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll('.filter').forEach((filter) => filter.classList.toggle('active', filter === button));
    render();
  });
});

document.getElementById('historyList').addEventListener('click', (event) => {
  const day = event.target.closest('[data-date]');
  if (day) chooseDate(day.dataset.date);
});

datePicker.addEventListener('change', () => chooseDate(datePicker.value));
document.getElementById('todayButton').addEventListener('click', () => chooseDate(localDateKey(new Date())));
document.getElementById('previousDay').addEventListener('click', () => {
  const date = parseDate(selectedDate); date.setDate(date.getDate() - 1); chooseDate(localDateKey(date));
});
document.getElementById('nextDay').addEventListener('click', () => {
  const date = parseDate(selectedDate); date.setDate(date.getDate() + 1); chooseDate(localDateKey(date));
});

clearButton.addEventListener('click', () => {
  tasks = tasks.filter((task) => task.date !== selectedDate || !task.done);
  persist('Completed tasks cleared');
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

window.tasknest.onTasksChanged(async () => {
  tasks = await window.tasknest.loadTasks();
  migrateTasks();
  render();
});

window.tasknest.onWidgetSettings((settings) => {
  widgetEnabled = settings.widgetEnabled;
  renderWidgetCard();
});

function migrateTasks() {
  let changed = false;
  const today = localDateKey(new Date());
  tasks = tasks.map((task) => {
    if (task.date) return task;
    changed = true;
    return { ...task, date: today };
  });
  if (changed) window.tasknest.saveTasks(tasks);
}

async function init() {
  tasks = await window.tasknest.loadTasks();
  const settings = await window.tasknest.loadSettings();
  widgetEnabled = settings.widgetEnabled;
  migrateTasks();
  render();
  setTimeout(() => taskInput.focus(), 250);
}

init();
