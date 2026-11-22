# 业务变更 08 · 侧边栏按业务流程重新划分（2026-11-21）

> 主人："左侧的侧边栏是不是重新划分一下比较好？" 拍板：按业务流程重排 + 每张单据侧边栏直接加"新建"入口 + 分组命名由我设计。

## 1. 新结构
```
基础资料：产品品类 / 货品管理 / 供货商 / 客户
采购业务：订购单 ▸ 单据列表 / 新建订购单 / 打回单据
销售业务：报价单 ▸ 单据列表 / 新建报价单 / 打回单据
          送货单 ▸ 单据列表 / 新建送货单 / 打回单据
          对帐单 ▸ 单据列表 / 新建对帐单 / 打回单据
库存管理：库存台账 ▸ 当前库存 / 库存调整 / 库存流水
系统设置：公司信息
```
- "未打回单据"改名"单据列表"。
- 每张单据加"新建XX单"直达入口（/xxx/new）。
- 公司信息从基础数据移到系统设置。
- 按业务流转顺序：基础资料→采购→销售→库存→系统。

## 2. 实现（纯前端 App.vue）
- navGroups 重排，expandKey 不变（inventory/quotations/purchase-orders/delivery-notes/statements），新增 /xxx/new 子项。
- isActive：单据列表项继续覆盖编辑/打印（docBases 逻辑）；新增的 /xxx/new 项在 route.path === `${base}/new` 时高亮，且此时列表项不高亮（互斥）。
- expandKeyOfPath 不变（new 路径也 startsWith base）。
- 路由无需改（new 路由已存在）。

## 3. 验证
- 前端 typecheck/build 过。纯前端改动，后端未动无需重启，5173 热更新刷新即生效。
- 实现落点：仅改 App.vue 的 navGroups（重排+新建入口+改名）+ isActive（new 与列表互斥高亮）；router 的 new 路由已存在无需改，expandKeyOfPath 因 startsWith 自动适配 /xxx/new。
