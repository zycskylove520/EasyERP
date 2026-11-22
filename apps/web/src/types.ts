/** 与后端 DTO 对齐的前端类型定义。 */

export interface SpecField {
  key: string;
  label: string;
  type: 'number' | 'text';
  unit?: string;
  reserved?: boolean;
}

/** 业务域：供货 / 销售 */
export type BizType = 'SUPPLY' | 'SALE';

export interface Category {
  id: number;
  name: string;
  module: string;
  bizType: BizType;
  specSchema: SpecField[];
  sortOrder: number;
}

/** 创建/编辑品类的输入。 */
export interface CategoryInput {
  name: string;
  module: string;
  bizType?: BizType;
  sortOrder?: number;
  specSchema?: SpecField[];
}

export interface Product {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  bizType: BizType;
  specs: Record<string, unknown>;
  unit: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  businessTypes: string | null;
}

export interface Customer {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
}

export interface Stock {
  productId: number;
  productName: string;
  categoryName: string;
  unit: string;
  quantity: number;
}

export type LedgerReason =
  | 'INITIAL'
  | 'QUOTATION_CONSUME'
  | 'QUOTATION_REVERSE'
  | 'MANUAL_ADJUST'
  | 'DELIVERY_CONSUME'
  | 'DELIVERY_REVERSE'
  | 'PO_RECEIVE'
  | 'PO_REVERSE';

export interface LedgerEntry {
  id: number;
  productId: number;
  productName: string;
  delta: number;
  reason: LedgerReason;
  refType: string | null;
  refId: number | null;
  reversalOf: number | null;
  note: string | null;
  createdAt: string;
}

export type QuotationStatus = 'DRAFT' | 'CONFIRMED' | 'REJECTED';

export interface QuotationItem {
  id: number;
  seq: number;
  productId: number | null;
  productName: string;
  specs: Record<string, unknown>;
  specLabels: Record<string, string>;
  unit: string | null;
  unitPrice: number;
  quantity: number;
  deliveryDate: string | null;
  remark: string | null;
  inventoryLedgerId: number | null;
  reversalLedgerId: number | null;
}

export interface Quotation {
  id: number;
  quoteNo: string;
  customerId: number | null;
  customerName: string | null;
  quoteDate: string;
  currency: string;
  sender: string | null;
  attn: string | null;
  fax: string | null;
  validUntil: string | null;
  paymentTerms: string | null;
  shippingTerms: string | null;
  remarks: string | null;
  status: QuotationStatus;
  items: QuotationItem[];
}

/** 制单时的明细输入（新建/编辑共用）。 */
export interface QuotationItemInput {
  productId?: number | null;
  productName: string;
  specs?: Record<string, unknown>;
  specLabels?: Record<string, string>;
  unit?: string;
  unitPrice?: number;
  quantity?: number;
  deliveryDate?: string;
  remark?: string;
}

/** 库存不足（扣成负数）的货品提醒。 */
export interface LowStockItem {
  productId: number;
  productName: string;
  remaining: number;
}

/** 确认报价单返回：单据 + 补货提醒。 */
export interface ConfirmResult {
  quotation: Quotation;
  lowStock: LowStockItem[];
}

/** 公司基础信息（单条档案）。 */
export interface CompanyInfo {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  fax: string | null;
  mobile: string | null;
  maker: string | null;
  businessScope: string | null;
  /** 送货单号前缀（如 YLD；留空用默认 DN）。 */
  deliveryNoPrefix: string | null;
  currency: string;
}

export interface CompanyInfoInput {
  name: string;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  mobile?: string | null;
  maker?: string | null;
  businessScope?: string | null;
  deliveryNoPrefix?: string | null;
  currency?: string;
}

// ---------- 三类新业务单据（订购 / 送货 / 对帐）----------

export type DocStatus = 'DRAFT' | 'CONFIRMED' | 'REJECTED';

/** 订购单明细。规格按品类字段拆成 specs，材质是其中一个可选字段。 */
export interface PurchaseOrderItem {
  id: number;
  seq: number;
  productId: number | null;
  productName: string;
  specs: Record<string, unknown>;
  specLabels: Record<string, string>;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string | null;
  inventoryLedgerId: number | null;
  reversalLedgerId: number | null;
}

export interface PurchaseOrder {
  id: number;
  orderNo: string;
  supplierId: number | null;
  supplierName: string | null;
  orderDate: string;
  deliveryDate: string | null;
  attn: string | null;
  fax: string | null;
  currency: string;
  fm: string | null;
  /** 备注条款（每行一条，客户自填） */
  terms: string | null;
  /** 表尾备注（客户自填） */
  footnote: string | null;
  status: DocStatus;
  items: PurchaseOrderItem[];
}

export interface PurchaseOrderItemInput {
  productId?: number | null;
  productName: string;
  specs?: Record<string, unknown>;
  specLabels?: Record<string, string>;
  unit?: string | null;
  quantity?: number;
  unitPrice?: number;
  remark?: string | null;
}

export interface PurchaseOrderInput {
  supplierId?: number | null;
  supplierName?: string | null;
  orderDate: string;
  deliveryDate?: string | null;
  attn?: string | null;
  fax?: string | null;
  currency?: string;
  fm?: string | null;
  terms?: string | null;
  footnote?: string | null;
  items: PurchaseOrderItemInput[];
}

