const widgetList = document.getElementById('widgetList');
const emptyState = document.getElementById('emptyState');
const quickInput = document.getElementById('quickInput');
const pinButton = document.getElementById('pinButton');
const toast = document.getElementById('toast');
let tasks = [];
let toastTimer;

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
const today = localDateKey(new Date());

function escapeHtml(value) { const div=document.createElement('div'); div.textContent=value; return div.innerHTML; }
function showToast(message) { toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),1300); }
async function persist(message) { await window.tasknest.saveTasks(tasks); if(message) showToast(message); }

function render() {
  const todayTasks = tasks.filter((task) => task.date === today);
  const complete = todayTasks.filter((task) => task.done).length;
  const percent = todayTasks.length ? Math.round(complete / todayTasks.length * 100) : 0;
  document.getElementById('dateLabel').textContent = new Intl.DateTimeFormat(undefined,{weekday:'long',month:'short',day:'numeric'}).format(new Date()).toUpperCase();
  document.getElementById('scoreValue').textContent = `${percent}%`;
  document.getElementById('progressBar').style.width = `${percent}%`;
  document.getElementById('remainingLabel').textContent = todayTasks.length - complete ? `${todayTasks.length-complete} still open` : 'Nothing pending';
  emptyState.classList.toggle('hidden', todayTasks.length !== 0);
  widgetList.classList.toggle('hidden', todayTasks.length === 0);
  widgetList.innerHTML = todayTasks.map((task) => `<article class="widget-task ${task.done?'done':''}" data-id="${task.id}">
    <button class="check" data-action="toggle" aria-label="${task.done?'Reopen':'Complete'} task"><svg viewBox="0 0 24 24"><path d="m6 12 4 4 8-9"/></svg></button>
    <span class="task-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</span>
    <button class="delete" data-action="delete" aria-label="Delete task"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></button>
  </article>`).join('');
}

document.getElementById('quickForm').addEventListener('submit',(event)=>{
  event.preventDefault(); const title=quickInput.value.trim(); if(!title)return;
  tasks.unshift({id:`${Date.now()}-${Math.random().toString(16).slice(2)}`,title,priority:'normal',done:false,date:today,createdAt:Date.now()});
  quickInput.value=''; persist('Task saved'); render(); quickInput.focus();
});

widgetList.addEventListener('click',(event)=>{
  const button=event.target.closest('[data-action]');if(!button)return;
  const index=tasks.findIndex((task)=>task.id===button.closest('.widget-task').dataset.id);if(index<0)return;
  if(button.dataset.action==='toggle'){tasks[index].done=!tasks[index].done;persist(tasks[index].done?'Nicely done':'Task reopened');}
  else {tasks.splice(index,1);persist('Task removed');} render();
});

pinButton.addEventListener('click',async()=>applySettings(await window.tasknest.toggleWidgetPin()));
document.getElementById('openMainButton').addEventListener('click',()=>window.tasknest.openMain());
document.getElementById('minimizeButton').addEventListener('click',()=>window.tasknest.minimizeWidget());
document.getElementById('closeButton').addEventListener('click',()=>window.tasknest.closeWidget());
document.getElementById('removeWidget').addEventListener('click',()=>window.tasknest.removeWidget());
function applySettings(settings){pinButton.classList.toggle('unpinned',!settings.widgetPinned);pinButton.title=settings.widgetPinned?'Stop keeping above other windows':'Keep above other windows';}
window.tasknest.onTasksChanged(async()=>{tasks=await window.tasknest.loadTasks();render();});
window.tasknest.onWidgetSettings(applySettings);

async function init(){tasks=await window.tasknest.loadTasks();tasks=tasks.map((task)=>task.date?task:{...task,date:today});applySettings(await window.tasknest.loadSettings());render();setTimeout(()=>quickInput.focus(),200);}
init();
