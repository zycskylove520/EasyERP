# 业务变更 05 · 规格展示按品类走，去掉全局并集空列（已实现 2026-11-21）

> 状态：完成。typecheck/build 过、**70 测试全过**（更新旧断言为 specText）；运行时实测混装单每行各显示自己品类规格摘要，已重启 3100 后端。未打包。
> 实现要点：后端 `common/dynamic-specs.ts` 的 `formatSpecSummary`（查品类 schema 拿 label/unit，优先快照）；前端 `spec-summary.ts` 同款。
> - 货品管理 `ProductsView`：groupedProducts 按品类分组，每组表头只放该品类 specSchema 非 reserved 字段。
> - 四制单页：明细规格改为「规格」摘要单列 + 点按展开该行品类专属字段输入（expandedSpecRow）；对帐单本就是文本单列未动。
> - 四 getPrintData + docx + 四打印预览页：specFields 并集 → 每行 specText 单列；material 并入报价/订购摘要。
> - 历史单兼容：specs 快照/spec 文本保留，material 老字段并入。

> 主人指出：货品管理当前把所有品类规格字段做并集当表头，导致每个货品都显示所有字段、不属于自己的就空着，很不合理；且单据里多品类共存也有同样问题。

## 1. 现状根因
- `ProductsView.vue` 的 `allSpecFields`（所有货品规格字段并集）做列表表头，每个货品行渲染全部列 → 空列。
- 单据制单页（报价/订购/送货/对帐）、后端 `getPrintData`、docx、打印预览页全部用 `specFields` 并集 → 一张单里不同品类互相空列。

## 2. 主人拍板方案（分场景 + 中文摘要）
- **货品管理页**：列表改为**按品类分组表格**——每个品类一个区块，表头只显示该品类自己的规格字段，只列该品类货品；顶部品类筛选保留（"全部"显示所有分组）。新增/编辑表单不动（本就按品类动态）。
- **四类单据（制单 + 打印 + 导出）**：明细规格从"动态并集列"改为**单个"规格"列**——每行按该货品所属品类，把规格渲染成摘要 `中文label+数值+单位`（如 `φ数13MM 厚度22MM`）。制单每行只按自己品类字段填写，选货品自动带入。一张单里多品类各显示各的。
- **底层不变**：specs JSON / specLabels 快照结构保留（历史单据兼容），只改展示层。

## 3. 影响面
- 前端：ProductsView（分组）、types、四个制单页（Quotation/PurchaseOrder/DeliveryNote/Statement FormView）、四个打印预览页、公共规格摘要函数。
- 后端：四个 service 的 getPrintData（specFields 并集 → 每行一个 specText）、四个 docx service（动态列 → 单列）、amountToChinese 等不变。
- 历史单据：老单据 specs 快照仍在，摘要按快照 label 渲染；无快照的回退品类 schema / key。

## 4. 验证要点
- 货品管理：不同品类分组，各组表头只有自己的字段，无空列。
- 单据：一张单混装多品类，每行规格摘要正确（中文名+值+单位），打印/导出同源一致。
- typecheck/build/测试全过；运行时实测；重启 3100 后端。
