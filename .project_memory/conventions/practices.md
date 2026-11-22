# 规范层 · 使用习惯与工程约定

> 来源：engineering-craft core + languages/typescript.md。

## 工具链
- 包管理：pnpm（锁文件 `pnpm-lock.yaml` 提交）。
- 构建脚本统一在 `package.json` scripts：`build` / `typecheck` / `test` / `lint` / `dev`。
- TS 配置 `strict: true`；禁用 `any`，用 `unknown` + 收窄；边界用 zod 校验。
- 测试：Vitest（前端）/ Jest 或 Vitest（后端，待定）；测试名 `describe/it` 描述行为；mock 只隔离外部依赖。
- 格式化/lint：Prettier + ESLint，提交前统一跑。

## 注释
- 导出模块/类/公开函数/类型用 TSDoc（`/** */`），公开 API 写清 `@param`/`@returns`/`@throws`。
- 函数体内注释只写「为什么」，代码能看懂的不写。

## 自包含工具链（2026-11-21，主人要求）
- 工具链全在项目内：`.tools/node`（Node 22.23.5）、`.tools/pnpm-pkg`（pnpm 10.15.0）。
- 所有 pnpm/node 命令走 `.tools/pnpm.sh` / `.tools/node.sh` 启动器，不依赖系统 PATH、不写项目外。
- store/cache/state 用 `npm_config_*` 环境变量 + cygpath 转 Windows 绝对路径钉在项目内。
- pnpm 10 Windows 下 postinstall 找不到 node：依赖用 `--ignore-scripts` 装，esbuild 的 install.js 手动补跑。详见 `.tools/README.md`。
- 禁止用 DSH 内置 runtime 跑本项目；禁止在项目外建 store。

## 开发与测试节奏（主人 2026-11-21 明确）
- **测试阶段走网页，不打包**：起后端（Electron Node）+ Vite dev server，主人浏览器访问测业务。
- **只有主人明确说"打包"时才出 exe**。不要每次改完业务就打包（太慢）。
- 交付形态仍是 Electron exe，网页只是快速验证手段。
- 后端必须用 Electron 的 Node 跑（better-sqlite3 是 ABI130）；Vite 前端用普通 node 即可。

## 启动方式（2026-11-21）
- 后端：`cd apps/api && ../../.tools/node/node.exe dist/src/main.js`（先 build）
- 前端：`cd apps/web && <项目内node> <vite bin> --host 127.0.0.1`（Vite 必须在 apps/web 目录启动，否则找不到 index.html）
- 前端 /api 代理到 localhost:3000（vite.config.ts 配）。
- vue-router 用 4.x（4.5+）：5.x 要求 Vite 7/8，与本项目 Vite6 peer 冲突。

## 测试隔离（2026-11-21 批次3 踩坑）
- Jest 并行跑多测试文件时，若共享同一个 `data/easyerp.db` 会互相污染数据 + 并发迁移冲突（duplicate column）。
- 解决：`test/setup-db.ts` 设 `EASYERP_DB_FILE` 给每个 worker 一个独立临时库（放项目 `.tmp/`）。
- 迁移的 ALTER 必须捕获 'duplicate column name' 错误兜底（PRAGMA 在并发下会读到旧快照）。
- 产品库 `data/easyerp.db` 与测试库物理分离。

## 构建产物路径（实测 2026-11-21）
- 后端 NestJS 因 tsconfig `include` 含 `test/`，`nest build` 输出到 `apps/api/dist/src/main.js`（不是 `dist/main.js`）。直接跑用 `node dist/src/main.js`。
- 前端 Vite 输出到 `apps/web/dist`。

## 验证纪律
- 改动必跑真实命令、贴真实输出；未验证不宣称完成。
- 结论分级：实测 / 推断 / 猜测。
- 失败两次攻前提，不盲目重试。

## 测试服务进程管理（2026-11-21 踩坑）
- 主人报「Cannot GET /purchase-orders/3/print」——根因是 3100 上跑着**改动前的旧后端进程**（上个会话后台起的，加载旧 dist），新路由没生效；报价单 print 200（老路由在）、新单据 print 404（新路由不在）是判别信号。
- 每次让主人测试前：若之前起过后端，**先停旧进程再用新 dist 重启**，别直接让人刷新。旧进程的命令行特征是 `electron.exe apps/api/dist/src/main.js`，可用 `Get-CimInstance Win32_Process` 按 CommandLine 识别，别误杀 DSH 桌宠的 electron（命令行含 dsh-pet）。
- 区分 404 两种成因：路由不存在 vs 单据 id 不存在——用列表里真实存在的 id 复测，或临时建一张单测完删掉。
- 网页测试态：后端连 `data/easyerp.db` 用 3100；前端走 5173 Vite dev（源码热更新，改完刷新即可；api.ts 写死连 127.0.0.1:3100，vite.config 里的 /api 代理没用上）。
