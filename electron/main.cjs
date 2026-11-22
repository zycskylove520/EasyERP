/**
 * EasyERP Electron 主进程。
 *
 * 职责：
 *  1. 启动「内置后端」——用 Electron 自带 Node 运行编译后的 NestJS，原生模块按 Electron ABI 编译。
 *  2. 把数据库路径指向用户数据目录（可写、随用户走，不装在 Program Files 里）。
 *  3. 创建窗口：生产模式通过内置后端 http 加载前端（避开 file:// 的 CORS 白屏），开发模式加载 Vite dev server。
 *
 * 环境变量：
 *  - EASYERP_DEV=1  开发模式：前端走 http://127.0.0.1:5173，后端仍由本进程拉起。
 */
const { app, BrowserWindow, Menu, Tray, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { fork } = require('node:child_process');

// Windows 上关闭「原生窗口遮挡计算」：该特性会导致窗口失去焦点后输入框无法点击/输入，
// 最小化再还原（触发重绘）后恢复。关闭后输入稳定。
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
}

const isDev = process.env.EASYERP_DEV === '1';
const BACKEND_PORT = '3100';
const DEV_SERVER_URL = 'http://127.0.0.1:5173';

let backendProcess = null;
let mainWindow = null;
let tray = null;
/** 是否为真正退出（托盘菜单"关闭"或系统退出）；点窗口 X 时 false → 只隐藏到托盘 */
let isQuitting = false;

/** Electron 资源根目录：开发时是项目根，打包后是 app.asar 内。 */
function resourceRoot() {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, '..');
}

/** 应用图标路径（打包后在 asar 内，开发时在项目根）。 */
function appIcon() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar', 'build', 'icon.png')
    : path.resolve(__dirname, '..', 'build', 'icon.png');
}

/** 后端入口 js 的绝对路径。 */
function backendEntry() {
  const root = resourceRoot();
  const relative = path.join('apps', 'api', 'dist', 'src', 'main.js');
  return path.join(root, app.isPackaged ? path.join('app.asar', relative) : relative);
}

/** 后端环境变量：数据库落在 userData，端口固定 3100。 */
function backendEnv() {
  const userData = app.getPath('userData');
  fs.mkdirSync(userData, { recursive: true });
  const dbFile = path.join(userData, 'easyerp.db');
  console.log('[electron] 数据库路径：', dbFile);
  const env = {
    ...process.env,
    EASYERP_DB_FILE: dbFile,
    PORT: BACKEND_PORT,
    NODE_ENV: 'production',
  };
  delete env.EASYERP_DEV;
  return env;
}

/** 启动内置后端子进程（Fork 用 Electron 的 Node 执行，ABI 与打包的原生模块一致）。 */
function startBackend() {
  const entry = backendEntry();
  if (!fs.existsSync(entry)) {
    console.error('[electron] 后端入口不存在，请先构建：', entry);
    return;
  }
  backendProcess = fork(entry, [], {
    env: backendEnv(),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  backendProcess.stdout.on('data', (d) => console.log('[backend]', String(d).trim()));
  backendProcess.stderr.on('data', (d) => console.error('[backend]', String(d).trim()));
  backendProcess.on('exit', (code) => console.log('[backend] exited', code));
}

/** 导出当前页面为 PDF：弹保存对话框 + webContents.printToPDF。 */
ipcMain.handle('print-to-pdf', async (_event, defaultName) => {
  try {
    const win = BrowserWindow.getFocusedWindow() || mainWindow;
    if (!win) return { ok: false, message: '窗口不可用' };
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: '导出 PDF',
      defaultPath: `${defaultName || '单据'}.pdf`,
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    const data = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      marginsType: 0,
    });
    fs.writeFileSync(filePath, data);
    return { ok: true, filePath };
  } catch (err) {
    console.error('[electron] 导出 PDF 失败:', err);
    return { ok: false, message: String(err && err.message ? err.message : err) };
  }
});

/** 显示并聚焦主窗口（托盘双击/右键展开时调用）。 */
function showWindow() {
  if (!mainWindow) { createWindow(); return; }
  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();
}

/** 创建系统托盘图标：右键菜单=展开/关闭，左键双击=展开。 */
function createTray() {
  if (tray) return;
  tray = new Tray(appIcon());
  tray.setToolTip('EasyERP');
  const contextMenu = Menu.buildFromTemplate([
    { label: '展开 EasyERP', click: () => showWindow() },
    { type: 'separator' },
    { label: '关闭', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(contextMenu);
  // 左键单击即展开窗口（双击也保留，兼容用户习惯）
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
}

/** 创建主窗口并加载前端。 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'EasyERP',
    icon: appIcon(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    // 走内置后端托管的静态页面（http），避开 file:// 下 ES module 的 CORS 限制导致白屏。
    const appUrl = `http://127.0.0.1:${BACKEND_PORT}/`;
    const loadWithRetry = (attempt = 0) => {
      mainWindow.loadURL(appUrl).catch(() => {
        if (attempt < 20) setTimeout(() => loadWithRetry(attempt + 1), 300);
      });
      mainWindow.webContents.once('did-fail-load', () => {
        if (attempt < 20) setTimeout(() => loadWithRetry(attempt + 1), 300);
      });
    };
    loadWithRetry();
    mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
      console.error('[electron] 页面加载失败:', code, desc, url);
    });
    mainWindow.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) console.error('[renderer]', message);
    });
  }

  // 点右上角 X 不退出，改为隐藏到系统托盘；真正退出走托盘"关闭"菜单。
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

app.whenReady().then(() => {
  // 去掉 Electron 默认菜单栏（File/Edit/View…），避免顶部出现白色菜单条
  Menu.setApplicationMenu(null);
  createTray();
  startBackend();
  // 给后端留出启动时间，前端发出的 API 请求才能连上。
  setTimeout(createWindow, isDev ? 300 : 600);

  app.on('activate', () => {
    // macOS 点 dock 图标；Windows 隐藏到托盘后一般走托盘菜单，这里兜底
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on('window-all-closed', () => {
  // 不再因窗口关闭而退出：窗口被隐藏到托盘，不会触发真正的 all-closed。
  // 只有托盘"关闭"或系统退出才到这里。
  if (isQuitting) {
    if (backendProcess) backendProcess.kill();
    if (process.platform !== 'darwin') app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  if (tray) { tray.destroy(); tray = null; }
  if (backendProcess) backendProcess.kill();
});
