/** 后端 API 统一封装：请求本地内置后端（Electron 桌面版）。 */
import type {
  BizType,
  Category,
  CategoryInput,
  Product,
  Supplier,
  Customer,
  Stock,
  LedgerEntry,
  LedgerReason,
  Quotation,
  QuotationItemInput,
  ConfirmResult,
  PurchaseOrder,
  PurchaseOrderInput,
  DeliveryNote,
  DeliveryNoteInput,
  DeliveryNoteConfirmResult,
  DeliveryFromQuotation,
  Statement,
  StatementInput,
  StatementFromCustomerMonth,
  OverviewData,
  FinanceDueRow,
  FinanceRecord,
  FinanceRecordInput,
  FinanceSummary,
  LowStockItem,
  CompanyInfo,
  CompanyInfoInput,
} from './types';

/** API 错误：携带后端返回的状态码与消息。 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * 后端 API 基址。Electron 主进程可在 window 上注入 __EASYERP_API_BASE__ 覆盖；
 * 默认指向本机内置后端。不用相对路径，因为打包后页面走 file:// 协议。
 */
declare global {
  interface Window {
    __EASYERP_API_BASE__?: string;
  }
}
const API_BASE =
  (typeof window !== 'undefined' && window.__EASYERP_API_BASE__) || 'http://127.0.0.1:3100';

