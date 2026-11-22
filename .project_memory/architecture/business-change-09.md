# 业务变更 09 · 概览模块（图表看板）（已实现 2026-11-21）

> 状态：完成。typecheck/build 过、71 测试全过、运行时实测 GET /overview 返回完整结构（KPI/送货趋势12月连续/单据状态/客户排行/流水趋势/负库存/畅货TOP），已重启 3100 后端。未打包。
> 注意：库存品类饼图最初因 `HAVING SUM(delta)>0` 在全负库存库里为空，主人反馈看不到信息后修复——改为 `ABS(SUM(delta))` 作扇区值（ECharts 饼图不支持负值）+ actual 保留实际正负供标注，负值扇区红色、tooltip 标「缺货」，不再过滤负值。typecheck/build/测试过，运行时实测 2 项负库存品类均显示。概览 chunk 因 echarts 约1.1MB，但走路由懒加载，仅进概览页才下载。
> 落点：后端 overview 模块（service 纯 SQL 聚合，口径同库存 SUM(delta)）；前端 echarts + OverviewView.vue（6图表+KPI+负库存表，时间6/12/24月切换）；路由 /overview 设为首页，侧边栏顶部「概览」分组。

> 主人需求：新增概览模块，由各种图标（图表）组成，专门看各种信息，饼状图/折线图等。要求先制定方案、告知应展示哪些细节。

## 1. 主人拍板
- 图表库：**引入 ECharts**（前端新增 echarts 依赖）。
- 范围：**KPI 卡片 + 7 个图表全做**。
- 时间：默认近 12 个月，可切换 6月/12月/全部。

## 2. 数据与图表设计（基于现有 schema）
### 顶部 KPI 卡片
货品数/品类数、客户数/供货商数、当前库存总量+负库存预警数、本月报价/送货/对帐单数。

### 7 个图表
1. 库存数量按品类分布（饼图）：products JOIN inventory_ledger 的当前库存，按品类汇总。
2. 送货金额月度趋势（折线图）：近 N 月，CONFIRMED 送货单按 delivery_date 月份 SUM(amount)。
3. 单据状态分布（堆叠柱状）：四类单据各自 DRAFT/CONFIRMED/REJECTED 数量。
4. 客户对帐金额排行 TOP（横向柱状）：statements.items 按 customer SUM(amount) 取前 N。
5. 库存流水出入库趋势（柱状按 reason）：inventory_ledger 按月按 reason SUM(delta)。
6. 负库存预警列表（表格）：当前库存<0 的货品。
7. 畅出货品 TOP10（柱状）：delivery_note_items 按 product_name SUM(quantity) 取前10。

## 3. 技术实现
- 后端：新增 `overview` 模块（controller/service/module），`GET /overview?months=12` 一次性聚合返回所有数据（一个 SQL 集合）。注册到 app.module。当前库存 = inventory_ledger 按 product_id SUM(delta)；只统计有流水的货品。
- 前端：安装 echarts；api.ts 加 overviewApi.get(months)；types.ts 加 OverviewData 等类型；新增 OverviewView.vue（KPI 卡片网格 + echarts 图表组件用 ref + onMounted/init + setOption + 窗口 resize）；路由加 `/overview` 并设为首页（redirect 改 /overview）；侧边栏 navGroups 顶部加「概览」（普通链接）。
- 图表颜色统一、空数据友好提示；时间切换用 select 绑定 months，重新拉数据。

## 4. 验证
- typecheck/build/测试全过；运行时实测 GET /overview 返回结构、图表页渲染；重启 3100 后端。未打包。
