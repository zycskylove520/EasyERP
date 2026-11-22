import { Injectable } from '@nestjs/common';
import { getDatabase, transaction } from '../../database/connection';
import { ConflictError, NotFoundError } from '../../common/errors';
import { InventoryService } from '../inventory/inventory.service';
import { CompanyInfoService } from '../company-info/company-info.service';
import { formatSpecSummary } from '../../common/dynamic-specs';

/** 订购单状态。 */
export type PurchaseOrderStatus = 'DRAFT' | 'CONFIRMED' | 'REJECTED';

/** 订购单明细视图。规格按品类字段拆成 specs。 */
export interface PurchaseOrderItemDto {
  id: number;
  seq: number;
  productId: number | null;
  productName: string;
  /** 结构化规格，按品类 spec_schema 拆列 */
  specs: Record<string, unknown>;
  /** 规格字段名制单时快照 */
  specLabels: Record<string, string>;
  unit: string | null;
  quantity: number;
  /** 单价 / 金额（应付账款金额来源） */
  unitPrice: number;
  amount: number;
  remark: string | null;
  inventoryLedgerId: number | null;
  reversalLedgerId: number | null;
}

/** 订购单视图（含明细）。交货期在表头。 */
export interface PurchaseOrderDto {
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
  /** 备注条款（每行一条，客户制单时填写；空表示无条款）。 */
  terms: string | null;
  /** 表尾备注（客户制单时填写；空表示无备注）。 */
  footnote: string | null;
  status: PurchaseOrderStatus;
  items: PurchaseOrderItemDto[];
}

/** 订购单明细输入。productId 可选：提供则确认时加该货品库存。 */
export interface PurchaseOrderItemInput {
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

/** 订购单输入。 */
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

/** 确认订购单结果：单据本身 + 加库后库存不足（低于 0 不会发生，保留兼容结构）。 */
export interface PurchaseOrderConfirmResult {
  order: PurchaseOrderDto;
  lowStock: Array<{ productId: number; productName: string; remaining: number }>;
}

interface OrderRow {
  id: number;
  order_no: string;
  supplier_id: number | null;
  supplier_name: string | null;
  order_date: string;
  delivery_date: string | null;
  attn: string | null;
  fax: string | null;
  currency: string;
  fm: string | null;
  terms: string | null;
  footnote: string | null;
  status: PurchaseOrderStatus;
}

interface OrderItemRow {
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
 * 订购单服务：采购侧单据 CRUD、状态流转、确认加库 / 打回减库。
 * 加库与冲销均在事务内与状态变更原子提交。
 */
@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly inventory: InventoryService,
    private readonly companyInfo: CompanyInfoService,
  ) {}

  /** 列表：可按单号/供应商/日期筛选，group 区分活跃与打回。 */
  findAll(filter?: {
    orderNo?: string;
    supplierId?: number;
    dateFrom?: string;
    dateTo?: string;
    group?: 'active' | 'rejected';
  }): PurchaseOrderDto[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (filter?.orderNo) { conditions.push('o.order_no LIKE ?'); params.push(`%${filter.orderNo}%`); }
    if (filter?.supplierId !== undefined) { conditions.push('o.supplier_id = ?'); params.push(filter.supplierId); }
    if (filter?.dateFrom) { conditions.push('o.order_date >= ?'); params.push(filter.dateFrom); }
    if (filter?.dateTo) { conditions.push('o.order_date <= ?'); params.push(filter.dateTo); }
    if (filter?.group === 'active') conditions.push("o.status IN ('DRAFT','CONFIRMED')");
    if (filter?.group === 'rejected') conditions.push("o.status IN ('REJECTED')");
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = getDatabase()
      .prepare(`SELECT o.id, o.order_no, o.supplier_id, o.supplier_name, o.order_date, o.delivery_date,
                       o.attn, o.fax, o.currency, o.fm, o.terms, o.footnote, o.status
                FROM purchase_orders o ${where} ORDER BY o.id DESC`)
      .all(...params) as OrderRow[];
    return rows.map((row) => this.toDto(row));
  }

  findOne(id: number): PurchaseOrderDto {
    return this.toDto(this.findRow(id));
  }

  /** 新建订购单（草稿，不动库存）。 */
  create(input: PurchaseOrderInput): PurchaseOrderDto {
    const orderNo = this.generateOrderNo();
    const id = transaction(() => {
      this.assertSupplierExists(input.supplierId);
      const result = getDatabase()
        .prepare(`INSERT INTO purchase_orders
                  (order_no, supplier_id, supplier_name, order_date, delivery_date, attn, fax, currency, fm, terms, footnote, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`)
        .run(
          orderNo,
          input.supplierId ?? null,
          this.resolveSupplierName(input),
          input.orderDate,
          input.deliveryDate ?? null,
          input.attn ?? null,
          input.fax ?? null,
          input.currency ?? 'RMB',
          input.fm ?? null,
          input.terms ?? null,
          input.footnote ?? null,
        );
      const newId = Number(result.lastInsertRowid);
      this.insertItems(newId, input.items);
      return newId;
    });
    return this.findOne(id);
  }

