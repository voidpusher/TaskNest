const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tasknest', {
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (tasks) => ipcRenderer.invoke('tasks:save', tasks),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  loadWeeklyTargets: () => ipcRenderer.invoke('targets:load'),
  saveWeeklyTargets: (targets) => ipcRenderer.invoke('targets:save', targets),
  loadProjects: () => ipcRenderer.invoke('projects:load'),
  saveProjects: (projects) => ipcRenderer.invoke('projects:save', projects),
  openWidget: () => ipcRenderer.invoke('widget:open'),
  removeWidget: () => ipcRenderer.invoke('widget:remove'),
  toggleWidgetPin: () => ipcRenderer.invoke('widget:toggle-pin'),
  openMain: () => ipcRenderer.invoke('window:open-main'),
  minimizeWidget: () => ipcRenderer.invoke('window:minimize-widget'),
  closeWidget: () => ipcRenderer.invoke('window:close-widget'),
  recognizeVoice: (language) => ipcRenderer.invoke('voice:recognize', language),
  cancelVoice: () => ipcRenderer.invoke('voice:cancel'),
  onTasksChanged: (callback) => ipcRenderer.on('tasks:changed', callback),
  onWeeklyTargetsChanged: (callback) => ipcRenderer.on('targets:changed', callback),
  onProjectsChanged: (callback) => ipcRenderer.on('projects:changed', callback),
  onWidgetSettings: (callback) => ipcRenderer.on('widget:settings', (_event, settings) => callback(settings))
});
