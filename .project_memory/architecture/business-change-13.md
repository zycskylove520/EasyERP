# 业务变更 13 · 品类/货品按供货·销售分域（已实现 2026-11-22）

> 状态：完成。typecheck/build 过、77 测试全过（新增 biz-type.e2e 3 用例）、运行时实测同名跨域共存+唯一约束迁移成功、重打包 exe。未确认 GUI 交互（无头环境）。
> 关键实现：biz_type(SUPPLY/SALE) 加到 categories/products；品类唯一约束 (name,biz_type)；**旧库迁移**——migrate() 检测建表 SQL 缺 'UNIQUE (name, biz_type)' 则重建品类表保留数据(id不变,旧数据归SALE)；addPoColumnIfMissing 补 biz_type 列。
> 视图：路由 /categories/:biz、/products/:biz（supply/sale），视图从 route.params.biz 算域；侧边栏拆 供货资料/销售资料 各2项；单据：订购单选SUPPLY货品，报价/送货选SALE（对帐单不选货品），库存页保持全部。
> 坑：旧库UNIQUE(name)会挡同名跨域——必须重建表改约束，只补列不够。

> 主人需求：产品品类分供货/销售两个子模块（供货=供货商提供的产品，销售=我方卖出的产品），货品管理同样划分。

## 主人拍板
1. 新增独立字段 `biz_type`（SUPPLY供货 / SALE销售），与现有 module（paper/plastic 材质分类）并存。
2. **供货/销售数据完全独立**：用户各自手动添加同种产品，不共享。同名品类/货品允许两边各一份 → 唯一约束改为 (name, biz_type)。
3. 侧边栏拆独立子页：供货品类/销售品类/供货货品/销售货品。
4. 单据过滤：订购单（采购）只选供货货品；报价/送货/对帐（销售）只选销售货品。

## 数据模型
- product_categories 加 `biz_type TEXT NOT NULL DEFAULT 'SALE'`；唯一约束从 UNIQUE(name) 改为 UNIQUE(name, biz_type)。
- products 加 `biz_type TEXT NOT NULL DEFAULT 'SALE'`。
- 货品归属品类时，biz_type 与品类保持一致（前端选品类自动带出，后端校验一致）。

## 后端改动
- schema：两表加 biz_type + 改唯一约束（幂等：新库直接定义；现有库因刚清库重建是空库，无需迁移——但为稳妥用重建表方式兼容）。
- category.service / product.service：DTO/Input/Row/CRUD 加 biz_type，所有查询支持按 biz_type 过滤（?bizType=SUPPLY/SALE），重名校验按 (name, biz_type)。
- controller：list/create/update 接收 bizType 参数。

## 前端改动
- types：Category/Product/Input 加 bizType。
- api：categoriesApi.list/create、productsApi.list/create 支持 bizType 参数。
- CategoriesView / ProductsView：加 URL query 或路由参数区分当前域；表单 bizType 随路由固定；列表只显示当前域。
- App.vue 侧边栏：基础资料组拆成 供货品类/销售品类/供货货品/销售货品 四项，路由 /categories/supply、/categories/sale、/products/supply、/products/sale。
- router：新增 4 路由（或带 query :bizType）。
- 单据制单页：订购单货品下拉只列 SUPPLY；报价/送货/对帐只列 SALE（productsApi.list 传 bizType）。

## 验证
- typecheck/build/测试；运行时实测供货销售各自独立、同名共存、单据过滤正确。未打包（等主人说打包）。
