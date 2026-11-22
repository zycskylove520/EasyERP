import { Injectable } from '@nestjs/common';
import { getDatabase, transaction } from '../../database/connection';
import { ConflictError, NotFoundError } from '../../common/errors';
import { formatSpecSummary } from '../../common/dynamic-specs';

/** 报价单状态（与 schema CHECK 约束一致）。 */
export type QuotationStatus = 'DRAFT' | 'CONFIRMED' | 'REJECTED';

/** 扣库后库存不足（负数）的货品提醒。 */
export interface LowStockItem {
  productId: number;
  productName: string;
  remaining: number;
}

/** 确认报价单的返回结果：单据本身 + 需补货提醒。 */
export interface ConfirmResult {
  quotation: QuotationDto;
  lowStock: LowStockItem[];
}

/** 报价明细视图 DTO。 */
export interface QuotationItemDto {
  id: number;
  seq: number;
  productId: number | null;
  productName: string;
  /** 结构化规格（含材质等字段），按品类 spec_schema 展开 */
  specs: Record<string, unknown>;
  /** 规格字段名的制单时快照（key→label），历史单据不随品类改名而变 */
  specLabels: Record<string, string>;
  unit: string | null;
  unitPrice: number;
  quantity: number;
  deliveryDate: string | null;
  remark: string | null;
  inventoryLedgerId: number | null;
  reversalLedgerId: number | null;
}

/** 报价单视图 DTO（含明细）。 */
export interface QuotationDto {
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
  items: QuotationItemDto[];
}

/** 明细输入。productId 可选：提供则确认时扣该货品库存。 */
export interface QuotationItemInput {
  seq?: number;
  productId?: number | null;
  productName: string;
  specs?: Record<string, unknown>;
  specLabels?: Record<string, string>;
  unit?: string | null;
  unitPrice?: number;
  quantity?: number;
  deliveryDate?: string | null;
  remark?: string | null;
}

/** 报价单输入。 */
export interface QuotationInput {
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

interface QuotationRow {
  id: number;
  quote_no: string;
  customer_id: number | null;
  customer_name: string | null;
  quote_date: string;
  currency: string;
  sender: string | null;
  attn: string | null;
  fax: string | null;
  valid_until: string | null;
  payment_terms: string | null;
  shipping_terms: string | null;
  remarks: string | null;
  status: QuotationStatus;
}

interface QuotationItemRow {
  id: number;
  seq: number;
  product_id: number | null;
  product_name: string;
  specs: string;
  spec_labels: string;
  unit: string | null;
  unit_price: number;
  quantity: number;
  delivery_date: string | null;
  remark: string | null;
  inventory_ledger_id: number | null;
  reversal_ledger_id: number | null;
}

/** 备注条款：不预置任何默认文字，完全由客户制单时在「备注」里自行填写。 */
const DEFAULT_TERMS: string[] = [];

/** 报价单服务：单据 CRUD、状态流转（报价阶段不涉及库存，扣库在送货单阶段）。 */
@Injectable()
export class QuotationService {
  /**
   * 报价单筛选：单号/客户/日期；group=active 仅活跃(DRAFT/CONFIRMED)，
   * group=rejected 仅打回(REJECTED)。按 id 倒序（最新在上）。
   */
  findAll(filter?: { quoteNo?: string; customerId?: number; dateFrom?: string; dateTo?: string; group?: 'active' | 'rejected' }): QuotationDto[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (filter?.quoteNo) { conditions.push('q.quote_no LIKE ?'); params.push(`%${filter.quoteNo}%`); }
    if (filter?.customerId !== undefined) { conditions.push('q.customer_id = ?'); params.push(filter.customerId); }
    if (filter?.dateFrom) { conditions.push('q.quote_date >= ?'); params.push(filter.dateFrom); }
    if (filter?.dateTo) { conditions.push('q.quote_date <= ?'); params.push(filter.dateTo); }
    if (filter?.group === 'active') conditions.push("q.status IN ('DRAFT','CONFIRMED')");
    if (filter?.group === 'rejected') conditions.push("q.status = 'REJECTED'");
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = getDatabase()
      .prepare(`SELECT q.id, q.quote_no, q.customer_id, c.name AS customer_name,
                       q.quote_date, q.currency, q.sender, q.attn, q.fax,
                       q.valid_until, q.payment_terms, q.shipping_terms, q.remarks, q.status
                FROM quotations q LEFT JOIN customers c ON c.id = q.customer_id
                ${where}
                ORDER BY q.id DESC`)
      .all(...params) as QuotationRow[];
    return rows.map((row) => this.toDto(row));
  }