  /** 复制为新草稿单，单号与日期更新，不复制库存流水引用。 */
  duplicate(id: number): PurchaseOrderDto {
    const source = this.findOne(id);
    return this.create({
      supplierId: source.supplierId,
      supplierName: source.supplierName,
      orderDate: new Date().toISOString().slice(0, 10),
      deliveryDate: source.deliveryDate,
      attn: source.attn,
      fax: source.fax,
      currency: source.currency,
      fm: source.fm,
      terms: source.terms,
      footnote: source.footnote,
      items: source.items.map((item) => ({
        seq: item.seq,
        productId: item.productId,
        productName: item.productName,
        specs: item.specs,
        specLabels: item.specLabels,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        remark: item.remark,
      })),
    });
  }

  /** 更新：仅草稿可改，明细全量替换。 */
  update(id: number, input: PurchaseOrderInput): PurchaseOrderDto {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的订购单可以编辑');
    transaction(() => {
      this.assertSupplierExists(input.supplierId);
      getDatabase()
        .prepare(`UPDATE purchase_orders SET supplier_id = ?, supplier_name = ?, order_date = ?,
                  delivery_date = ?, attn = ?, fax = ?, currency = ?, fm = ?, terms = ?, footnote = ? WHERE id = ?`)
        .run(
          input.supplierId ?? null,
          this.resolveSupplierName(input),
          input.orderDate,
          input.deliveryDate ?? null,
          input.attn ?? null,
          input.fax ?? null,
          input.currency ?? 'RMB',
          input.fm ?? null,
          input.terms ?? null,
          input.footnote ?? null,
          id,
        );
      getDatabase().prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(id);
      this.insertItems(id, input.items);
    });
    return this.findOne(id);
  }

  /** 删除：仅草稿可删。 */
  remove(id: number): void {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的订购单可以删除');
    getDatabase().prepare('DELETE FROM purchase_orders WHERE id = ?').run(id);
  }

  /** 确认：DRAFT→CONFIRMED，逐明细按 productId 加库（PO_RECEIVE），事务原子。 */
  confirm(id: number): PurchaseOrderConfirmResult {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的订购单可以确认');
    const lowStock: PurchaseOrderConfirmResult['lowStock'] = [];
    transaction(() => {
      for (const item of this.itemRows(id)) {
        if (item.product_id !== null && item.quantity > 0) {
          const { ledgerId, remaining } = this.inventory.receive(
            item.product_id,
            item.quantity,
            id,
            `订购单 ${row.order_no} 入库`,
          );
          getDatabase()
            .prepare('UPDATE purchase_order_items SET inventory_ledger_id = ? WHERE id = ?')
            .run(ledgerId, item.id);
          if (remaining < 0) lowStock.push({ productId: item.product_id, productName: item.product_name, remaining });
        }
      }
      getDatabase().prepare("UPDATE purchase_orders SET status = 'CONFIRMED' WHERE id = ?").run(id);
    });
    return { order: this.findOne(id), lowStock };
  }

  /** 打回：CONFIRMED→REJECTED，冲销加库流水（PO_REVERSE 减回），幂等。 */
  reject(id: number): PurchaseOrderDto {
    const row = this.findRow(id);
    if (row.status !== 'CONFIRMED') throw new ConflictError('只有已确认的订购单可以打回');
    transaction(() => {
      for (const item of this.itemRows(id)) {
        if (item.inventory_ledger_id !== null && item.product_id !== null && item.quantity > 0) {
          const reversalId = this.inventory.reverseFlow(
            item.product_id,
            -item.quantity,
            'PO_REVERSE',
            item.inventory_ledger_id,
            id,
            `订购单 ${row.order_no} REJECTED冲销`,
          );
          getDatabase()
            .prepare('UPDATE purchase_order_items SET reversal_ledger_id = ? WHERE id = ?')
            .run(reversalId, item.id);
        }
      }
      getDatabase().prepare("UPDATE purchase_orders SET status = 'REJECTED' WHERE id = ?").run(id);
      // 打回时同步删除关联付款记录（主人要求：订购单打回→付款管理同步打回）
      getDatabase().prepare("DELETE FROM finance_records WHERE ref_type = 'PURCHASE_ORDER' AND ref_id = ?").run(id);
    });
    return this.findOne(id);
  }

  private resolveSupplierName(input: PurchaseOrderInput): string | null {
    if (input.supplierName) return input.supplierName;
    if (input.supplierId === null || input.supplierId === undefined) return null;
    const row = getDatabase().prepare('SELECT name FROM suppliers WHERE id = ?').get(input.supplierId) as { name: string } | undefined;
    return row?.name ?? null;
  }

