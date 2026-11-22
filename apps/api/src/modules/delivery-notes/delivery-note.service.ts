import { Injectable } from '@nestjs/common';
import { getDatabase, transaction } from '../../database/connection';
import { ConflictError, NotFoundError } from '../../common/errors';
import { InventoryService } from '../inventory/inventory.service';
import { QuotationService } from '../quotations/quotation.service';
import { CompanyInfoService } from '../company-info/company-info.service';
import { amountToChinese } from '../../common/amount-to-chinese';
import { formatSpecSummary } from '../../common/dynamic-specs';

/** 送货单状态。 */
export type DeliveryNoteStatus = 'DRAFT' | 'CONFIRMED' | 'REJECTED';

/** 送货单明细视图。 */
export interface DeliveryNoteItemDto {
  id: number;
  seq: number;
  productId: number | null;
  productName: string;
  /** 结构化规格，按品类 spec_schema 拆列。 */
  specs: Record<string, unknown>;
  /** 规格字段名制单时快照。 */
  specLabels: Record<string, string>;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  remark: string | null;
  inventoryLedgerId: number | null;
  reversalLedgerId: number | null;
}

/** 送货单视图（含明细）。 */
export interface DeliveryNoteDto {
  id: number;
  deliveryNo: string;
  customerId: number | null;
  customerName: string | null;
  shipAddress: string | null;
  deliveryDate: string;
  orderNo: string | null;
  sourceQuotationId: number | null;
  /** 整单全局备注（打印/导出在明细表下方显示）。 */
  remarks: string | null;
  status: DeliveryNoteStatus;
  items: DeliveryNoteItemDto[];
}

/** 送货单明细输入。productId 可选：提供则确认时扣该货品库存。 */
export interface DeliveryNoteItemInput {
  seq?: number;
  productId?: number | null;
  productName: string;
  specs?: Record<string, unknown>;
  specLabels?: Record<string, string>;
  unit?: string | null;
  quantity?: number;
  unitPrice?: number;
  remark?: string | null;
}

/** 送货单输入。 */
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

/** 确认送货单结果：单据 + 扣成负数需补货提醒的货品。 */
export interface DeliveryNoteConfirmResult {
  deliveryNote: DeliveryNoteDto;
  lowStock: Array<{ productId: number; productName: string; remaining: number }>;
}

/** 从报价单带入的预填数据。 */
export interface DeliveryFromQuotation {
  customerId: number | null;
  customerName: string | null;
  orderNo: string;
  sourceQuotationId: number;
  items: DeliveryNoteItemInput[];
}

interface NoteRow {
  id: number;
  delivery_no: string;
  customer_id: number | null;
  customer_name: string | null;
  ship_address: string | null;
  delivery_date: string;
  order_no: string | null;
  source_quotation_id: number | null;
  remarks: string | null;
  status: DeliveryNoteStatus;
}

interface NoteItemRow {
  id: number;
  seq: number;
  product_id: number | null;
  product_name: string;
  specs: string;
  spec_labels: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  remark: string | null;
  inventory_ledger_id: number | null;
  reversal_ledger_id: number | null;
}

/**
 * 送货单服务：出库侧单据 CRUD、状态流转、确认扣库 / 打回还库、从报价单带入。
 * 扣库与冲销在事务内与状态变更原子提交。
 */