  findOne(id: number): QuotationDto {
    return this.toDto(this.findRow(id));
  }

  /** 新建报价单（草稿状态，不触动库存）。 */
  create(input: QuotationInput): QuotationDto {
    const quoteNo = this.generateQuoteNo();
    const id = transaction(() => {
      this.assertCustomerExists(input.customerId);
      const result = getDatabase()
        .prepare(`INSERT INTO quotations
                  (quote_no, customer_id, quote_date, currency, sender, attn, fax,
                   valid_until, payment_terms, shipping_terms, remarks, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`)
        .run(
          quoteNo,
          input.customerId ?? null,
          input.quoteDate,
          input.currency ?? 'RMB',
          input.sender ?? null,
          input.attn ?? null,
          input.fax ?? null,
          input.validUntil ?? null,
          input.paymentTerms ?? null,
          input.shippingTerms ?? null,
          input.remarks ?? null,
        );
      const newId = Number(result.lastInsertRowid);
      this.insertItems(newId, input.items);
      return newId;
    });
    return this.findOne(id);
  }

  /**
   * 复制报价单：生成一张新的草稿单，表头与明细照搬，日期用今天。
   * 新单号由 create 生成；原单的扣库/冲销流水不复制（新单未触动库存）。
   */
  duplicate(id: number): QuotationDto {
    const source = this.findOne(id);
    const today = new Date().toISOString().slice(0, 10);
    return this.create({
      customerId: source.customerId,
      quoteDate: today,
      currency: source.currency,
      sender: source.sender,
      attn: source.attn,
      fax: source.fax,
      validUntil: source.validUntil,
      paymentTerms: source.paymentTerms,
      shippingTerms: source.shippingTerms,
      remarks: source.remarks,
      items: source.items.map((item) => ({
        seq: item.seq,
        productId: item.productId,
        productName: item.productName,
        specs: item.specs,
        specLabels: item.specLabels,
        unit: item.unit,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        deliveryDate: item.deliveryDate,
        remark: item.remark,
      })),
    });
  }

  /** 更新报价单：仅草稿可改。明细全量替换。 */
  update(id: number, input: QuotationInput): QuotationDto {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的报价单可以编辑');
    transaction(() => {
      this.assertCustomerExists(input.customerId);
      getDatabase()
        .prepare(`UPDATE quotations SET customer_id = ?, quote_date = ?, currency = ?,
                  sender = ?, attn = ?, fax = ?, valid_until = ?, payment_terms = ?,
                  shipping_terms = ?, remarks = ? WHERE id = ?`)
        .run(
          input.customerId ?? null,
          input.quoteDate,
          input.currency ?? 'RMB',
          input.sender ?? null,
          input.attn ?? null,
          input.fax ?? null,
          input.validUntil ?? null,
          input.paymentTerms ?? null,
          input.shippingTerms ?? null,
          input.remarks ?? null,
          id,
        );
      getDatabase().prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(id);
      this.insertItems(id, input.items);
    });
    return this.findOne(id);
  }

  /** 删除报价单：仅草稿可删（已确认的单据要留痕）。 */
  remove(id: number): void {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的报价单可以删除');
    getDatabase().prepare('DELETE FROM quotations WHERE id = ?').run(id);
  }

  /**
   * 确认报价单：DRAFT → CONFIRMED。仅改状态，不扣库存。
   * 扣库语义已移到送货单确认阶段（业务决定：报价阶段只是报价，未实际出货）。
   * lowStock 恒为空数组，保留返回结构兼容前端。
   */
  confirm(id: number): ConfirmResult {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的报价单可以确认');
    getDatabase().prepare("UPDATE quotations SET status = 'CONFIRMED' WHERE id = ?").run(id);
    return { quotation: this.findOne(id), lowStock: [] };
  }

  /** 打回报价单：草稿或已确认 → REJECTED。仅改状态，不碰库存。 */
  reject(id: number): QuotationDto {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT' && row.status !== 'CONFIRMED') {
      throw new ConflictError('只有草稿或已确认的报价单可以打回');
    }
    getDatabase().prepare("UPDATE quotations SET status = 'REJECTED' WHERE id = ?").run(id);
    return this.findOne(id);
  }

