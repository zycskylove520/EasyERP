# 架构层 · 整体概览

> 描述分层、模块边界、调用链、数据流。当前为骨架阶段，业务模块待定。

## 目录结构
```
EasyERP/
├── apps/
│   ├── api/        # NestJS 后端服务
│   └── web/        # Vue3 + Vite 前端
├── package.json    # workspace 根，private
├── pnpm-workspace.yaml
└── .project_memory/
```

## 分层与依赖方向
- `apps/api`：后端，分层为 Controller（HTTP 边界）→ Service（业务逻辑）→ Repository/ORM（数据访问，后续引入）。单向依赖，无环。
- `apps/web`：前端，Vue3 组件 + Vite 构建，通过 HTTP 调 api。
- 前后端通过 REST API 契约交互；契约类型后续抽共享包（待业务明确再定，先减后加）。

## 调用链（预期）
浏览器 → Vue3 页面 → HTTP REST → NestJS Controller → Service → DB。

## 数据流（骨架阶段）
尚无业务数据流。首版仅保证：api 启动返回健康检查、web 启动可访问。
