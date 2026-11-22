# 业务变更 04 · 订购单备注条款改为客户自填（已实现 2026-11-21）

> 主人需求原文：订购单打印/导出里那段写死的备注（6 条条款 + 表尾「备注：1、本单货品请送本公司厂区…」）「由客户自己填写，不是默认值」。

## 1. 现状
- 6 条条款 + 表尾备注写死在 `common/document-constants.ts`（PURCHASE_ORDER_TERMS / PURCHASE_ORDER_FOOTNOTE），由 `PurchaseOrderService.getPrintData()` 塞进打印/导出数据，制单页无填写入口。
- purchase_orders 主表无对应列（明细 remark 是每行备注，不是表头条款）。

## 2. 方案与实现
- **数据**：purchase_orders 幂等 ALTER 加 `terms TEXT`、`footnote TEXT`（旧库兼容，新单默认 NULL）。
- **后端**：PurchaseOrderDto/Input/OrderRow 加字段；findRow/findAll SELECT 带上；create/update/duplicate 存取；toDto 返回；getPrintData 里 `terms` 按行拆成数组、`footnote` 原样，**留空时回退旧常量**（历史单据打印不变）。
- **前端**：types 的 PurchaseOrder/Input 加字段；制单页加「备注」卡片，两个 textarea（条款每行一条、表尾备注），默认空；编辑时回填。
- **打印/导出**：docx 与打印预览都从 getPrintData 取 terms/footnote，自动同步；条款打印时按 `1．2．3．` 编号（docx service 与预览页已有逻辑）。

## 3. 验证（实测）
- typecheck / build 过；测试 **70 全过**（purchase-order.e2e-spec 新增 1 用例：自定义备注生效 + 留空回退 6 条）。
- 运行时实测：建带自定义条款的订购单，print 返回 `terms:["我的条款A","我的条款B"]`、`footnote:"我的表尾备注"`，测试单已清理。
- 改完按约定重启了 3100 后端加载新 dist（未打包）。