  /** 打印数据：主表 + 客户信息 + 明细 + 备注条款；规格按每条明细自己的品类渲染成单行摘要。 */
  getPrintData(id: number): Record<string, unknown> {
    const dto = this.findOne(id);
    const columns = ['序号', '品名', '规格', '单位', '单价', '数量', '交货日期', '备注'];

    return {
      title: '报  价  单',
      quoteNo: dto.quoteNo,
      date: dto.quoteDate,
      currency: dto.currency,
      customer: dto.customerName,
      attn: dto.attn,
      from: dto.sender,
      fax: dto.fax,
      validUntil: dto.validUntil,
      paymentTerms: dto.paymentTerms,
      shippingTerms: dto.shippingTerms,
      columns,
      items: dto.items.map((item) => {
        return {
          seq: item.seq,
          productName: item.productName,
          specText: formatSpecSummary(item.specs, item.specLabels, item.productId),
          unit: item.unit,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          deliveryDate: item.deliveryDate,
          remark: item.remark,
        };
      }),
      terms: DEFAULT_TERMS,
      remarks: dto.remarks,
      status: dto.status,
    };
  }

  private insertItems(quotationId: number, items: QuotationItemInput[]): void {
    const insert = getDatabase()
      .prepare(`INSERT INTO quotation_items
                (quotation_id, seq, product_id, product_name, specs, spec_labels, unit,
                 unit_price, quantity, delivery_date, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    items.forEach((item, index) => {
      if (item.productId !== undefined && item.productId !== null) {
        this.assertProductExists(item.productId);
      }
      insert.run(
        quotationId,
        item.seq ?? index + 1,
        item.productId ?? null,
        item.productName,
        JSON.stringify(item.specs ?? {}),
        JSON.stringify(item.specLabels ?? {}),
        item.unit ?? null,
        item.unitPrice ?? 0,
        item.quantity ?? 0,
        item.deliveryDate ?? null,
        item.remark ?? null,
      );
    });
  }

  /** 生成报价单号：QT-YYYYMMDD-4位随机，够用且无需额外序列表。 */
  private generateQuoteNo(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    let quoteNo = `QT-${date}-${suffix}`;
    while (getDatabase().prepare('SELECT 1 FROM quotations WHERE quote_no = ?').get(quoteNo)) {
      quoteNo = `QT-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
    }
    return quoteNo;
  }

  private assertCustomerExists(customerId: number | null | undefined): void {
    if (customerId === null || customerId === undefined) return;
    const exists = getDatabase().prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId);
    if (!exists) throw new NotFoundError('客户', customerId);
  }

  private assertProductExists(productId: number): void {
    const exists = getDatabase().prepare('SELECT 1 FROM products WHERE id = ?').get(productId);
    if (!exists) throw new NotFoundError('货品', productId);
  }

  private findRow(id: number): QuotationRow {
    const row = getDatabase()
      .prepare(`SELECT q.id, q.quote_no, q.customer_id, c.name AS customer_name,
                       q.quote_date, q.currency, q.sender, q.attn, q.fax,
                       q.valid_until, q.payment_terms, q.shipping_terms, q.remarks, q.status
                FROM quotations q LEFT JOIN customers c ON c.id = q.customer_id
                WHERE q.id = ?`)
      .get(id) as QuotationRow | undefined;
    if (!row) throw new NotFoundError('报价单', id);
    return row;
  }

  private itemRows(quotationId: number): QuotationItemRow[] {
    return getDatabase()
      .prepare('SELECT * FROM quotation_items WHERE quotation_id = ? ORDER BY seq')
      .all(quotationId) as QuotationItemRow[];
  }

  private toDto(row: QuotationRow): QuotationDto {
    const items = this.itemRows(row.id).map((item) => ({
      id: item.id,
      seq: item.seq,
      productId: item.product_id,
      productName: item.product_name,
      specs: JSON.parse(item.specs || '{}') as Record<string, unknown>,
      specLabels: JSON.parse(item.spec_labels || '{}') as Record<string, string>,
      unit: item.unit,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      deliveryDate: item.delivery_date,
      remark: item.remark,
      inventoryLedgerId: item.inventory_ledger_id,
      reversalLedgerId: item.reversal_ledger_id,
    }));
    return {
      id: row.id,
      quoteNo: row.quote_no,
      customerId: row.customer_id,
      customerName: row.customer_name,
      quoteDate: row.quote_date,
      currency: row.currency,
      sender: row.sender,
      attn: row.attn,
      fax: row.fax,
      validUntil: row.valid_until,
      paymentTerms: row.payment_terms,
      shippingTerms: row.shipping_terms,
      remarks: row.remarks,
      status: row.status,
      items,
    };
  }
}