/** 发起请求并解析 JSON；非 2xx 抛 ApiError。 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    });
  } catch {
    throw new ApiError('无法连接后端服务', 0);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(body.message ?? `请求失败（${response.status}）`, response.status);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

/** 从后端下载 docx 并触发浏览器保存。 */
async function downloadDocxFile(path: string, filename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new ApiError('导出 Word 失败', res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 品类。 */
export const categoriesApi = {
  list: (filter?: { name?: string; module?: string; bizType?: BizType }) => {
    const params = new URLSearchParams();
    if (filter?.name) params.set('name', filter.name);
    if (filter?.module) params.set('module', filter.module);
    if (filter?.bizType) params.set('bizType', filter.bizType);
    const q = params.toString();
    return request<Category[]>(`/categories${q ? `?${q}` : ''}`);
  },
  create: (input: CategoryInput) => request<Category>('/categories', json('POST', input)),
  update: (id: number, input: CategoryInput) =>
    request<Category>(`/categories/${id}`, json('PATCH', input)),
  remove: (id: number) => request<{ deleted: boolean }>(`/categories/${id}`, { method: 'DELETE' }),
};

/** 货品。 */
export const productsApi = {
  list: (categoryId?: number, bizType?: BizType) => {
    const params = new URLSearchParams();
    if (categoryId !== undefined) params.set('categoryId', String(categoryId));
    if (bizType) params.set('bizType', bizType);
    const q = params.toString();
    return request<Product[]>(`/products${q ? `?${q}` : ''}`);
  },
  create: (input: Omit<Product, 'id' | 'categoryName'>) =>
    request<Product>('/products', json('POST', input)),
  update: (id: number, input: Omit<Product, 'id' | 'categoryName'>) =>
    request<Product>(`/products/${id}`, json('PATCH', input)),
  remove: (id: number) => request<{ deleted: boolean }>(`/products/${id}`, { method: 'DELETE' }),
};

/** 供货商。 */
export const suppliersApi = {
  list: () => request<Supplier[]>('/suppliers'),
  create: (input: Omit<Supplier, 'id'>) => request<Supplier>('/suppliers', json('POST', input)),
  update: (id: number, input: Omit<Supplier, 'id'>) =>
    request<Supplier>(`/suppliers/${id}`, json('PATCH', input)),
  remove: (id: number) => request<{ deleted: boolean }>(`/suppliers/${id}`, { method: 'DELETE' }),
};

/** 客户。 */
export const customersApi = {
  list: () => request<Customer[]>('/customers'),
  create: (input: Omit<Customer, 'id'>) => request<Customer>('/customers', json('POST', input)),
  update: (id: number, input: Omit<Customer, 'id'>) =>
    request<Customer>(`/customers/${id}`, json('PATCH', input)),
  remove: (id: number) => request<{ deleted: boolean }>(`/customers/${id}`, { method: 'DELETE' }),
};

/** 库存。 */
export const inventoryApi = {
  stock: (categoryId?: number) =>
    request<Stock[]>(`/inventory/stock${categoryId !== undefined ? `?categoryId=${categoryId}` : ''}`),
  ledger: (productId?: number, reason?: LedgerReason) => {
    const params = new URLSearchParams();
    if (productId !== undefined) params.set('productId', String(productId));
    if (reason) params.set('reason', reason);
    const query = params.toString();
    return request<LedgerEntry[]>(`/inventory/ledger${query ? `?${query}` : ''}`);
  },
  setInitial: (productId: number, quantity: number, note?: string) =>
    request<LedgerEntry>('/inventory/initial', json('POST', { productId, quantity, note })),
  adjust: (productId: number, delta: number, note?: string) =>
    request<LedgerEntry>('/inventory/adjust', json('POST', { productId, delta, note })),
  /** 手工调整：直接把库存设为目标值（后端自动算差额记流水）。 */
  setQuantity: (productId: number, target: number, note?: string) =>
    request<LedgerEntry>('/inventory/set', json('POST', { productId, target, note })),
};

/** 公司基础信息（单条档案）。 */
export const companyInfoApi = {
  get: () => request<CompanyInfo>('/company-info'),
  update: (input: CompanyInfoInput) => request<CompanyInfo>('/company-info', json('PATCH', input)),
};

/** 报价单。 */
export const quotationsApi = {
  list: (filter?: { quoteNo?: string; customerId?: number; dateFrom?: string; dateTo?: string; group?: 'active' | 'rejected' }) => {
    const params = new URLSearchParams();
    if (filter?.quoteNo) params.set('quoteNo', filter.quoteNo);
    if (filter?.customerId !== undefined) params.set('customerId', String(filter.customerId));
    if (filter?.dateFrom) params.set('dateFrom', filter.dateFrom);
    if (filter?.dateTo) params.set('dateTo', filter.dateTo);
    if (filter?.group) params.set('group', filter.group);
    const q = params.toString();
    return request<Quotation[]>(`/quotations${q ? `?${q}` : ''}`);
  },
  get: (id: number) => request<Quotation>(`/quotations/${id}`),
  create: (input: QuoteInput) => request<Quotation>('/quotations', json('POST', input)),
  update: (id: number, input: QuoteInput) =>
    request<Quotation>(`/quotations/${id}`, json('PATCH', input)),
  remove: (id: number) => request<{ deleted: boolean }>(`/quotations/${id}`, { method: 'DELETE' }),
  duplicate: (id: number) => request<Quotation>(`/quotations/${id}/duplicate`, { method: 'POST' }),
  confirm: (id: number) => request<ConfirmResult>(`/quotations/${id}/confirm`, { method: 'POST' }),
  reject: (id: number) => request<Quotation>(`/quotations/${id}/reject`, { method: 'POST' }),
  print: (id: number) => request<Record<string, unknown>>(`/quotations/${id}/print`),
  /** 下载 Word 版报价单 */
  downloadDocx: (id: number, filename: string): Promise<void> =>
    downloadDocxFile(`/quotations/${id}/docx`, filename),
};

/** 订购单。 */
export const purchaseOrdersApi = {
  list: (filter?: { orderNo?: string; supplierId?: number; dateFrom?: string; dateTo?: string; group?: 'active' | 'rejected' }) => {
    const params = new URLSearchParams();
    if (filter?.orderNo) params.set('orderNo', filter.orderNo);
    if (filter?.supplierId !== undefined) params.set('supplierId', String(filter.supplierId));
    if (filter?.dateFrom) params.set('dateFrom', filter.dateFrom);
    if (filter?.dateTo) params.set('dateTo', filter.dateTo);
    if (filter?.group) params.set('group', filter.group);
    const q = params.toString();
    return request<PurchaseOrder[]>(`/purchase-orders${q ? `?${q}` : ''}`);
  },
  get: (id: number) => request<PurchaseOrder>(`/purchase-orders/${id}`),
  create: (input: PurchaseOrderInput) => request<PurchaseOrder>('/purchase-orders', json('POST', input)),
  update: (id: number, input: PurchaseOrderInput) => request<PurchaseOrder>(`/purchase-orders/${id}`, json('PATCH', input)),
  remove: (id: number) => request<{ deleted: boolean }>(`/purchase-orders/${id}`, { method: 'DELETE' }),
  duplicate: (id: number) => request<PurchaseOrder>(`/purchase-orders/${id}/duplicate`, { method: 'POST' }),
  print: (id: number) => request<Record<string, unknown>>(`/purchase-orders/${id}/print`),
  confirm: (id: number) => request<{ order: PurchaseOrder; lowStock: LowStockItem[] }>(`/purchase-orders/${id}/confirm`, { method: 'POST' }),
  reject: (id: number) => request<PurchaseOrder>(`/purchase-orders/${id}/reject`, { method: 'POST' }),
  downloadDocx: (id: number, filename: string) => downloadDocxFile(`/purchase-orders/${id}/docx`, filename),
};

/** 送货单。 */
export const deliveryNotesApi = {
  list: (filter?: { deliveryNo?: string; customerId?: number; dateFrom?: string; dateTo?: string; group?: 'active' | 'rejected' }) => {
    const params = new URLSearchParams();
    if (filter?.deliveryNo) params.set('deliveryNo', filter.deliveryNo);
    if (filter?.customerId !== undefined) params.set('customerId', String(filter.customerId));
    if (filter?.dateFrom) params.set('dateFrom', filter.dateFrom);
    if (filter?.dateTo) params.set('dateTo', filter.dateTo);
    if (filter?.group) params.set('group', filter.group);
    const q = params.toString();
    return request<DeliveryNote[]>(`/delivery-notes${q ? `?${q}` : ''}`);
  },
  get: (id: number) => request<DeliveryNote>(`/delivery-notes/${id}`),
  fromQuotation: (quotationId: number) => request<DeliveryFromQuotation>(`/delivery-notes/from-quotation/${quotationId}`),
  create: (input: DeliveryNoteInput) => request<DeliveryNote>('/delivery-notes', json('POST', input)),
  update: (id: number, input: DeliveryNoteInput) => request<DeliveryNote>(`/delivery-notes/${id}`, json('PATCH', input)),
  remove: (id: number) => request<{ deleted: boolean }>(`/delivery-notes/${id}`, { method: 'DELETE' }),
  duplicate: (id: number) => request<DeliveryNote>(`/delivery-notes/${id}/duplicate`, { method: 'POST' }),
  print: (id: number) => request<Record<string, unknown>>(`/delivery-notes/${id}/print`),
  confirm: (id: number) => request<DeliveryNoteConfirmResult>(`/delivery-notes/${id}/confirm`, { method: 'POST' }),
  reject: (id: number) => request<DeliveryNote>(`/delivery-notes/${id}/reject`, { method: 'POST' }),
  downloadDocx: (id: number, filename: string) => downloadDocxFile(`/delivery-notes/${id}/docx`, filename),
};

/** 对帐单。 */
export const statementsApi = {
  list: (filter?: { statementNo?: string; customerId?: number; dateFrom?: string; dateTo?: string; group?: 'active' | 'rejected' }) => {
    const params = new URLSearchParams();
    if (filter?.statementNo) params.set('statementNo', filter.statementNo);
    if (filter?.customerId !== undefined) params.set('customerId', String(filter.customerId));
    if (filter?.dateFrom) params.set('dateFrom', filter.dateFrom);
    if (filter?.dateTo) params.set('dateTo', filter.dateTo);
    if (filter?.group) params.set('group', filter.group);
    const q = params.toString();
    return request<Statement[]>(`/statements${q ? `?${q}` : ''}`);
  },
  get: (id: number) => request<Statement>(`/statements/${id}`),
  fromCustomerMonth: (customerId: number, month: string) =>
    request<StatementFromCustomerMonth>(`/statements/from-customer-month?customerId=${customerId}&month=${encodeURIComponent(month)}`),
  create: (input: StatementInput) => request<Statement>('/statements', json('POST', input)),
  update: (id: number, input: StatementInput) => request<Statement>(`/statements/${id}`, json('PATCH', input)),
  remove: (id: number) => request<{ deleted: boolean }>(`/statements/${id}`, { method: 'DELETE' }),
  duplicate: (id: number) => request<Statement>(`/statements/${id}/duplicate`, { method: 'POST' }),
  print: (id: number) => request<Record<string, unknown>>(`/statements/${id}/print`),
  confirm: (id: number) => request<Statement>(`/statements/${id}/confirm`, { method: 'POST' }),
  reject: (id: number) => request<Statement>(`/statements/${id}/reject`, { method: 'POST' }),
  downloadDocx: (id: number, filename: string) => downloadDocxFile(`/statements/${id}/docx`, filename),
};

/** 概览看板。 */
export const overviewApi = {
  get: (months: number) => request<OverviewData>(`/overview?months=${months}`),
};

/** 财务管理。 */
export const financeApi = {
  summary: () => request<FinanceSummary>('/finance/summary'),
  receivables: () => request<FinanceDueRow[]>('/finance/receivables'),
  payables: () => request<FinanceDueRow[]>('/finance/payables'),
  records: (type?: 'RECEIVE' | 'PAY', refId?: number) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (refId !== undefined) params.set('refId', String(refId));
    const q = params.toString();
    return request<FinanceRecord[]>(`/finance/records${q ? `?${q}` : ''}`);
  },
  create: (input: FinanceRecordInput) => request<FinanceRecord>('/finance/records', json('POST', input)),
  remove: (id: number) => request<{ deleted: boolean }>(`/finance/records/${id}`, { method: 'DELETE' }),
};

/** 报价单保存输入（对应后端 QuotationInput）。 */
export interface QuoteInput {
  customerId?: number | null;
  quoteDate: string;
  currency?: string;
  sender?: string | null;
  attn?: string | null;
  fax?: string | null;
  validUntil?: string | null;
  paymentTerms?: string | null;
  shippingTerms?: string | null;
  remarks?: string | null;
  items: QuotationItemInput[];
}
