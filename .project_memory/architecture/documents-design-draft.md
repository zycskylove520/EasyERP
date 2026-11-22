# 新增三类业务单据 · 设计方案（定稿 v1.0 · 待主人下令开工）

> 日期 2026-11-21。依据主人提供的三份样本 + 主人两轮评审反馈。
> 样本：客户提供的一订购单 .docx、一对帐单 .doc（旧版）、一送货单 .xlsx（样本为私有资料，文件名与内容均不入库）。
> 状态：**方案定稿，尚未写业务代码**。主人说"开始"后按 §8 分批执行。
> 三份样本已复制到项目内 `.tmp-template-analysis/` 供分析，非交付物。

---

## 0. 主人评审结论（8 条，全部已定）

| # | 主人决定 | 落地含义 |
|---|---|---|
| 1 | 订购单确认后**增加对应库存** | `PO_RECEIVE` 加库流水；明细需 `productId`；打回写 `PO_REVERSE` 减回 |
| 2 | dev 库已有报价单扣库流水**不动** | 历史 `QUOTATION_CONSUME`/`QUOTATION_REVERSE` 保留；新逻辑不再产生 |
| 3 | 三类单据是**完整业务模块** | 订购/送货/对帐 = CRUD + 状态 + 导出 + 打回列表 |
| 4 | 做**可选带入** | 送货从报价带明细、对帐从送货带明细；不做强制外键 |
| 5 | 抬头/电话/条款首版**写死** | 不抽"单据设置"，常量集中在导出服务文件顶部 |
| 6 | 订购/对帐/送货**全部导出 .docx** | 不装 exceljs；送货单样本虽为 xlsx，用 docx 表格复刻版式 |
| 7 | 大写金额**自动生成** | 数字 → 人民币大写工具函数，对帐单/送货单共用 |
| 8 | 测试改写 | 报价确认扣库断言 → 改为送货确认扣库；补齐订购加库/打回用例 |

加上上一轮定的两条方向：
- **扣库存从报价单移到送货单阶段**（报价确认/打回均不动库存）。
- **四类单据（报价/订购/送货/对帐）都允许打回**，各有打回列表。

---

## 1. 业务定位（从样本反推）

| 单据 | 流向 | 对象 | 样本表头列 | 金额 | 库存 |
|---|---|---|---|---|---|
| 报价单 | 我方 → 客户 | customer | 已有 | 有 | **不动** |
| 订购单 | 我方 → 供应商 | supplier | 序号/品名/规格/材质/单位/数量/交货期/备注 | 无（样本无单价） | **确认加库 / 打回减库** |
| 送货单 | 我方 → 客户 | customer | 序号/订单号码/料号/品名/规格/单位/数量/单价/金额/备注 | 有 | **确认扣库 / 打回还库** |
| 对帐单 | 我方 → 客户 | customer | 日期/送货单号/品名/规格/单位/数量/单价/金额/备注 | 有 + 合计 + 大写 | **不动** |

业务链：报价单 →（可选带入）送货单 →（可选带入）对帐单；订购单是采购侧独立（确认即收货入库）。

## 2. 状态机（四类统一）

`DRAFT → CONFIRMED → REJECTED`；`WITHDRAWN` 仅历史兼容，新单据不暴露按钮。
每个模块列表按 `group=active|rejected` 分组（复用报价单模式），打回的单据进各自"打回单据"列表。

| 单据 | 确认时 | 打回时 |
|---|---|---|
| 报价单 | 仅改状态，**不碰库存** | 仅改状态，**不碰库存** |
| 订购单 | 逐明细 `PO_RECEIVE` 加库 | `PO_REVERSE` 冲销减库（幂等） |
| 送货单 | 逐明细 `DELIVERY_CONSUME` 扣库（可负，返回 lowStock） | `DELIVERY_REVERSE` 冲销还库（幂等） |
| 对帐单 | 仅改状态，**不碰库存** | 仅改状态，**不碰库存** |

## 3. 数据模型（草案）

```
purchase_order (订购单主表)
  id, orderNo(PO-YYYYMMDD-XXXX), supplierId→supplier, supplierName(快照),
  date, attn, fax, currency, fm, status, createdAt
purchase_order_item
  id, orderId, seq, productId?(可空，确认加库用), productName, spec, material,
  unit, quantity, deliveryDate, remark, inventoryLedgerId?, reversalLedgerId?

delivery_note (送货单主表)
  id, deliveryNo(DN-YYYYMMDD-XXXX), customerId→customer, customerName(快照),
  shipAddress, deliveryDate, orderNo(订单号码/文本，可关联报价单号),
  sourceQuotationId?(可空), status, createdAt
delivery_note_item
  id, deliveryId, seq, partNo(料号), productId?(可空，扣库用),
  productName, spec, unit, quantity, unitPrice, amount, remark,
  inventoryLedgerId?, reversalLedgerId?

statement (对帐单主表)
  id, statementNo(ST-YYYYMMDD-XXXX), customerId→customer, customerName(快照),
  date, attn, fax, from, currency, status, createdAt
statement_item
  id, statementId, seq, date, deliveryNo(送货单号), productName, spec,
  unit, quantity, unitPrice, amount, remark
```