@Injectable()
export class DeliveryNoteService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly quotations: QuotationService,
    private readonly companyInfo: CompanyInfoService,
  ) {}

  /** 列表：可按单号/客户/日期筛选，group 区分活跃与打回。 */
  findAll(filter?: {
    deliveryNo?: string;
    customerId?: number;
    dateFrom?: string;
    dateTo?: string;
    group?: 'active' | 'rejected';
  }): DeliveryNoteDto[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (filter?.deliveryNo) { conditions.push('d.delivery_no LIKE ?'); params.push(`%${filter.deliveryNo}%`); }
    if (filter?.customerId !== undefined) { conditions.push('d.customer_id = ?'); params.push(filter.customerId); }
    if (filter?.dateFrom) { conditions.push('d.delivery_date >= ?'); params.push(filter.dateFrom); }
    if (filter?.dateTo) { conditions.push('d.delivery_date <= ?'); params.push(filter.dateTo); }
    if (filter?.group === 'active') conditions.push("d.status IN ('DRAFT','CONFIRMED')");
    if (filter?.group === 'rejected') conditions.push("d.status IN ('REJECTED')");
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = getDatabase()
      .prepare(`SELECT d.id, d.delivery_no, d.customer_id, d.customer_name, d.ship_address,
                       d.delivery_date, d.order_no, d.source_quotation_id, d.remarks, d.status
                FROM delivery_notes d ${where} ORDER BY d.id DESC`)
      .all(...params) as NoteRow[];
    return rows.map((row) => this.toDto(row));
  }

  findOne(id: number): DeliveryNoteDto {
    return this.toDto(this.findRow(id));
  }

  /** 从报价单构造预填数据（不改库），前端填入表单后仍可自由编辑。 */
  fromQuotation(quotationId: number): DeliveryFromQuotation {
    const quote = this.quotations.findOne(quotationId);
    return {
      customerId: quote.customerId,
      customerName: quote.customerName,
      orderNo: quote.quoteNo,
      sourceQuotationId: quote.id,
      items: quote.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        specs: { ...(item.specs ?? {}) },
        specLabels: { ...(item.specLabels ?? {}) },
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        remark: item.remark,
      })),
    };
  }

  /** 新建送货单（草稿，不动库存）。 */
  create(input: DeliveryNoteInput): DeliveryNoteDto {
    const deliveryNo = this.generateDeliveryNo();
    const id = transaction(() => {
      this.assertCustomerExists(input.customerId);
      const result = getDatabase()
        .prepare(`INSERT INTO delivery_notes
                  (delivery_no, customer_id, customer_name, ship_address, delivery_date,
                   order_no, source_quotation_id, remarks, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`)
        .run(
          deliveryNo,
          input.customerId ?? null,
          this.resolveCustomerName(input),
          input.shipAddress ?? null,
          input.deliveryDate,
          input.orderNo ?? null,
          input.sourceQuotationId ?? null,
          input.remarks ?? null,
        );
      const newId = Number(result.lastInsertRowid);
      this.insertItems(newId, input.items);
      return newId;
    });
    return this.findOne(id);
  }

  /** 复制为新草稿单，不动库存。 */
  duplicate(id: number): DeliveryNoteDto {
    const source = this.findOne(id);
    return this.create({
      customerId: source.customerId,
      customerName: source.customerName,
      shipAddress: source.shipAddress,
      deliveryDate: new Date().toISOString().slice(0, 10),
      orderNo: source.orderNo,
      sourceQuotationId: source.sourceQuotationId,
      remarks: source.remarks,
      items: source.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        specs: { ...item.specs },
        specLabels: { ...item.specLabels },
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        remark: item.remark,
      })),
    });
  }

  /** 更新：仅草稿可改，明细全量替换。 */
  update(id: number, input: DeliveryNoteInput): DeliveryNoteDto {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的送货单可以编辑');
    transaction(() => {
      this.assertCustomerExists(input.customerId);
      getDatabase()
        .prepare(`UPDATE delivery_notes SET customer_id = ?, customer_name = ?, ship_address = ?,
                  delivery_date = ?, order_no = ?, source_quotation_id = ?, remarks = ? WHERE id = ?`)
        .run(
          input.customerId ?? null,
          this.resolveCustomerName(input),
          input.shipAddress ?? null,
          input.deliveryDate,
          input.orderNo ?? null,
          input.sourceQuotationId ?? null,
          input.remarks ?? null,
          id,
        );
      getDatabase().prepare('DELETE FROM delivery_note_items WHERE delivery_note_id = ?').run(id);
      this.insertItems(id, input.items);
    });
    return this.findOne(id);
  }

  /** 删除：仅草稿可删。 */
  remove(id: number): void {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的送货单可以删除');
    getDatabase().prepare('DELETE FROM delivery_notes WHERE id = ?').run(id);
  }

  /** 确认：DRAFT→CONFIRMED，逐明细按 productId 扣库（DELIVERY_CONSUME），可负并返回补货提醒。 */
  confirm(id: number): DeliveryNoteConfirmResult {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的送货单可以确认');
    const lowStock: DeliveryNoteConfirmResult['lowStock'] = [];
    transaction(() => {
      for (const item of this.itemRows(id)) {
        if (item.product_id !== null && item.quantity > 0) {
          const { ledgerId, remaining } = this.inventory.consumeDelivery(
            item.product_id,
            item.quantity,
            id,
            `送货单 ${row.delivery_no} 扣减`,
          );
          getDatabase()
            .prepare('UPDATE delivery_note_items SET inventory_ledger_id = ? WHERE id = ?')
            .run(ledgerId, item.id);
          if (remaining < 0) lowStock.push({ productId: item.product_id, productName: item.product_name, remaining });
        }
      }
      getDatabase().prepare("UPDATE delivery_notes SET status = 'CONFIRMED' WHERE id = ?").run(id);
    });
    return { deliveryNote: this.findOne(id), lowStock };
  }

  /** 打回：CONFIRMED→REJECTED，冲销扣库流水（DELIVERY_REVERSE 还回），幂等。 */
  reject(id: number): DeliveryNoteDto {
    const row = this.findRow(id);
    if (row.status !== 'CONFIRMED') throw new ConflictError('只有已确认的送货单可以打回');
    transaction(() => {
      for (const item of this.itemRows(id)) {
        if (item.inventory_ledger_id !== null && item.product_id !== null && item.quantity > 0) {
          const reversalId = this.inventory.reverseFlow(
            item.product_id,
            item.quantity,
            'DELIVERY_REVERSE',
            item.inventory_ledger_id,
            id,
            `送货单 ${row.delivery_no} 打回冲销`,
          );
          getDatabase()
            .prepare('UPDATE delivery_note_items SET reversal_ledger_id = ? WHERE id = ?')
            .run(reversalId, item.id);
        }
      }
      getDatabase().prepare("UPDATE delivery_notes SET status = 'REJECTED' WHERE id = ?").run(id);
    });
    return this.findOne(id);
  }

  private resolveCustomerName(input: DeliveryNoteInput): string | null {
    if (input.customerName) return input.customerName;
    if (input.customerId === null || input.customerId === undefined) return null;
    const row = getDatabase().prepare('SELECT name FROM customers WHERE id = ?').get(input.customerId) as { name: string } | undefined;
    return row?.name ?? null;
  }

  private insertItems(noteId: number, items: DeliveryNoteItemInput[]): void {
    const insert = getDatabase()
      .prepare(`INSERT INTO delivery_note_items
                (delivery_note_id, seq, product_id, product_name, specs, spec_labels, unit,
                 quantity, unit_price, amount, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    items.forEach((item, index) => {
      if (item.productId !== undefined && item.productId !== null) this.assertProductExists(item.productId);
      const quantity = item.quantity ?? 0;
      const unitPrice = item.unitPrice ?? 0;
      insert.run(
        noteId,
        item.seq ?? index + 1,
        item.productId ?? null,
        item.productName,
        JSON.stringify(item.specs ?? {}),
        JSON.stringify(item.specLabels ?? {}),
        item.unit ?? null,
        quantity,
        unitPrice,
        quantity * unitPrice,
        item.remark ?? null,
      );
    });
  }

  private generateDeliveryNo(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    // 前缀取公司信息配置（如 YLD），留空时保持默认 DN；去掉空白与非单词字符，避免脏前缀进入单号。
    const configured = this.companyInfo.get().deliveryNoPrefix?.trim() ?? '';
    const prefix = configured.replace(/[^\w\u4e00-\u9fa5]/g, '') || 'DN';
    let deliveryNo = `${prefix}-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
    while (getDatabase().prepare('SELECT 1 FROM delivery_notes WHERE delivery_no = ?').get(deliveryNo)) {
      deliveryNo = `${prefix}-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
    }
    return deliveryNo;
  }

  private assertCustomerExists(customerId: number | null | undefined): void {
    if (customerId === null || customerId === undefined) return;
    if (!getDatabase().prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) {
      throw new NotFoundError('客户', customerId);
    }
  }

  private assertProductExists(productId: number): void {
    if (!getDatabase().prepare('SELECT 1 FROM products WHERE id = ?').get(productId)) {
      throw new NotFoundError('货品', productId);
    }
  }

  private findRow(id: number): NoteRow {
    const row = getDatabase()
      .prepare(`SELECT d.id, d.delivery_no, d.customer_id, d.customer_name, d.ship_address,
                       d.delivery_date, d.order_no, d.source_quotation_id, d.remarks, d.status
                FROM delivery_notes d WHERE d.id = ?`)
      .get(id) as NoteRow | undefined;
    if (!row) throw new NotFoundError('送货单', id);
    return row;
  }

  private itemRows(noteId: number): NoteItemRow[] {
    return getDatabase()
      .prepare('SELECT * FROM delivery_note_items WHERE delivery_note_id = ? ORDER BY seq')
      .all(noteId) as NoteItemRow[];
  }

  /**
   * 打印数据：主表 + 公司信息 + 明细 + 合计/大写金额。
   * 规格按每个明细自己货品所属品类渲染成单行摘要，多品类共存互不干扰。
   * 打印预览页与 docx 导出共用此数据，保证两处一致。
   */
  getPrintData(id: number): Record<string, unknown> {
    const dto = this.findOne(id);
    const company = this.companyInfo.get();
    const columns = ['序号', '订单号码', '品名', '规格', '单位', '数量', '单价', '金额(元)', '备注'];
    const total = dto.items.reduce((sum, item) => sum + item.amount, 0);
    return {
      title: '送   货   单',
      company: {
        name: company.name,
        address: company.address,
        phone: company.phone,
        mobile: company.mobile,
        businessScope: company.businessScope,
        maker: company.maker,
      },
      deliveryNo: dto.deliveryNo,
      deliveryDate: dto.deliveryDate,
      customerName: dto.customerName,
      shipAddress: dto.shipAddress,
      orderNo: dto.orderNo,
      remarks: dto.remarks,
      columns,
      items: dto.items.map((item) => ({
        seq: item.seq,
        orderNo: dto.orderNo,
        productName: item.productName,
        specText: formatSpecSummary(item.specs, item.specLabels, item.productId),
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        amount: item.amount,
        remark: item.remark,
      })),
      total: total.toFixed(2),
      totalChinese: amountToChinese(total),
    };
  }

  private toDto(row: NoteRow): DeliveryNoteDto {
    const items = this.itemRows(row.id).map((item) => ({
      id: item.id,
      seq: item.seq,
      productId: item.product_id,
      productName: item.product_name,
      specs: JSON.parse(item.specs || '{}') as Record<string, unknown>,
      specLabels: JSON.parse(item.spec_labels || '{}') as Record<string, string>,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      amount: item.amount,
      remark: item.remark,
      inventoryLedgerId: item.inventory_ledger_id,
      reversalLedgerId: item.reversal_ledger_id,
    }));
    return {
      id: row.id,
      deliveryNo: row.delivery_no,
      customerId: row.customer_id,
      customerName: row.customer_name,
      shipAddress: row.ship_address,
      deliveryDate: row.delivery_date,
      orderNo: row.order_no,
      sourceQuotationId: row.source_quotation_id,
      remarks: row.remarks,
      status: row.status,
      items,
    };
  }
}
