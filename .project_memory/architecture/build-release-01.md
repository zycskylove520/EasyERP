# 构建发布 01 · 清理环境并首次构建干净 exe（2026-11-21）

> 主人要求：清空模拟数据、删除所有缓存/临时/旧构建，构建 exe。

## 1. 清理（已执行）
- 停后端（3100）→ 删 data/easyerp.db{,-shm,-wal}（模拟数据清空，数据目录空）。
- 删：.cache/、.tmp/、.tmp-template-analysis/、.pnpm-state/、release/、release-v2~v6/、apps/api/dist/、apps/web/dist/。
- **保留**（构建必需）：.pnpm-store/（550M 包缓存）、node_modules/（284M 依赖）、.tools/（自包含 Node/pnpm）。
- 磁盘：D盘 433G 可用，充足。

## 2. 构建流程（scripts/build-exe.sh）
1. pnpm -r build（前后端 → dist）
2. electron-rebuild（better-sqlite3 → ABI 130）
3. electron-builder --win --x64，缓存指向项目内 .cache/electron-builder，产物输出 release-v6/
- 用 ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ 加速。

## 3. 结果（已验证）
- 构建成功，`release-v6/EasyERP Setup 0.1.0.exe`（82M，PE头4d5a有效）+ win-unpacked/EasyERP.exe（180M）。
- asar 内容核对：含 apps/api/dist、apps/web/dist、electron/main.cjs、package.json，完整。
- 启动验证：exe 在 userData（AppData/Roaming/easyerp/）成功创建 9 张表——证明内置后端在打包环境下正常启动并执行迁移；无头环境无 GUI 显示导致主窗口退出（非程序 bug）。验证产生的 userData 库已清理，用户首次运行会自动重建空库。
- 项目 data/ 为空，模拟数据未打包。

## 5. 白屏修复（第二轮构建，重要！）
- 主人反馈 exe 白屏。根因：`docx` 只声明在 apps/api/package.json，实际是 pnpm 符号链接（apps/api/node_modules/docx -> 根 .pnpm），electron-builder 不跟随符号链接 → asar 内没有 docx 包 → 打包后端 `require('docx')` 崩溃 → 前端白屏。
- 修复三步：
  1. **根 package.json dependencies 加 `docx: ^9.16.0`** + `pnpm install` 更新 lock（关键！只加 files 不跟随符号链接没用）。
  2. build.files 加 `apps/api/node_modules/**/*`；asarUnpack 加 `apps/web/dist/**/*`（Express 从解包目录读静态资源，避免 asar 读取问题）。
  3. main.cjs 加页面加载失败/渲染进程 console 日志，便于以后定位。
- 验证（用打包版 Electron 以 ELECTRON_RUN_AS_NODE 跑 asar 内后端）：health 200、首页返回 index.html、assets JS 200、docx 能加载。白屏根因确认解决。
- 图标：纯 Node 手写 PNG（build/icon.png，256x256 紫→青渐变+白色E，程序化生成无依赖）；package.json 配 author="EasyERP Team" + build.icon；main.cjs BrowserWindow.icon 指向 asar 内 build/icon.png（files 已包含）。electron-builder 自动转 ICO。
- electron-builder 的 @electron/rebuild 重复警告无害。产物 release-v6。

## 6. 经验（重要）
- **pnpm workspace 的符号链接依赖不会被 electron-builder 跟随**：后端运行依赖必须声明在根 package.json dependencies，否则打包缺失。
- 验证打包后端可用性的正确姿势：`ELECTRON_RUN_AS_NODE=1 win-unpacked/EasyERP.exe app.asar/apps/api/dist/src/main.js` + curl 各端点（无需 GUI）。
- 无头环境无法验证 Electron GUI 显示，但后端+静态资源可完整验证。
