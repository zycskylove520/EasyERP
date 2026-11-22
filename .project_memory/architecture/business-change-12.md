# 业务变更 12 · 移除全部旧库兼容 + 清库重建 + 全量模拟数据（2026-11-21）

> 主人要求：移除所有旧库兼容代码；数据库完全清空；自造模拟数据全面测试 ERP 核算；测完保留数据。主人拍板：库兼容与业务兼容**全删**。

## 1. 移除的旧库兼容代码
- schema.ts：全部重写为最终表结构——删掉 category 旧 CHECK 重建、inventory_ledger note/reason 的 ALTER+rebuild、quotation_items 的 addColumnIfMissing、purchase_orders/公司/送货/对帐/财务的 4 组 addPoColumnIfMissing ALTER。CREATE TABLE IF NOT EXISTS 保留（启动幂等，非旧库兼容）。
- 删除的旧列：quotation_items 的 spec/material；purchase_order_items 的 spec/material；delivery_note_items 的 part_no/spec；statement_items 的 spec。
- 状态：四类单据 status CHECK 去掉 WITHDRAWN；LedgerReason 去掉 QUOTATION_CONSUME/QUOTATION_REVERSE；inventory.service 删 consume()/reverse() 死方法。
- 业务兼容：删 withdraw() 端点/方法（报价/订购/送货/对帐）；删 statements 的 fromDelivery 端点/方法/StatementFromDelivery；删 dynamic-specs 的 legacySpecTextToSpecs 与 formatSpecSummary 第4参；删 purchase-order 的 PURCHASE_ORDER_TERMS/FOOTNOTE 回退。
- 前端：types 删 WITHDRAWN/spec/material/partNo/StatementFromDelivery；api 删 withdraw/fromDelivery；视图删旧字段回填/规格列/状态标签；style 删 badge-WITHDRAWN。
- 测试：更新 quotation/purchase-order/statement/full-chain 的过时断言。

## 2. 清库重建
- 停后端 → 删 data/easyerp.db{,-shm,-wal} → 重启建新库。verify：明细表无旧列、status 无 WITHDRAWN、6品类种子+公司信息自动写入。

## 3. 模拟数据（历史验证用，此后已清空且不再预置）
通过 HTTP API 造，覆盖：公司(前缀YLD)、3客户/2供货商/6品类货品、期初库存(纸管2000/纸箱500/圆纸片3000)、采购入库+打回、报价确认+打回、送货(客户A 11月 + 客户B 6-11月各1单 + 打回1 + 草稿1，共9张)、对帐单2张、收付款3笔(SK×2/FK×1)。
- 核算验证：库存纸管990、纸箱450、圆纸片3000；流水16条（INITIAL/PO_RECEIVE/PO_REVERSE/DELIVERY_CONSUME/DELIVERY_REVERSE齐全）；财务应收225/应付30/净额195；对帐打回自动失效+恢复验证通过；所有打印/docx端点200。

## 4. 验证
- typecheck/build 过；74 测试全过；模拟数据生成+核算 32项 + 最终核对 34项全过。未打包。

## 5. 经验
- better-sqlite3 是 Electron ABI130 编译，直接操作 db 必须用 Electron Node（ELECTRON_RUN_AS_NODE=1 electron.exe），普通 node 会 DLOPEN 失败。
- 造数据脚本URI端点注意：对帐单金额=当月经确认送货单金额之和，收款不能超过未结金额（后端校验）。
