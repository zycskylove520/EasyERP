# 业务变更 07 · 对帐单重构：按客户+月份汇总送货单（已实现 2026-11-21）

> 状态：完成。typecheck/build 过、**71 测试全过**（新增 statement 汇总用例）；运行时实测客户+月份只汇总当月 CONFIRMED 送货单（草稿/其它月排除）、ATTN 从客户带出、规格拍平正确。已重启 3100 后端。未打包。
> 实现落点：StatementService.fromCustomerMonth(customerId, month)；controller GET /statements/from-customer-month；StatementModule 导入 CustomerModule；前端 StatementFormView 生成区（客户+月份→生成明细）、api/types 加对应接口。参考 .doc 内容已提取（表头 TO/ATTN/DATE/FAX/FROM/币制 + 明细9列 + 合计大写 + 回签），现有打印/Word 已符合。
> 清理注意：确认状态送货单不能用 DELETE API 删（只允许草稿），运行时测试数据残留需用 Electron Node 直连 db 清理（delivery_note_items/inventory_ledger/delivery_notes/customers）。

> 主人指出对帐单模块原理错误，给出正确流程，并参考其提供的对帐单样本文档（已读取内容；样本为私有资料，不入库）。
> 主人确认：“公司”＝对帐客户（TO 对象，非本公司主体）；需求就两点。

## 1. 正确流程
1. 创建对帐单：先选**客户** + **制单月份**。
2. 系统自动汇总该客户「**出货日期在所选月份、状态 CONFIRMED**」的所有送货单明细，生成对帐单（参考 .doc 格式）。

## 2. 主人拍板的细节
- 送货单范围：只 CONFIRMED；打回/回撤/草稿**不计入**。
- 月份依据：送货单的**出货日期 deliveryDate**。
- ATTN：从客户档案 contact 带出，可手改；FROM 取公司信息制单人，币制取公司信息。

## 3. 参考 .doc 结构（已提取）
- 表头：`TO：客户  ATTN：联系人  DATE：日期` / `FAX：  FROM：制单人  币制：RMB`
- 明细列：日期 | 送货单号 | 品名 | 规格 | 单位 | 数量 | 单价 | 金额 | 备注（一送货单可占多行）
- 合计 + 人民币大写金额 + 客户回签/审核/作成 + “核对后烦请回签，TKS！！”
- 现有对帐单打印/Word 已是这个结构，直接沿用。

## 4. 实现
### 后端
- StatementService 新增 `fromCustomerMonth(customerId, month: 'YYYY-MM')`：
  - 查该客户该月 CONFIRMED 送货单（用 DeliveryNoteService.findAll 后 JS 过滤，或直查 SQL）。
  - 每张送货单每条明细 → StatementItemInput：itemDate=出货日期、deliveryNo、productName、spec（specs 拍平为 label=value，老 spec 文本回退）、unit、quantity、unitPrice、remark。
  - 表头返回 customerId/customerName、attn（客户 contact）、fax（客户 phone？参考里 FAX 空，取客户档案无 fax 字段→留空）、from（公司 maker）、currency（公司 currency）、statementDate（月份转日期，如 YYYY-MM-01 或当天？主人未明说，用所选月第一天）。
  - 新 DTO `StatementFromCustomerMonth`。
- StatementModule imports CustomerModule（拿 CustomerService）；StatementService 注入 CustomerService、DeliveryNoteService（已有）、CompanyInfoService（已有）。
- controller 加 `GET /statements/from-customer-month?customerId=&month=`，保留旧 from-delivery 兼容。

### 前端
- types 加 StatementFromCustomerMonth；api.ts statementsApi 加 `fromCustomerMonth`。
- StatementFormView：把“可选带入（从送货单）”区改为“选择客户 + 月份 → 生成对帐单明细”；客户下拉带出 customerName/attn；生成按钮调新接口，替换 items + 表头。
- 明细表、打印/预览沿用现有。

## 5. 验证
- typecheck/build/测试全过；运行时实测：某客户某月多张已确认送货单汇总成对帐单明细，草稿/打回不计入；重启 3100 后端。
