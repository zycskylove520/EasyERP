/** Electron 预加载暴露的 API（见 electron/preload.cjs）。 */
declare global {
  interface Window {
    electronAPI?: {
      printToPDF: (defaultName: string) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean; message?: string }>;
    };
  }
}

/**
 * 导出 PDF：Electron 环境走主进程 printToPDF（真正生成 PDF 文件）；
 * 网页开发环境下退回浏览器打印对话框。
 */
export async function exportPdf(defaultName: string): Promise<{ ok: boolean; message?: string }> {
  if (window.electronAPI?.printToPDF) {
    const res = await window.electronAPI.printToPDF(defaultName);
    if (res.canceled) return { ok: true };
    return { ok: res.ok, message: res.message };
  }
  // 非 Electron：浏览器打印（用户可另存为 PDF）
  window.print();
  return { ok: true };
}
