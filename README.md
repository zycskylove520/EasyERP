# EasyERP

一款本地优先（local-first）的桌面 ERP，面向中小企业，基于 NestJS、Vue 3、Electron 和 SQLite 构建。覆盖从基础资料、报价单、订购单、送货单、对帐单到库存与财务的完整业务流程，全部离线运行，数据本地存储。

> 无云服务、无账号、无预置数据。品类与公司信息由使用者在首次使用时自行填写。

## 功能

- **基础资料** —— 品类字典（规格模板可自定义）、货品、供货商、客户（供货/销售分域独立）。
- **业务单据** —— 报价单、订购单、送货单、对帐单，支持草稿/确认/打回流转、单号生成、打印预览、导出 Word / PDF。
- **库存管理** —— 基于流水账的库存模型（当前库存 = 所有流水增减之和），支持期初/手工调整、入库/出库及完整流水查询。
- **财务管理** —— 根据已确认的对帐单与订购单计算应收应付，支持收付款登记；单据打回时自动失效。
- **概览看板** —— KPI 卡片与图表（库存结构、销售趋势、单据状态、客户对帐排行、库存流水、畅货 TOP10）及负库存预警。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面外壳 | Electron 33 |
| 后端 | NestJS 11（Node.js + TypeScript） |
| 前端 | Vue 3 + Vite + Vue Router |
| 数据库 | SQLite（better-sqlite3，按 Electron ABI 130 编译） |
| 单据导出 | docx（Word）、Electron `printToPDF` |
| 图表 | ECharts |
| 包管理 | pnpm workspace（单仓多包） |

运行时 SQLite 数据库存放在 Electron 的 `userData` 目录，随安装后的软件走，不纳入本仓库。

## 目录结构

```
apps/api/     NestJS 后端（数据库、业务模块、单据渲染）
apps/web/     Vue 3 前端（页面、API 封装、路由）
electron/     Electron 主进程与 preload
scripts/      开发 / 打包 / 测试脚本
```

## 快速开始

仓库在 `.tools/` 中自带工具链（Node + pnpm），命令通过 `scripts/` 下的脚本执行。

```bash
# 开发模式（Electron 窗口 + Vite 热更新）
bash scripts/dev.sh

# 运行后端测试（用 Electron 的 Node，匹配原生模块的 ABI）
bash scripts/test.sh

# 打包 Windows 安装包（产物在 release/ 目录）
bash scripts/build-exe.sh
```

前置条件：Windows 上的 Git Bash（MSYS）。脚本会把所有 store 与缓存钉在项目目录内，不污染项目外。

## 数据与隐私

- 源码中不捆绑任何业务或公司数据。首次运行时创建空库，品类与公司信息由使用者在界面中填写。
- 软件不会向任何服务器发送数据，全部在本地处理。

## 许可证

MIT —— 详见 [LICENSE](LICENSE)。
