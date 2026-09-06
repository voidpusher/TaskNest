const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tasknest', {
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (tasks) => ipcRenderer.invoke('tasks:save', tasks),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  loadWeeklyTargets: () => ipcRenderer.invoke('targets:load'),
  saveWeeklyTargets: (targets) => ipcRenderer.invoke('targets:save', targets),
  openWidget: () => ipcRenderer.invoke('widget:open'),
  removeWidget: () => ipcRenderer.invoke('widget:remove'),
  toggleWidgetPin: () => ipcRenderer.invoke('widget:toggle-pin'),
  openMain: () => ipcRenderer.invoke('window:open-main'),
  minimizeWidget: () => ipcRenderer.invoke('window:minimize-widget'),
  closeWidget: () => ipcRenderer.invoke('window:close-widget'),
  onTasksChanged: (callback) => ipcRenderer.on('tasks:changed', callback),
  onWeeklyTargetsChanged: (callback) => ipcRenderer.on('targets:changed', callback),
  onWidgetSettings: (callback) => ipcRenderer.on('widget:settings', (_event, settings) => callback(settings))
});
