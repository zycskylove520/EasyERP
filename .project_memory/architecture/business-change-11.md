# 业务变更 11 · 全字段输入校验（已实现 2026-11-21）

> 状态：完成。typecheck/build 过、76 测试全过。纯前端改动，后端未动无需重启。
> 落点：validation.ts（v-numeric 指令：只对 type=number 生效，过滤字母/特殊符号/多余小数点/负号，过滤后 dispatch input 同步 v-model；checkNumeric/checkRequired/firstError）；main.ts 全局注册指令。
> 应用：4 单据制单页（明细数量/单价 v-numeric + save 校验客户/品名/数量/单价）、库存调整（数量允许负数）、财务收付款金额(min 0.01)、货品管理（品名必填+数字规格校验）、品类（名称/模块必填+规格字段显示名）、公司/客户/供货商（名称必填）、各页动态规格 number 输入 v-numeric。
> 注意：仓库里全局指令无需在 SFC import，vue-tsc 不报未知指令错误。

> 主人需求：对所有填写字段增加校验，比如只允许数字的不允许输入其他类型。
> 主人拍板：数字字段=输入时拦截非法字符+提交时校验；必填项校验；页面顶部红条提示+阻止保存。电话格式/负数校验/字段下方提示未选（不做）。

## 1. 方案（统一工具，避免零散重复）
- 新建 `apps/web/src/validation.ts`：
  - `numeric` 自定义 Vue 指令：挂载到 `<input>`，监听 input 事件，只保留数字与一个小数点（可配置是否允许负号），非法字符即时剔除，并派发 input 事件保持 v-model 同步。
  - `checkNumeric(value, label, {required,min,allowNegative})`、`checkRequired(value,label)` 纯函数，返回错误字符串或 null。
  - `firstError(...results)` 取第一条错误。
- main.ts 注册全局指令 `v-numeric`。

## 2. 应用范围
### 数字字段（加 v-numeric + 提交校验）
- 单据明细：数量/单价（报价、订购、送货、对帐制单页）
- 库存调整：数量
- 财务收付款：金额
- 品类规格 number 字段（CategoriesView 动态输入、ProductsView 规格输入、各制单页展开的规格 number 输入）

### 必填字段（提交校验）
- 公司名称（CompanyInfo）、品类名称（Categories）、货品品名（Products）、客户名/供货商名、单据客户/供应商、明细品名等明显必填项。

## 3. 输入拦截实现要点
- 指令 input 处理：保留 `0123456789` 和一个 `.`，允许负号仅当配置（库存调整允许负数）；用正则替换 `value.replace(/[^\d.-]/g,'')` 再规整多个小数点。
- 因 `v-model.number` 与指令同时改值，需在指令里 `el.dispatchEvent(new Event('input'))` 触发更新；注意避免死循环（比较新旧值相等则不派发）。

## 4. 验证
- typecheck/build/测试；运行时浏览器实测输入字母被挡、空必填被拦。后端未动无需重启（纯前端）。
