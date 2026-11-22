/**
 * Electron 预加载脚本：在隔离的渲染进程里安全地暴露有限的原生能力。
 * 仅暴露"导出 PDF"所需的 IPC 调用，不开放 nodeIntegration。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /** 把当前窗口内容导出为 PDF，返回保存结果。 */
  printToPDF: (defaultName) => ipcRenderer.invoke('print-to-pdf', defaultName),
});
