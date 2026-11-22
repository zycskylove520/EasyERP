# 批量修复 02 · 用户测试反馈 7 项（2026-11-22）

## 1-3. 输入框无法输入（问题2库存数量/问题3付款备注/问题6最小化还原才好）
- **根因**：Windows Electron 的「原生窗口遮挡计算（CalculateNativeWinOcclusion）」bug——窗口失焦后输入框不响应点击/输入，最小化还原触发重绘后恢复。加上全局通配 `*::-webkit-scrollbar{display:none}` 破坏命中测试、`type=number` 默认 step=1 阻止小数。
- **修复**：
  - electron/main.cjs：`app.commandLine.appendSwitch('disable-features','CalculateNativeWinOcclusion')`（win32）。
  - style.css：滚动条隐藏改为只针对 html/body/.main/.sidebar，去掉通配 `*::-webkit-scrollbar`。
  - InventoryAdjustView：数量 input 加 `step="any"`（允许小数/负数）。
- 这些是推测性根因（无法在无 GUI 环境复现），但三项修复针对已知 Electron 问题，低风险。

## 4. 真正导出 PDF
- electron/preload.cjs（新建）：contextBridge 暴露 electronAPI.printToPDF。
- main.cjs：ipcMain.handle('print-to-pdf') → dialog.showSaveDialog + webContents.printToPDF(A4) 写文件；BrowserWindow 加 preload。
- 前端 src/pdf.ts：exportPdf() 封装，Electron 走 IPC，网页环境 fallback window.print()。
- 4 个打印预览页各加「导出 PDF」按钮。

## 5. 打回同步删收付款
- statement.service.reject / purchase-order.service.reject 打回事务内加 `DELETE FROM finance_records WHERE ref_type=? AND ref_id=?`。
- 原"打回仅不计入财务"仍保留（JOIN status=CONFIRMED 过滤），现在连记录一起删。测试 finance.e2e 已更新为新语义。

## 1（供货商）. 经营品种改自由文本
- schema：suppliers 加 business_types TEXT（+幂等 ALTER）；supplier.service DTO/Input/Row/CRUD 全改，删 setCategories；前端 SuppliersView 去 CategoryMultiSelect 改单行文本输入；types Supplier.businessTypes。测试 basic-data.e2e 更新。

## 7. 代码签名（未解决·需证书）
- 用户反馈其他电脑安装被 SmartScreen 拦截"未知发布者"。勘察：系统无任何代码签名证书，package.json `signAndEditExecutable:false`。
- **结论**：彻底消除需购买 EV/OV 代码签名证书（商业，年费），无法凭空生成。给用户三选项：①买证书签名（唯一根治）；②用户点"更多信息→仍要运行"手动放行（零成本）；③保持现状。已如实说明，未擅自购买。

## 验证
- typecheck/build 过；74 测试全过；重新打包 exe（release-v6，85M）。
- 打包版 Electron 实测：健康200、供货商 businessTypes 正确、首页/PDF chunk 200、preload.cjs 在 asar 内。
- 无 GUI 环境无法验证：输入框实际可输入、PDF 保存对话框、SmartScreen 行为——需用户在真机确认。

## 经验
- Electron Windows 输入框失焦不可输入：优先怀疑 CalculateNativeWinOcclusion，命令行开关关闭。
- 打回删关联财务记录要放在打回事务内，与状态变更原子提交。
