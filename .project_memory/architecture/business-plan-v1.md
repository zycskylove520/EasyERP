# EasyERP 业务模块方案 v1.1（已吸收主人第一轮反馈，待最终确认）

> 日期 2026-11-21。依据：主人业务清单 + 报价单样本 + 主人两轮反馈。
> v1.1 变更：库存改为流水账模型（支持制单扣减/打回回撤）、规格全面预留扩展、数据库选型收敛、补分批计划。
>
> **执行状态**：批次 1~4 已完成（2026-11-21，typecheck/build/19 测试/前后端运行时冒烟全过）；批次 5 待执行。
> 批次 4 实现补充：前端不引 UI 库（轻量），vue-router 4.x（匹配 Vite6，5.x 有 peer 冲突）。`api.ts` 统一 fetch 封装走 /api 代理。货品表单按品类 spec_schema 动态渲染，隐藏 reserved 字段。报价单明细可选关联货品（自动带出品名/规格）用于扣库；打印页 A4 样式 + window.print()。
> 批次 2 实现补充：流水表加 `note` 列（幂等 ALTER 兼容早期库）。期初每货品仅一次（事务+查重）。
> 批次 3 实现补充：quotation_items 补 `product_id`（扣库所需）与 `reversal_ledger_id`（冲销追踪）列。扣减/冲销方法落在库存服务（`consume`/`reverse`），由报价单服务在事务内调用。确认时库存不足整体回滚。幂等靠 `reversal_of` 查重。测试用 `EASYERP_DB_FILE` 让每个 worker 用独立库，解决并行迁移冲突与数据污染；迁移 ALTER 加 duplicate-column 兜底。

---

## 0. 需求与解读（更新）

| # | 主人原话/反馈 | 定稿解读 |
|---|---|---|
| 1-2 | 纸制品 4 类 + 塑料 2 类 | 6 个产品品类，规格参数各异 |
| 3 | 供货商名称 + 经营哪些类别货品 | 供货商表 + 供货商↔品类多对多 |
| 4 | 「库存台账，制单后自动扣除对应数量，但要支持打回和回撤」 | **库存 = 流水账（ledger）**：变动记流水，当前库存=流水累加；打回/回撤记反向流水冲销 |
| 5 | 客户表指明送货客户 | 客户表，报价单 TO 指向它 |
| 6 | 报价单参数制单时自由选择填写 | 主表+明细，字段照样本，下拉可选可编辑 |
| 反馈2 | 规格字段预留后续增加 | 规格用 JSON + 品类 spec_schema 描述，加字段只改 schema 不改表 |
| 反馈3 | 更轻量、可移植、内置数据库 | 见 §4 选型：better-sqlite3（单文件、零服务、随软件走） |
| 反馈4 | 安排计划分批执行 | 见 §6 分批计划 |

---

## 1. 核心设计决策

### 决策 A：品类 + 规格两层，规格全预留（吸收反馈 2）
- `product_category` 品类字典：6 条，每条带 `spec_schema`（JSON，描述该品类有哪些规格字段、类型、单位）。
- `product.specs` 用 JSON 存实际值。
- **扩展性**：加新规格字段 = 改该品类的 `spec_schema` 一行；旧货品缺该字段按空处理，不破坏数据。前端按 schema 动态渲染表单。
- 6 类初始 schema：
  - 纸管 / 塑料管芯：`φ数, 长度, 厚度, 内径`（单位 MM）
  - 纸箱：`长, 宽, 高`（MM）+ `材质`
  - 圆纸片 / 圆纸板(圆板卡) / 塑料圆卡：`直径, 厚度`（MM，推断，待确认）
  - 所有品类额外预留通用字段：`颜色, 克重, 备注`（先建 schema 但前端可隐藏）

### 决策 B：品类是统一字典，三处共用
产品归属、供货商经营范畴、报价单筛选，统一引用 `product_category`。

### 决策 C：库存 = 流水账，支持扣减/打回/回撤（吸收反馈 1，本次最重要变更）
**不存"当前数量"这个可变数字作为真相**，而是：
- `inventory_ledger`（库存流水）：每条记录 = 一次库存变动。
  - 字段：`id, productId, delta(增减数), reason(原因枚举), refType(来源单据类型), refId(来源单据id), createdAt`
  - `reason`：`INITIAL`(期初) / `QUOTATION_CONSUME`(制单扣减) / `QUOTATION_REVERSE`(打回/回撤冲销) / `MANUAL_ADJUST`(手工调整)
- **当前库存** = 该货品所有流水 `delta` 之和（SQL `SUM(delta)` 或维护一张只读汇总视图）。
- **制单扣减**：报价单确认/出库时，为每个明细行写一条负 `delta` 流水，`refId` 指向该明细/单据。
- **打回/回撤**：写一条正 `delta` 冲销流水，`refType/refId` 指回原单，并标记原状态。**不改历史流水**——账目永远可追溯"哪天因为哪张单少/多了多少"。
- **事务保证**：扣减与单据状态变更必须同一事务（`better-sqlite3` 的 `transaction`），杜绝"单子生成了但库存没扣"或反之。
- 幂等：冲销流水带 `reversalOf` 指向原扣减流水 id，防止重复打回导致库存多加。