**快照原则**：客户名/供应商名/品名/规格制单时写入明细，历史单据不随基础数据变更（与报价单 specLabels 快照一致）。
**金额**：`amount = quantity × unitPrice` 后端算好存库，导出直接用（订购单无价格字段）。

## 4. 库存流水迁移（关键）

`inventory_ledger.reason` 的 CHECK 约束扩展（**重建表迁移，保留全部历史数据**，与 product_categories 去 CHECK 同一手法）：

```
保留（历史兼容）：INITIAL, QUOTATION_CONSUME, QUOTATION_REVERSE, MANUAL_ADJUST
新增：          DELIVERY_CONSUME, DELIVERY_REVERSE, PO_RECEIVE, PO_REVERSE
```

`InventoryService` 调整：
- 保留 `consume`/`reverse` 原样（历史代码/数据兼容，报价单不再调用）。
- 新增 `receive()` 写 `PO_RECEIVE`（正 delta，`ref_type='purchase_order'`）→ `{ledgerId, remaining}`。
- 新增 `consumeDelivery()` 写 `DELIVERY_CONSUME`（负 delta，`ref_type='delivery_note'`）→ `{ledgerId, remaining}`。
- 新增 `reverseFlow()` 通用冲销：按原流水方向写反向 delta（`PO_REVERSE` 负 / `DELIVERY_REVERSE` 正），`reversal_of` 指向原流水并查重保证幂等。
- 所有加/扣库方法都不自行开事务，由单据 service 把"状态变更 + 多行流水"包进 `transaction()`。

## 5. 导出实现（全部 .docx）

- 后端 `docx` 包，每个单据一个 render 服务；固定信息（公司抬头/地址/电话/传真/制单人/条款文字/经营范围）写死在各自服务顶部常量，按样本复刻版式。
- 订购单：公司抬头 + "订 购 单" + TO/ATTN/DATE/FAX/FM/币制 + 8 列明细表 + 备注条款（6 条）+ 表尾备注。
- 送货单：抬头 + "送 货 单" + 客户名称/收货地址/出货单号/出货日期 + 10 列明细表 + 本页金额小计 + **大写金额** + 经营范围 + 制单/送货/收货签名栏。
- 对帐单：TO/ATTN/ATE/FAX/FROM/币制 + 9 列明细表 + 合计 + **人民币大写金额** + 客户回签/审核/作成 + "核对后烦请回签，TKS!!"。
- `amountToChinese()` 工具（数字 → 大写），对帐单/送货单共用，带单元测试。
- 沿用报价单 `GET /xxx/:id/docx` 的下载响应模式（Content-Disposition）。

## 6. 可选带入（不做强制外键）

- 送货制单：点"从报价单带入"→ 选一张 CONFIRMED 报价单 → 明细复制（品名/规格/单位/数量/单价/关联 productId），表头 `orderNo` 填报价单号、`sourceQuotationId` 记来源；客户从报价单带。带入后仍可自由增删改。
- 对帐制单：点"从送货单带入"→ 选一张 CONFIRMED 送货单 → 明细复制（日期/送货单号/品名/规格/单位/数量/单价/金额）；客户从送货单带。
- 订购制单：供应商从 supplier 下拉选（快照名字）；明细可关联 product（带出品名/规格）也可手工填。

## 7. 前端与导航

```
业务单据
  ▾ 报价单        未打回单据 /quotations · 打回单据 /quotations/rejected
  ▾ 订购单        未打回单据 /purchase-orders · 打回单据 /purchase-orders/rejected
  ▾ 送货单        未打回单据 /delivery-notes · 打回单据 /delivery-notes/rejected
  ▾ 对帐单        未打回单据 /statements · 打回单据 /statements/rejected
```
每个模块：列表（筛选 + 确认/打回/复制/打印/导出）+ 制单页（表头 + 明细增删 + 可选带入）+ 打印/导出页。
送货单确认返回 `lowStock` 时用现有弹窗卡片提醒补货。侧边栏 group 树形复用报价单现有结构与 `isActive` 精确匹配规则。

## 8. 执行计划（主人说"开始"后按批推进，每批 typecheck/build/测试）

1. **批次 1 · 数据层与后端逻辑**：schema 建三对表 + ledger reason 迁移；三模块 service/controller（CRUD、单号、状态、打回、可选带入、库存联动）；**报价单 confirm/reject 去掉库存调用**。
2. **批次 2 · 导出**：三个 docx render 服务 + 大写金额工具 + 导出端点。
3. **批次 3 · 前端**：三类模块的列表/制单/打印页 + 导航树 + lowStock 弹窗复用。
4. **批次 4 · 测试与验证**：改写报价单库存测试 → 送货扣库/订购加库/打回冲销/幂等/大写金额用例；typecheck + build + 测试 + 网页 http://127.0.0.1:5173 端到端冒烟。**不打包**（等主人明确说"打包"）。

## 9. 兼容性红线

- dev 库 `data/easyerp.db` 已有真实数据（报价单/客户/货品/历史流水），迁移只加不删；历史 `QUOTATION_CONSUME`/`QUOTATION_REVERSE` 流水原样保留。
- 老报价单的确认/打回历史状态不变；新逻辑只影响今后的操作。
- 依赖只装在项目内（pnpm workspace），不污染项目外任何目录。
- 测试继续走 Electron Node（`scripts/test.sh`，ABI 130）。
