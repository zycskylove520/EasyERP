# 业务变更 03 · 单据打印预览、送货规格动态、单号前缀、去料号（已实现 2026-11-21）

> 状态：4 条整改全部完成。typecheck/build 过、**69 测试全过**（13 suites，新增 business-change-03.e2e-spec.ts 3 用例）；运行时实测：前缀 YLD 生效（`YLD-20261121-1732`）、明细无 partNo、动态规格列「φ数/厚度」、print 数据正确、docx 有效（PK头/10KB）、前端首页与打印 chunk 200。未打包。

> 主人需求原文（4 条整改）：
> 1. 订购单、送货单、对账单模块把「导出Word」按钮改为「打印」按钮，点击后应该也支持和报价单一样可以预览和导出word和pdf；
> 2. 送货单的规格也是根据产品品类动态的字段，不是默认字段；
> 3. 送货单的单号开头应该在公司信息里加一个字段，如果填写YLD，那就以YLD开头；
> 4. 删除送货单的料号字段。

## 1. 现状（勘察证据）
- 报价单模式：`QuotationsView.vue` 列表「打印」→ `/quotations/:id/print` → `QuotationPrintView.vue`（返回 / 导出 Word / 打印三个按钮）；后端 `GET /quotations/:id/print` 由 `QuotationService.getPrintData()` 提供结构化数据，`docx` 端点复用同一数据渲染。PDF 走浏览器 `window.print()` → 另存为 PDF，无独立 PDF 生成库。
- 三单据列表页：按钮是「导出Word」，直接 `downloadDocx`；后端只有 `GET /:id/docx`，无 print 端点；无打印预览页。
- 送货单明细：固定 `spec`(文本)+`part_no`(料号) 列；制单页「料号」输入框 + 单个「规格」输入框；docx 固定 10 列（含料号）。
- 订购单已实现规格动态列（`specs` JSON + `spec_labels` 快照 + 品类 `spec_schema` 动态拆列）——本次照此模式移植到送货单。
- 公司信息 `company_info` 无单号前缀字段；`DeliveryNoteService.generateDeliveryNo()` 写死 `DN-`。
- 对帐单从送货单带入时取 `item.spec` 文本（`StatementService.fromDelivery`）。

## 2. 四条整改方案

### R1 三单据「打印」按钮 + 打印预览页（Word/PDF）
- 后端：三个 service 各加 `getPrintData(id)`，返回与报价单同构的打印数据（公司信息、单据抬头、动态规格列 `specFields`/`columns`、明细 `items`、合计/大写/条款等）；controller 加 `GET /:id/print`；`GET /:id/docx` 改为 `docxService.render(getPrintData(id))`，保证预览与导出同源。
- 前端：api.ts 三个 API 对象各加 `print`；新增三个打印预览页 `PurchaseOrderPrintView.vue` / `DeliveryNotePrintView.vue` / `StatementPrintView.vue`（结构照 `QuotationPrintView.vue`，含「返回 / 导出 Word / 打印」）；router 加三条 `/xxx/:id/print`；三个列表页按钮文案「导出Word」→「打印」，点击跳预览页（不再直接下载）。
- PDF：与报价单一致，走预览页「打印」按钮 `window.print()`，由浏览器另存为 PDF。

### R2 送货单规格按品类动态
- schema：`delivery_note_items` 幂等 ALTER 加 `specs TEXT NOT NULL DEFAULT '{}'`、`spec_labels TEXT NOT NULL DEFAULT '{}'`（仿 purchase_order_items）；旧 `spec` 文本列保留兼容。
- 后端 service：DTO/Input 加 `specs`/`specLabels`；insertItems 写 JSON；fromQuotation 从报价明细带 `specs`/`specLabels`；`getPrintData` 用公共 helper 收集动态列（label 优先快照→品类 schema→key；老单据 spec 文本按 `key=value` 拆成 specs）。
- 后端 docx：用同一 helper 动态生成规格列；列顺序改为 序号 / 订单号码 / 品名 / 动态规格… / 单位 / 数量 / 单价 / 金额 / 备注（料号已删）。
- 前端 types + 制单页：仿 `PurchaseOrderFormView.vue`，选货品自动填 `specs`/`specLabels`，表头按所有明细规格并集动态渲染列，编辑历史单据回填快照。
- 对帐单 fromDelivery：把送货明细 `specs` 拍平为 `label=value` 文本填 `spec`（对帐单列结构不动，需求未涉及）。

### R3 送货单单号前缀（公司信息新增字段）
- `company_info` 幂等 ALTER 加 `delivery_no_prefix TEXT`（默认空）；CompanyInfoDto/Input/Row + service get/update + 前端表单 + types 全链路。
- `DeliveryNoteModule` imports `CompanyInfoModule`；`DeliveryNoteService` 注入 `CompanyInfoService`；`generateDeliveryNo()` 用 `prefix || 'DN'` 作为开头（填 YLD → `YLD-YYYYMMDD-XXXX`）。种子默认留空，保持现有行为不变。

### R4 删除送货单料号
- 前端制单页删「料号」列与输入；types 的 DTO/Input 去 `partNo`；后端 service DTO/Input/insertItems/duplicate 去 `partNo`；docx 列删「料号」；schema 的 `part_no` 列保留（历史数据不物理删除，新单写 NULL）。
- 测试里涉及 partNo 的断言同步更新。

## 3. 关键决策与边界
- **PDF 语义**：与报价单完全相同——预览页「打印」调 `window.print()`，用户选「另存为 PDF」；不引入新 PDF 库、不做独立 PDF 下载按钮。若主人要真正的后端 PDF 导出，另立需求。
- **历史数据**：料号列、spec 文本列、旧单号都不做数据迁移/物理删除；老单据 print 时用 spec 文本兼容解析。
- **打印数据与 docx 同源**：三单据 docx 服务改收 PrintData（与报价单一致），避免预览与导出两处逻辑漂移。
- **规格快照**：沿用订购单「制单时存 specLabels 快照」规则，历史单据表头不随品类改名而变。

## 4. 影响面
- 后端：schema/seed(无需改前缀默认)、company-info 模块、delivery-note 模块（service/docx/controller/module）、purchase-order 模块（service/docx/controller）、statement 模块（service/docx/controller）、common 新增规格 helper。
- 前端：api.ts、types.ts、router.ts、三个列表页、三个新打印页、送货单制单页、公司信息页。
- 测试：delivery-note / purchase-order / statement / company-info / full-chain 相关断言更新 + 新增 print 端点与前缀测试。
