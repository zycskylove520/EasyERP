# EasyERP 工程记忆索引

> 由 engineering-craft skill 建立。只存规范与契约，不存会话流水。每次进入工程先读本文件，再按需取下层。

## 项目一句话
EasyERP —— 从零新建的企业 ERP 系统，技术栈 NestJS + Vue3/Vite，pnpm workspace 单仓多包。首版只搭骨架与依赖，业务模块待主人后续指定。

## 地图
- `project.md` —— 定位、技术栈、版本基线、依赖约束。
- `architecture/overview.md` —— 分层/模块/调用链/数据流。
- `architecture/decisions.md` —— 关键决策与理由、取舍。
- `conventions/naming.md` —— 命名规范。
- `conventions/practices.md` —— 目录约定、格式/lint/测试约定。
- `open-questions.md` —— 未决问题、待协商事项。

## 当前阶段
- **2026-11-23 ★现状契约（准备开源）**：项目内不再预置任何业务/公司默认数据——删除 `seedCategories`/`seedCompanyInfo` 及所有真实公司名/人名/电话/地址硬编码（含前端打印页、单据常量、构建产物）。品类与公司档案一律由使用者自行录入。配套：`company-info` PATCH 改 upsert 以支持空库首次录入；测试用 `test/test-seed.ts` 自建固件（纸管品类+空公司档案），不依赖生产种子；`.gitignore` 排除 `data/`、`.tmp/`、打包产物；`pnpm-workspace.yaml` 的 onlyBuiltDependencies 补 better-sqlite3。验证：typecheck/build 过、**77 测试全过**、全项目隐私复扫零命中（源码+dist）。
- 2026-11-21 上午：空目录起步，搭好 pnpm workspace 自包含工具链（Node22+pnpm10 全在项目内）。
- 2026-11-21 下午：主人给出业务清单；方案 v1.1 定稿（`architecture/business-plan-v1.md`）。
  - **批次 1（基础数据）已完成**：better-sqlite3 接入、6 类品类种子+spec_schema、货品/供货商/客户 CRUD；typecheck/build/5 测试/冒烟全过。
  - **批次 2（库存流水）已完成**：流水账服务（期初/手工调整/当前库存 SUM/流水查询+筛选）、note 列兼容迁移、6 个新测试；typecheck/build/11 测试/端到端冒烟（200-50=150）全过。
  - **批次 3（报价单+库存联动）已完成**：报价单 CRUD + 单号 QT-YYYYMMDD-XXXX + 状态流转（DRAFT→CONFIRMED 扣库 / →REJECTED·WITHDRAWN 冲销还库）+ 打印数据 + 幂等防重复打回；库存不足事务回滚。quotation_items 补 product_id/reversal_ledger_id 列。测试隔离改造（每 worker 独立 DB，`EASYERP_DB_FILE` 覆盖）。typecheck/build/**19 测试**/端到端冒烟（期初50→扣20=30→打回=50）全过。
  - **批次 4（Vue3 前端）已完成**：vue-router4 + 自包含 api.ts 封装 + 7 个视图。
