# 项目层 · EasyERP

> 记录项目定位、技术栈、版本基线、依赖约束。来源：主人 2026-11-21 明确约定 + 本机实测。

## 定位
企业 ERP（Enterprise Resource Planning）系统。从零新建，空目录起步。

## 技术栈（主人 2026-11-21 拍板）
- 后端：Node.js + NestJS
- 前端：Vue3 + Vite
- 包管理：pnpm workspace（单仓多包，monorepo）
- 语言：TypeScript（前后端统一）

## 版本基线（2026-11-21，项目自包含工具链）
- Node v22.23.5 LTS + npm 10.9.9：`D:\Project\EasyERP\.tools\node\`（官方绿色版）
- pnpm 10.15.0：`D:\Project\EasyERP\.tools\pnpm-pkg\`（独立分发）
- git 2.56.0（系统自带）
- **不用 DSH 内置 runtime，不用系统 PATH**。所有命令走 `.tools/pnpm.sh` 与 `.tools/node.sh` 启动器。
- 启动器把 store / state / cache 全钉在项目内（详见 `.tools/README.md`）。

## 重要约束（主人 2026-11-21 明确）
- 依赖与工具**只能在项目目录内**，不得污染项目外任何地方。
- 外部 store/缓存一律禁止；`pnpm` 配置路径必须用 cygpath 转 Windows 绝对路径，否则会被误建成 `D:\d\Project\...`。

## 依赖约束
- 依赖版本显式写入 package.json，提交 pnpm-lock.yaml。
- 首版只装骨架运行所需依赖，不预装业务模块相关库。
- 新增依赖前评估必要性，避免膨胀。