/** 送货单明细。规格按品类字段拆成 specs（老单据 spec 文本兼容）。 */
export interface DeliveryNoteItem {
  id: number;
  seq: number;
  productId: number | null;
  productName: string;
  specs: Record<string, unknown>;
  specLabels: Record<string, string>;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string | null;
  inventoryLedgerId: number | null;
  reversalLedgerId: number | null;
}

export interface DeliveryNote {
  id: number;
  deliveryNo: string;
  customerId: number | null;
  customerName: string | null;
  shipAddress: string | null;
  deliveryDate: string;
  orderNo: string | null;
  sourceQuotationId: number | null;
  /** 整单全局备注 */
  remarks: string | null;
  status: DocStatus;
  items: DeliveryNoteItem[];
}

export interface DeliveryNoteItemInput {
  productId?: number | null;
  productName: string;
  specs?: Record<string, unknown>;
  specLabels?: Record<string, string>;
  unit?: string | null;
  quantity?: number;
  unitPrice?: number;
  remark?: string | null;
}

export interface DeliveryNoteInput {
  customerId?: number | null;
  customerName?: string | null;
  shipAddress?: string | null;
  deliveryDate: string;
  orderNo?: string | null;
  sourceQuotationId?: number | null;
  remarks?: string | null;
  items: DeliveryNoteItemInput[];
}

/** 送货单确认返回：单据 + 补货提醒。 */
export interface DeliveryNoteConfirmResult {
  deliveryNote: DeliveryNote;
  lowStock: LowStockItem[];
}

/** 从报价单带入的预填数据。 */
export interface DeliveryFromQuotation {
  customerId: number | null;
  customerName: string | null;
  orderNo: string;
  sourceQuotationId: number;
  items: DeliveryNoteItemInput[];
}

/** 对帐单明细。 */
export interface StatementItem {
  id: number;
  seq: number;
  itemDate: string | null;
  deliveryNo: string | null;
  productName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string | null;
}

export interface Statement {
  id: number;
  statementNo: string;
  customerId: number | null;
  customerName: string | null;
  statementDate: string;
  attn: string | null;
  fax: string | null;
  from: string | null;
  currency: string;
  /** 整单全局备注 */
  remarks: string | null;
  status: DocStatus;
  items: StatementItem[];
}

export interface StatementItemInput {
  itemDate?: string | null;
  deliveryNo?: string | null;
  productName: string;
  unit?: string | null;
  quantity?: number;
  unitPrice?: number;
  remark?: string | null;
}

export interface StatementInput {
  customerId?: number | null;
  customerName?: string | null;
  statementDate: string;
  attn?: string | null;
  fax?: string | null;
  from?: string | null;
  currency?: string;
  remarks?: string | null;
  items: StatementItemInput[];
}

/** 按客户+月份汇总送货单生成的对帐单预填数据。 */
export interface StatementFromCustomerMonth {
  customerId: number;
  customerName: string;
  attn: string | null;
  fax: string | null;
  from: string | null;
  currency: string;
  statementDate: string;
  month: string;
  items: StatementItemInput[];
  deliveryCount: number;
}

// ---------- 财务管理 ----------
export type FinanceType = 'RECEIVE' | 'PAY';
export type FinanceRefType = 'STATEMENT' | 'PURCHASE_ORDER';

export interface FinanceDueRow {
  refType: FinanceRefType;
  refId: number;
  docNo: string;
  partyName: string | null;
  docDate: string;
  amount: number;
  received: number;
  balance: number;
}

export interface FinanceRecord {
  id: number;
  type: FinanceType;
  refType: FinanceRefType;
  refId: number;
  refNo: string | null;
  partyName: string | null;
  amount: number;
  recordDate: string;
  method: string | null;
  /** 收付款单号（自动生成） */
  recordNo: string | null;
  /** 经手人 */
  handler: string | null;
  /** 发票号 */
  invoiceNo: string | null;
  /** 开票状态：未开票/已开票/不需要 */
  invoiceStatus: string | null;
  remark: string | null;
  createdAt: string;
}

export interface FinanceRecordInput {
  type: FinanceType;
  refType: FinanceRefType;
  refId: number;
  amount: number;
  recordDate: string;
  method?: string | null;
  handler?: string | null;
  invoiceNo?: string | null;
  invoiceStatus?: string | null;
  remark?: string | null;
}

export interface FinanceSummary {
  receivableTotal: number;
  payableTotal: number;
  net: number;
  monthReceived: number;
  monthPaid: number;
  trend: Array<{ month: string; received: number; paid: number }>;
}

// ---------- 概览看板 ----------
export interface OverviewData {
  generatedAt: string;
  months: number;
  kpi: {
    productCount: number;
    categoryCount: number;
    customerCount: number;
    supplierCount: number;
    stockTotal: number;
    negativeStockCount: number;
    monthQuotations: number;
    monthDeliveries: number;
    monthStatements: number;
  };
  stockByCategory: Array<{ name: string; value: number; actual: number }>;
  deliveryTrend: Array<{ month: string; amount: number }>;
  docStatus: {
    quotations: { draft: number; confirmed: number; rejected: number };
    purchaseOrders: { draft: number; confirmed: number; rejected: number };
    deliveryNotes: { draft: number; confirmed: number; rejected: number };
    statements: { draft: number; confirmed: number; rejected: number };
  };
  customerStatementRank: Array<{ name: string; amount: number }>;
  ledgerTrend: Array<{ month: string; reason: string; delta: number }>;
  negativeStock: Array<{ productName: string; categoryName: string; quantity: number }>;
  topProducts: Array<{ name: string; quantity: number }>;
}
