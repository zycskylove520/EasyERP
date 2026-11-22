# Electron 打包架构与踩坑（2026-11-21）

> 主人决定「全面转 Electron」：不再交付网页版，桌面软件为唯一形态。
> 本文件记录架构、决策与踩过的坑。最终产物 `release-v3/EasyERP Setup 0.1.0.exe`（82MB，Win x64）。

## 架构
- Electron 33.4.11（内置 Node 20.18.3，**ABI 130**）作为唯一运行时。
- 主进程 `electron/main.cjs`：fork 内置 NestJS 后端（用 Electron 的 Node，ABI 与原生模块一致）+ 加载前端 dist（file://）。
- 后端 `apps/api/dist`，前端 `apps/web/dist`，都打进 asar；better-sqlite3 原生模块 asarUnpack 到 `app.asar.unpacked/`。
- 数据库：`app.getPath('userData')/easyerp.db`（运行时由 Electron 解析到用户数据目录，路径因机器而异，不固定写死）。
- 后端环境变量 `EASYERP_DB_FILE` 覆盖数据库路径（批次 3 已支持），`PORT=3100`，前端 api.ts 请求 `http://127.0.0.1:3100`（绝对地址，因 file:// 无正常 origin）+ 后端开 CORS。
- `.tools/` 的 Node22+pnpm 只用于开发/构建/打包，不参与软件运行。

## 关键决策
- D-101 全面 Electron：主人 2026-11-21 决定，删掉网页版 start.sh。
- D-102 选 Electron 33：其 Node ABI 130 有 better-sqlite3 11.10.0 预编译包（实测 CRUD 通过）。
- D-103 signAndEditExecutable=false：跳过 winCodeSign（其 darwin 软链接需开发者模式，本机无权限）。不签名。
- D-104 根 package.json 加 dependencies（后端运行时依赖）：electron-builder 只认入口 package.json 的 dependencies 来收集 node_modules；不加则 asar 里没有依赖、安装即崩。

## 踩坑（都解决，记录避重复）
1. **pnpm ignore-scripts**：electron 本体、esbuild、better-sqlite3 的 postinstall 都被拦。手动补：electron 用 `ELECTRON_MIRROR=npmmirror` 跑 install.js；esbuild 跑其 install.js；better-sqlite3 用 PowerShell+.cmd 设 PATH 拉预编译。
2. **electron-rebuild EPERM**：旧 .node 被运行中的后端进程占用 → 关掉所有服务再 rebuild。
3. **ABI 冲突**：electron-rebuild 把 better-sqlite3 从 Node22 ABI 改成 Electron ABI 130，普通 Node22 就加载不了。全面 Electron 后不再需要 Node22 运行后端，冲突自然消失。
4. **node_modules 没进 asar**：根 package.json 只有 devDependencies → electron-builder 不收集。加 dependencies 到根解决（asar 3595 个 node_modules 文件）。
5. **winCodeSign 符号链接失败**：普通权限建不了 darwin 软链接 → `signAndEditExecutable=false` 跳过。
6. **ELECTRON_RUN_AS_NODE=1 残留（最坑）**：早先验证时 export 的变量污染了整个 bash 会话（跨调用持久）。导致 Electron 以纯 Node 模式启动、`require('electron').app` undefined、应用闪退且无日志。解决：启动 Electron 前 `unset ELECTRON_RUN_AS_NODE`（dev.sh 已加）；PowerShell 启动时 `Remove-Item Env:ELECTRON_RUN_AS_NODE`。**这是打包应用"立即退出"的假象根因，与打包产物无关。**
7. **release 目录锁**：旧 release / release-v2 目录被不明句柄锁住删不掉（`Device or resource busy`）→ 换新目录名 release-v3 输出。以后若再锁，换目录名即可。
8. **electron-builder 缓存外污染（两次）**：
   - 默认写用户本地 AppData/Local/electron-builder（117MB，已清）。
   - 脚本里设 `ELECTRON_BUILDER_CACHE` 用 MSYS 路径，Windows 原生进程误当成相对盘符路径，生成错误目录（各 11MB，已清）。
   - **正解**：`export ELECTRON_BUILDER_CACHE="$(cygpath -w "$ROOT/.cache/electron-builder")"`。凡传给 Windows 原生进程的路径，一律 cygpath -w 转绝对路径（与 pnpm store 同一个坑）。

## 使用
- 开发：`bash scripts/dev.sh`（Electron 窗口 + Vite 热更新）
- 打包：`bash scripts/build-exe.sh` → `release-v3/EasyERP Setup 0.1.0.exe`
- 分发：把该 exe 给同事，双击安装（Win10/11 x64）。数据存各自用户目录，互不干扰。
- 移动端/鸿蒙：Electron 不支持；用网页版部署到服务器后浏览器访问（本轮不做）。

## 验证记录（实测）
- Electron Node 环境 require better-sqlite3 CRUD OK（ABI 130）
- 打包版启动：RUNNING + /health 200 + 6 模块加载 + 路由映射
- 打包版业务闭环：期初100→确认扣30→库存70→打回→库存100 ✓
- asar 完整性：3595 个 node_modules 文件 + better_sqlite3.node 正确 unpack
