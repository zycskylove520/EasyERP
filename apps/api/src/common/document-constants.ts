/**
 * 单据固定信息占位。
 *
 * 设计约定：仓库不预置任何真实公司名、人名、电话或地址。公司抬头等信息
 * 一律由使用者在「公司信息」档案中自行填写，从 CompanyInfoService 读取。
 * 以下常量仅作类型占位，值为空，保留导出以兼容潜在引用。
 */
export const COMPANY = {
  name: '',
  address: '',
  contact: '',
  contactShort: '',
  maker: '',
  businessScope: '',
} as const;

/** 订购单备注条款占位（不预置任何默认文字，完全由制单人填写）。 */
export const PURCHASE_ORDER_TERMS: string[] = [];

/** 订购单表尾备注占位。 */
export const PURCHASE_ORDER_FOOTNOTE = '';