  private insertItems(orderId: number, items: PurchaseOrderItemInput[]): void {
    const insert = getDatabase()
      .prepare(`INSERT INTO purchase_order_items
                (purchase_order_id, seq, product_id, product_name, specs, spec_labels, unit,
                 quantity, unit_price, amount, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    items.forEach((item, index) => {
      if (item.productId !== undefined && item.productId !== null) this.assertProductExists(item.productId);
      const quantity = item.quantity ?? 0;
      const unitPrice = item.unitPrice ?? 0;
      insert.run(
        orderId,
        item.seq ?? index + 1,
        item.productId ?? null,
        item.productName,
        JSON.stringify(item.specs ?? {}),
        JSON.stringify(item.specLabels ?? {}),
        item.unit ?? null,
        quantity,
        unitPrice,
        Number((quantity * unitPrice).toFixed(2)),
        item.remark ?? null,
      );
    });
  }

  private generateOrderNo(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    let orderNo = `PO-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
    while (getDatabase().prepare('SELECT 1 FROM purchase_orders WHERE order_no = ?').get(orderNo)) {
      orderNo = `PO-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
    }
    return orderNo;
  }

  private assertSupplierExists(supplierId: number | null | undefined): void {
    if (supplierId === null || supplierId === undefined) return;
    if (!getDatabase().prepare('SELECT 1 FROM suppliers WHERE id = ?').get(supplierId)) {
      throw new NotFoundError('供应商', supplierId);
    }
  }

  private assertProductExists(productId: number): void {
    if (!getDatabase().prepare('SELECT 1 FROM products WHERE id = ?').get(productId)) {
      throw new NotFoundError('货品', productId);
    }
  }

  private findRow(id: number): OrderRow {
    const row = getDatabase()
      .prepare(`SELECT o.id, o.order_no, o.supplier_id, o.supplier_name, o.order_date, o.delivery_date,
                       o.attn, o.fax, o.currency, o.fm, o.terms, o.footnote, o.status
                FROM purchase_orders o WHERE o.id = ?`)
      .get(id) as OrderRow | undefined;
    if (!row) throw new NotFoundError('订购单', id);
    return row;
  }

  private itemRows(orderId: number): OrderItemRow[] {
    return getDatabase()
      .prepare('SELECT * FROM purchase_order_items WHERE purchase_order_id = ? ORDER BY seq')
      .all(orderId) as OrderItemRow[];
  }

  /** 安全解析明细里的 JSON 列（坏数据回退空对象）。 */
  private parseJson(raw: string): Record<string, unknown> {
    try { return JSON.parse(raw || '{}') as Record<string, unknown>; }
    catch { return {}; }
  }

  /**
   * 打印数据：主表 + 公司信息 + 明细 + 条款。
   * 规格按每个明细自己货品所属品类渲染成单行摘要，多品类共存互不干扰；打印预览与 docx 同源。
   */
  getPrintData(id: number): Record<string, unknown> {
    const dto = this.findOne(id);
    const company = this.companyInfo.get();
    const columns = ['序号', '品名', '规格', '单位', '数量', '备注'];

    return {
      title: '订   购   单',
      company: {
        name: company.name,
        address: company.address,
        phone: company.phone,
        fax: company.fax,
        maker: company.maker,
      },
      orderNo: dto.orderNo,
      orderDate: dto.orderDate,
      deliveryDate: dto.deliveryDate,
      supplierName: dto.supplierName,
      attn: dto.attn,
      fax: dto.fax,
      currency: dto.currency,
      fm: dto.fm ?? company.maker,
      columns,
      items: dto.items.map((item) => ({
        seq: item.seq,
        productName: item.productName,
        specText: formatSpecSummary(item.specs, item.specLabels, item.productId),
        unit: item.unit,
        quantity: item.quantity,
        remark: item.remark,
      })),
      terms: dto.terms?.trim()
        ? dto.terms.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        : [],
      footnote: dto.footnote?.trim() ? dto.footnote : '',
    };
  }

  private toDto(row: OrderRow): PurchaseOrderDto {
    const items = this.itemRows(row.id).map((item) => ({
      id: item.id,
      seq: item.seq,
      productId: item.product_id,
      productName: item.product_name,
      specs: this.parseJson(item.specs),
      specLabels: this.parseJson(item.spec_labels) as Record<string, string>,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price ?? 0),
      amount: Number(item.amount ?? 0),
      remark: item.remark,
      inventoryLedgerId: item.inventory_ledger_id,
      reversalLedgerId: item.reversal_ledger_id,
    }));
    return {
      id: row.id,
      orderNo: row.order_no,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      orderDate: row.order_date,
      deliveryDate: row.delivery_date,
      attn: row.attn,
      fax: row.fax,
      currency: row.currency,
      fm: row.fm,
      terms: row.terms,
      footnote: row.footnote,
      status: row.status,
      items,
    };
  }
}
