# 业务变更 10 · 财务管理模块（已实现 2026-11-21）

> 状态：完成。typecheck/build 过、**76 测试全过**（新增 finance.e2e 5 用例）；运行时实测应收/应付/summary 正确，登记收款500→未收15500→15000、删除恢复15500。已重启 3100 后端。未打包。
> 前置发现：订购单明细原本无单价/金额（应付无金额来源），主人拍板补上——purchase_order_items 加 unit_price/amount（幂等ALTER），后端 service + 前端制单页加单价列；历史订购单金额为0（补列前建的），新单据有金额。
> 落点：后端 finance 模块（finance_records 表 + service 聚合，关键规则=计算已收/已付时 JOIN 单据并过滤 status=CONFIRMED，打回自动失效、重新确认自动恢复，validateInput 校验金额≤未结）；前端 3 视图（财务概览/收款管理/付款管理，ECharts 趋势）+ financeApi/types；侧边栏「财务管理」分组。
> 新增通用错误 BadRequestError(400) 到 common/errors.ts。

## 补充（同日）：收付款记录加三个字段 + 删旧单
- 主人补选之前未选的三个字段：①自动生成收付款单号 record_no（收款 SK- / 付款 FK- + 日期 + 4位序号）②经手人 handler ③发票号 invoice_no + 开票状态 invoice_status（未开票/已开票/不需要）。schema 幂等 ALTER 加列，后端 DTO/Input/Row/SQL + 前端表单/列表全链路。typecheck/build/测试过，运行时实测单号 SK-20261121-8945 等字段正确回显。
- 「已确认订购单无法登记付款」根因：那张旧单是补金额字段前建的，金额=0→balance=0→按钮 disabled。主人决定删除旧单、不兼容旧单（当前均模拟数据）；已用 Electron Node 脚本（关外键）删除 PO-20261121-6538 及其流水/明细/财务记录。新单有金额即可正常登记。

> 主人需求：增加财务管理模块，先分析方案。核心规则：**只有已确认的对账单才计入账**。
> 主人拍板：应收+应付都做；打回自动作废关联收付款（重新确认恢复）；记录字段=日期+金额+方式(下拉)+备注。

## 1. 现状分析
- 对帐单 statements：客户+金额明细+状态(DRAFT/CONFIRMED/REJECTED/WITHDRAWN)。已确认=应收账款。
- 订购单 purchase_orders：供应商+状态。已确认=应付账款来源。
- **完全没有**收付款/发票/账户等财务数据，需从零建表。
- 当前真实数据：1 张已确认对帐单(B客户 15500)，2 张订购单(1确认1打回)。

## 2. 核心设计
### 数据模型（新建 1 张表）
`finance_records`：
- id, type('RECEIVE'收款/'PAY'付款), ref_type('STATEMENT'/'PURCHASE_ORDER'), ref_id, party_name(客户/供应商快照), amount, record_date, method(现金/转账/微信/支付宝/银行/其它), remark, created_at。
- 不存"已收金额"字段——应收/应付实时计算，收款记录是唯一事实来源。

### 关键规则（打回自动作废的实现）
- 计算某单"已收/已付合计"时，**只统计关联单据当前 status='CONFIRMED' 的收款记录**（JOIN statements/purchase_orders 过滤 status）。
- 因此对帐单打回→自动不计入财务；重新确认→自动恢复。无需写作废/恢复逻辑，账永远对齐。
- 登记收付款时前端只列 CONFIRMED 单据，后端也再校验一次 ref 单据必须 CONFIRMED。

### 三个派生量
- 应收 = Σ(CONFIRMED 对帐单金额) − Σ(有效收款)；按客户分组。
- 应付 = Σ(CONFIRMED 订购单金额) − Σ(有效付款)；按供应商分组。
- 净额 = 应收 − 应付。

## 3. 模块页面（3 子页，侧边栏分组「财务管理」）
1. 财务概览：应收总额/应付总额/净额/本月已收已付 KPI + 收付款趋势折线图（复用 ECharts）。
2. 收款管理：列出已确认对帐单（客户、金额、已收、未收、状态），登记收款（部分/多次）。
3. 付款管理：列出已确认订购单（供应商、金额、已付、未付），登记付款。

## 4. 技术实现
- 后端 finance 模块：service（CRUD + 汇总）+ controller + module；新建表 schema 幂等迁移。
  - GET /finance/summary —— KPI + 趋势
  - GET /finance/receivables —— 应收列表（已确认对帐单 + 已收/未收）
  - GET /finance/payables —— 应付列表（已确认订购单 + 已付/未付）
  - GET /finance/records?type=&refId= —— 收付款记录
  - POST /finance/records —— 登记收付款（校验 ref 单据 CONFIRMED、金额>0、不超过未结金额）
  - DELETE /finance/records/:id —— 删除记录
- 前端：financeApi/types；3 个视图；router 加路由；侧边栏加「财务管理」分组。
- 金额 = 单据 items 的 amount 之和（SQL SUM）。

## 5. 验证
- typecheck/build/测试全过；运行时实测：登记收款后应收减少、删除后恢复、对帐单打回后应收不计入、重新确认恢复；重启 3100。未打包。