- 2026-11-21 晚：**全面转 Electron**（主人决定，不再要网页版）。架构：Electron33 + 内置 NestJS 后端 + better-sqlite3(ABI130) + 数据库存用户目录。详见 `architecture/electron-packaging.md`。
- 2026-11-21：**业务变更01 品类自定义**（详见 `architecture/business-change-01.md`）：品类可增删改、模块可自定义（schema 去掉 CHECK，旧库自动迁移）、规格字段可增删、有货品禁止删除。测试改由 Electron Node 跑（`scripts/test.sh`）。
- 2026-11-21：**后续 UI/业务调整**（测试阶段走网页，不打包）：明细规格按品类动态列、材质并入规格字段（quotation_items 加 specs JSON 列）、库存允许负并在确认后返回 lowStock 弹窗提醒补货、库存手工调整改目标值模式、品类序号自动维护、Word 导出（docx 库，纯单据）。27 测试通过，端到端验证 Word 有效(PK头)/规格展开/负库存提醒。
- 2026-11-21：**库存台账拆三子页**（当前库存/库存调整/库存流水），侧边栏库存改树形父节点，isActive 精确匹配互斥。typecheck/路由 200 过。
- 2026-11-21：**三张新单据方案定稿** `architecture/documents-design-draft.md`（v1.0，主人 8 条拍板）：扣库从报价移到送货、四类单据都可打回、订购确认加库、历史流水不动、三类全导出 docx、大写金额自动生成、可选带入、抬头写死。
- 2026-11-21：**批次1（三单据数据层与后端）完成**：schema 建 purchase_orders/delivery_notes/statements 三对表 + ledger reason 重建表迁移（QUOTATION 历史流水原样保留，实测 dev 库 QUOTATION_CONSUME/REVERSE 各1条仍在）；库存服务新增 receive/consumeDelivery/reverseFlow；报价单 confirm/reject 去掉库存调用；三模块 CRUD/单号(PO/DN/ST)/状态/打回/可选带入；订购确认加库、送货确认扣库+lowStock。测试改写：报价单 8 用例改为不扣库，新增 交付/订购/对帐 14 用例，**全量 44 测试通过**，typecheck/build 过，真实 dev 库迁移实测通过。批次2(导出docx)/批次3(前端)/批次4(完整测试)待做。
- 2026-11-21：**批次2（三单据 docx 导出）完成**：金额大写工具 `common/amount-to-chinese.ts`（15 组单测）；docx 共用基类 `common/docx-support.ts` + 固定常量 `common/document-constants.ts`（抬头/电话/条款写死）；三个 render 服务 + `GET /xxx/:id/docx` 端点；订购单按样本表头8列+6条条款，送货单10列+小写计+大写金额+签名栏，对帐单9列+合计+大写金额+回签栏。验证：typecheck/build 过，测试 **63 全过**（新增 15+3 导出）；真实 dev 库导出对帐单 docx（PK头/10KB）经 python-docx 打开验证表格9列+明细+大写"玖佰伍拾元整"正确，测试数据已清理。批次3(前端页面+导航)/批次4 待做。
- 2026-11-21：**批次3（前端三单据页面+导航）完成**：types/api 加三单据 DTO、封装、通用 downloadDocxFile；router 加 12 路由（列表/打回/制单new+edit）；三个列表页（筛选/确认/打回/复制/导出Word）+ 三个制单页（表头/明细增删/供应商·客户·货品下拉/可选带入：送货←报价、对帐←送货）；通用 RejectedDocsView 按路径前缀复用三类打回列表；送货确认 lowStock 弹窗复用报价单卡片；App.vue 业务单据树加订购/送货/对帐三个可展开父节点（未打回/打回），isActive 统一覆盖各 new/edit 但排除 rejected；修报价单制单页过时"确认扣库"文案；InventoryLedgerView reasonLabel 补 4 个新枚举。typecheck/build 过，9 新路由 200（hash 路由，实际渲染待浏览器验证）。批次4 待做。
- 2026-11-21：**批次4（收尾+全链路验证）完成**：①新增需求——侧边栏刷新后默认折叠所有子模块，只展开当前路由所属模块（App.vue expanded 默认空 + expandKeyOfPath 初始化 + watch 路由切换自动展开）；②全链路冒烟测试 `full-chain.e2e-spec.ts`：一个货品贯穿 期初100→订购+20=120→报价确认不动=120→送货-30=90→对帐从送货带入+导出docx有效→超量送货-200=-110触发lowStock→打回送货回90→打回订购回70，并核对流水原因齐全且报价未产生 QUOTATION_CONSUME。验证：typecheck/build 过，**64 测试全过**（11 suites），服务 health/vite 200。**三单据四批全部完成，未打包（等主人明确说打包）。**
- 2026-11-21：**新增需求（报价 ATTN 默认 + 公司基础信息模块）完成**：①报价单制单页选客户后 ATTN 默认填客户名（可改）；②公司信息做成单条档案(company_info id=1)——建表+GET/PATCH API+前端维护页(基础数据组)；四个 docx 导出服务(报价/订购/送货/对帐)注入 CompanyInfoService，抬头/地址/电话/制单人/经营范围/币制从档案读取，不再写死；订购/对帐/报价制单页 FROM/FM/币制默认值从档案带出。测试新增 company-info.e2e-spec.ts（含解压 docx 验证改公司名后抬头生效，用 zlib.inflateRawSync 提取 document.xml）。typecheck/build 过，**66 测试全过**。未打包。（注：原默认公司种子已于 2026-11-23 移除，见本文件顶部现状条目。）
- 2026-11-22：**品类/货品按供货·销售分域完成**（详见 `architecture/business-change-13.md`）：新增 biz_type(SUPPLY/SALE)，与module材质分类并存；供货/销售数据完全独立、各自添加同名产品；品类唯一约束改(name,biz_type)；旧库重建表迁移保留数据；侧边栏拆供货品类/供货货品/销售品类/销售货品四子页(路由/categories/:biz)；单据订购单选SUPPLY、报价/送货选SALE，库存保持全部。typecheck/build过、77测试全过(新增3)、运行时实测同名跨域共存成功、重打包exe。
- 2026-11-22：**批量修复 7 项用户反馈**（详见 `architecture/bugfix-batch-02.md`）：①供货商经营品种改自由文本(business_types) ②库存数量step=any ③付款备注+⑥输入框失焦不可输入=Windows Electron CalculateNativeWinOcclusion bug，命令行开关关闭+去通配scrollbar CSS ④真正导出PDF(preload+IPC+printToPDF，4打印页加按钮) ⑤单据打回自动删除关联收付款记录 ⑦代码签名无证书需商业购买(已如实说明)。typecheck/build过、74测试全过、重打包exe验证健康200/preload在asar/供货商正确。无GUI环境未能实测输入框/PDF对话框/SmartScreen，需用户真机确认。
- 2026-11-21：**exe 白屏修复 + 图标/author 完成**（详见 `architecture/build-release-01.md` §5）：白屏根因=docx 只在 apps/api 声明且为 pnpm 符号链接，electron-builder 不跟随→asar 缺 docx→后端崩溃。修复：根 package.json 加 docx 依赖+pnpm install、build.files 加 apps/api/node_modules、asarUnpack 加 web/dist、main.cjs 加载日志；图标=纯Node生成渐变E图标 build/icon.png，配 author+icon+窗口图标。重建验证：health 200/首页HTML/JS 200/docx加载成功，白屏解决。产物 release 安装包85M。经验：pnpm符号链接依赖必须声明在根 deps 才会被打包。
- 2026-11-21：**首次干净构建 exe 完成**（详见 `architecture/build-release-01.md`）：清空模拟数据、删除全部缓存/临时/旧构建/旧dist（保留 .pnpm-store/node_modules/.tools），build-exe.sh 三步（build+electron-rebuild+electron-builder）成功。产物 `release/EasyERP Setup 0.1.0.exe`（82M）+ win-unpacked 主程序（180M）。asar 含完整前后端；exe 启动验证在 userData 成功建 9 张表（无头环境 GUI 退出属预期）。data/ 为空，首次运行自动建空库。未验证 GUI 交互（无显示环境）。
- 2026-11-21：**移除全部旧库兼容 + 清库重建 + 全量模拟数据完成**（详见 `architecture/business-change-12.md`）：删 schema 全部 ALTER/rebuild 迁移、旧列(spec/material/part_no)、WITHDRAWN 状态、withdraw/fromDelivery/legacy 规格等全部兼容代码（前后端+测试）；清库重建（明细表无旧列、status无WITHDRAWN）；自造模拟数据（3客户2供货商6货品、9送货单、2对帐单、3收付款等）并全面核算验证：typecheck/build过、74测试全过、模拟生成32项+最终核对34项全过，打印/docx端点全200。数据已保留库中供主人查看。未打包。
- 2026-11-21：**全字段输入校验完成**（详见 `architecture/business-change-11.md`）：validation.ts 的 v-numeric 指令（仅对 type=number 生效，过滤字母/符号/多余小数点，同步 v-model）+ checkNumeric/checkRequired/firstError；main.ts 全局注册。应用到 4 单据制单页明细数量/单价、库存调整（允许负数）、财务金额、货品/品类/公司/客户/供货商必填项、各动态规格 number 输入。typecheck/build 过，76 测试全过。纯前端。
- 2026-11-21：**财务管理模块完成**（详见 `architecture/business-change-10.md`）：只有已确认对帐单/订购单计入财务；应收=已确认对帐单金额−有效收款、应付=已确认订购单金额−有效付款；finance_records 表（类型/关联单据/金额/日期/方式/备注）；打回自动失效（计算时 JOIN 过滤 status=CONFIRMED，重新确认自动恢复）；3 子页：财务概览/收款管理/付款管理。前置补了订购单单价/金额字段（应付金额来源，历史单金额为0）。typecheck/build 过，76 测试全过，运行时实测收款登记/删除正确，已重启 3100。未打包。
- 2026-11-21：**概览模块完成**（详见 `architecture/business-change-09.md`）：ECharts 图表看板，KPI卡片+6图表（库存品类饼图/送货金额趋势折线/单据状态堆叠/客户对帐排行/库存流水趋势/畅货TOP10）+负库存预警表，时间6/12/24月切换；后端 overview 聚合接口（纯SQL聚合），前端概览页设为首页、侧边栏顶部入口，安装 echarts 依赖。typecheck/build 过，71 测试全过，运行时实测 /overview 数据完整，已重启 3100。未打包。
- 2026-11-21：**侧边栏按业务流程重新划分**（详见 `architecture/business-change-08.md`）：分组改为 基础资料/采购业务/销售业务/库存管理/系统设置，按业务流转顺序排；每张单据下加「新建XX单」直达入口，"未打回单据"改名"单据列表"，公司信息移到系统设置；仅改 App.vue 的 navGroups + isActive（new/列表互斥高亮）。typecheck/build 过，后端未动。未打包。
- 2026-11-21：**全局备注扩展到送货单/对帐单**：主人要求"订购单、对账单、送货单都要像报价单一样的全局备注字段"，确认订购单已有 terms/footnote 不动，只给送货单、对帐单加单一 `remarks` 字段（像报价单那样，制单页 textarea、打印/Word 在明细表下方按行显示）。schema 幂等 ALTER 加列，DTO/Input/print/docx/前端全链路。typecheck/build 过，71 测试全过，运行时实测 remarks 存取+print 正确，已重启 3100 后端。未打包。
- 2026-11-21：**业务变更07 完成**（对帐单重构，详见 `architecture/business-change-07.md`）：创建对帐单改为选客户+制单月份，后端 fromCustomerMonth 汇总该客户当月 CONFIRMED 送货单明细（打回/草稿/其它月排除），ATTN 从客户档案带出、FROM/币制取公司信息；前端生成区选客户+月份点生成。参考客户提供的对帐单样本格式（现有打印/Word 已符合）。typecheck/build 过，71 测试全过，运行时实测汇总正确，已重启 3100 后端。未打包。
- 2026-11-21：**业务变更06 完成**（编辑送货单支持带入明细）：编辑页也显示「从报价单带入」区（去掉 v-if=!editingId），选报价单点带入则**替换**当前明细+更新表头；不带入则沿用原明细。曾误解为"规格加更新按钮"已撤销。纯前端，typecheck/build 过，后端未动。详见 `architecture/business-change-06.md`。
- 2026-11-21：**业务变更05 完成**（规格展示按品类走，详见 `architecture/business-change-05.md`）：货品管理改按品类分组表格（各组表头只有自己字段，消除空列）；四类单据明细规格改单个"规格"摘要列（每行按品类显示"中文名+值+单位"，多品类共存自然支持），制单点按展开该行品类专属字段；公共 formatSpecSummary 前后端同款；specs/快照结构不动只改展示层。typecheck/build 过，70 测试全过，运行时实测混装单每行各显示自己品类规格（φ数13MM…/长30MM…），已重启 3100 后端。未打包。
- 2026-11-21：**订购单备注改为客户自填**（详见 `architecture/business-change-04.md`）：原先写死的 6 条备注条款+表尾备注（`common/document-constants.ts`）改为制单时客户自己填——purchase_orders 加 terms/footnote 两列（幂等 ALTER），制单页加两个 textarea（每行一条条款），打印/导出优先用填写值、留空回退旧常量兼容历史单。typecheck/build 过，**70 测试全过**，运行时实测自定义条款/表尾生效。已重启 3100 后端加载新 dist。未打包。
- 2026-11-21：**业务变更03 完成**（4 条整改，详见 `architecture/business-change-03.md`）：①订购/送货/对帐三单据「导出Word」改「打印」按钮→新增三个打印预览页（返回/导出 Word/打印另存 PDF），后端三 service 加 getPrintData、controller 加 `/:id/print` 端点，docx 改与 print 同源渲染；②送货明细规格改结构化 specs+specLabels 按品类动态拆列（公共 helper `common/dynamic-specs.ts`，旧 spec 文本兼容），对帐单 fromDelivery 拍平规格文本；③公司信息加 deliveryNoPrefix 字段，送货单号按前缀生成（YLD→`YLD-YYYYMMDD-XXXX`，留空 DN）；④删送货单料号（schema part_no 列保留兼容、新单不写）。新增测试 business-change-03.e2e-spec.ts。typecheck/build 过，**69 测试全过**，运行时实测前缀/动态列/无料号/docx 均正确。未打包。
- 2026-11-21：**三条 UI/业务调整完成**：①报价单去掉"确认"按钮（报价确认不扣库、前端无此动作），草稿可直接打回（后端 withdrawInternal 允许 DRAFT，confirm 端点保留兼容历史）；确认端点仍兼容。②订购单规格拆开：明细改结构化 specs/spec_labels（schema 幂等 ALTER 加列，旧 spec/material/delivery_date 列保留兼容），材质作为品类规格中的可选字段（有就显示动态列，无则不显示），docx 与制单页均按品类 spec_schema 动态拆列。③订购单交货期移到表头（purchase_orders 加 delivery_date，明细不再按行填）。前端 types/制单页同步；测试更新（订购单测 specs 快照/表头交货期，报价测草稿直接打回）。typecheck/build 过，66 测试全过，真实 dev 库迁移实测（加列成功）+ API 实测（草稿打回 REJECTED、表头交货期/规格正确）。未打包。