> 这个模型同时天然满足反馈 2：流水表加字段容易，历史数据不受影响。

### 决策 D：报价单 = 主表 + 明细（照样本）
- 主表字段完全对齐样本：`quoteNo, customerId, date, currency, from, attn, fax, validUntil, paymentTerms, shippingTerms, remarks, status, createdAt`
- 明细：`seq, productName, spec, material, unit, unitPrice, quantity, deliveryDate, remark`
- `status` 驱动库存：`DRAFT`(草稿，不动库存) → `CONFIRMED`(确认，扣库存) → `REJECTED/WITHDRAWN`(打回/回撤，冲销还库)。
- 参数自由填写：品名/品类/材质走下拉可编辑，其余自由填。

---

## 2. 数据模型（实体关系）

```
product_category (品类字典)
  id, name, module(paper|plastic), spec_schema(JSON), sort, createdAt
        │ 1
        │ N
product (货品/SKU)                supplier (供货商)
  id, categoryId→品类, name,      id, name, contact, phone, address,
  specs(JSON), unit, createdAt         categories(N↔N 品类), createdAt
        │ 1
        │ N
inventory_ledger (库存流水)             │
  id, productId→货品, delta,            │
  reason, refType, refId,               │
  reversalOf, createdAt                 │
                                        │
customer (客户/收货方)                   │
  id, name, contact, phone, address     │
       │ 1                              │
       │ N                              │
quotation (报价单主表) ◄─────────────────┘
  id, quoteNo, customerId, date, currency, from, attn, fax,
  validUntil, paymentTerms, shippingTerms, remarks, status, createdAt
       │ 1
       │ N
quotation_item (报价明细)
  id, quotationId, seq, productName, spec, material,
  unit, unitPrice, quantity, deliveryDate, remark,
  inventoryLedgerId(扣减流水id, 用于精确冲销)
```

## 3. 模块与 API

| 模块 | 端点 | 说明 |
|---|---|---|
| 品类 | `/categories` | 列表、详情；含 spec_schema |
| 货品 | `/products` | CRUD + 按品类筛选 |
| 供货商 | `/suppliers` | CRUD + 设置经营品类 |
| 库存 | `/inventory` | 当前库存汇总 / 流水列表 / 手工调整 |
| 客户 | `/customers` | CRUD |
| 报价单 | `/quotations` | CRUD + 状态流转(确认扣库/打回冲销) + 打印数据 |

## 4. 数据库选型（吸收反馈 3）

候选对比：
- **better-sqlite3（选它）**：单文件 `.db`，随软件走；同步 API + 完整事务（库存冲销必须）；Node 生态最成熟。原生模块一次性装好即稳定（Node 已锁在项目内）。
- sql.js：纯 WASM 无原生依赖，但需手动持久化、无原生事务便利。
- lowdb：纯 JSON 最轻，但无事务/并发，库存流水场景不合适。

**结论：better-sqlite3**。数据库文件放项目内 `data/easyerp.db`（gitignore 排除），完全自包含、随软件拷贝即走。
> 待验证：项目内 Node 22 上能否顺利安装（预编译二进制）——主人确认方案后实测，装不上再退回 sql.js。

## 5. 前端页面
侧边栏分组：基础数据（品类/货品/供货商/客户）、库存（当前库存/流水）、报价单（制单/打印）。
报价单页：表头 + 可增删明细行 + 备注条款 + 状态按钮（确认/打回/回撤）。

## 6. 分批执行计划（吸收反馈 4）

> 每批都「编码 → typecheck/build → 测试 → 给你看」再进下一批。

**批次 1 · 地基与基础数据**
- 接入 better-sqlite3 + TypeORM（或原生 SQL 封装，见下），建表迁移机制。
- 品类字典（6 类 + spec_schema 种子数据）、货品 CRUD、供货商 CRUD、客户 CRUD。
- 交付：基础数据能增删改查，品类含规格模板。

**批次 2 · 库存流水**
- inventory_ledger 表、当前库存汇总查询、期初/手工调整。
- 交付：能给货品设期初库存、看当前库存和流水。

**批次 3 · 报价单 + 库存联动**
- 报价单主表/明细 CRUD、状态流转、确认扣库/打回回撤冲销（事务）。
- 交付：制单→确认自动扣库存→打回自动还库，端到端跑通。

**批次 4 · 前端页面 + 打印**
- Vue3 页面：基础数据、库存、报价单制单与预览打印。
- 交付：可在界面完成全流程。

**批次 5 · 完善**
- 备注条款模板、报价单号生成规则、输入校验、测试补齐、README。

## 7. 待确认（本次反馈后已大幅收敛）
- Q-规格：圆纸片/圆纸板/塑料圆卡的「直径+厚度」推断是否对？（不影响架构，只影响 schema 种子）
- Q-ORM：TypeORM 还是直接用 better-sqlite3 的轻量封装？后者更少依赖、更贴合"轻量可移植"，我倾向后者。
- 其余（BOM 含义、数据库选型、节奏）主人已明确，不再问。
