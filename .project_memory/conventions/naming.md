# 规范层 · 命名约定

> 来源：engineering-craft `languages/typescript.md` + 本机约定。无约定的按社区主流。

- 文件/模块：`kebab-case`（如 `app.service.ts`）；Vue 组件用 `PascalCase.vue`。
- 类/类型/接口：`PascalCase`；接口**不加** `I` 前缀。
- 函数/变量：`camelCase`。
- 常量：`UPPER_SNAKE_CASE`。
- 状态机/分支：用带标签联合（discriminated union），不用散落的布尔标志。
- 目录：按特性/领域划分；入口与公开面集中在 `index.ts`，用 barrel 导出控制公开 API。
- 避免深层相对路径，后续配置路径别名。
