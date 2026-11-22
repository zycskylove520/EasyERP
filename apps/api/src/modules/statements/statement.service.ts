import { Injectable } from '@nestjs/common';
import { getDatabase, transaction } from '../../database/connection';
import { ConflictError, NotFoundError } from '../../common/errors';
import { DeliveryNoteService } from '../delivery-notes/delivery-note.service';
import { CompanyInfoService } from '../company-info/company-info.service';
import { CustomerService } from '../customers/customer.service';
import { amountToChinese } from '../../common/amount-to-chinese';

/** 对帐单状态。 */
export type StatementStatus = 'DRAFT' | 'CONFIRMED' | 'REJECTED';

/** 对帐单明细视图。 */
export interface StatementItemDto {
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

/** 对帐单视图（含明细）。 */
export interface StatementDto {
  id: number;
  statementNo: string;
  customerId: number | null;
  customerName: string | null;
  statementDate: string;
  attn: string | null;
  fax: string | null;
  from: string | null;
  currency: string;
  /** 整单全局备注（打印/导出在明细表下方显示）。 */
  remarks: string | null;
  status: StatementStatus;
  items: StatementItemDto[];
}

/** 对帐单明细输入。 */
export interface StatementItemInput {
  seq?: number;
  itemDate?: string | null;
  deliveryNo?: string | null;
  productName: string;
  unit?: string | null;
  quantity?: number;
  unitPrice?: number;
  remark?: string | null;
}

/** 对帐单输入。 */
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
  /** 汇总到的送货单数量（提示用）。 */
  deliveryCount: number;
}

interface StatementRow {
  id: number;
  statement_no: string;
  customer_id: number | null;
  customer_name: string | null;
  statement_date: string;
  attn: string | null;
  fax: string | null;
  from_party: string | null;
  currency: string;
  remarks: string | null;
  status: StatementStatus;
}

interface StatementItemRow {
  id: number;
  seq: number;
  item_date: string | null;
  delivery_no: string | null;
  product_name: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  amount: number;
  remark: string | null;
}

/** 对帐单服务：单据 CRUD、状态流转、按客户+月份汇总送货单。不涉及库存。 */
@Injectable()
export class StatementService {
  constructor(
    private readonly deliveryNotes: DeliveryNoteService,
    private readonly companyInfo: CompanyInfoService,
    private readonly customers: CustomerService,
  ) {}

  findAll(filter?: {
    statementNo?: string;
    customerId?: number;
    dateFrom?: string;
    dateTo?: string;
    group?: 'active' | 'rejected';
  }): StatementDto[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (filter?.statementNo) { conditions.push('s.statement_no LIKE ?'); params.push(`%${filter.statementNo}%`); }
    if (filter?.customerId !== undefined) { conditions.push('s.customer_id = ?'); params.push(filter.customerId); }
    if (filter?.dateFrom) { conditions.push('s.statement_date >= ?'); params.push(filter.dateFrom); }
    if (filter?.dateTo) { conditions.push('s.statement_date <= ?'); params.push(filter.dateTo); }
    if (filter?.group === 'active') conditions.push("s.status IN ('DRAFT','CONFIRMED')");
    if (filter?.group === 'rejected') conditions.push("s.status IN ('REJECTED')");
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = getDatabase()
      .prepare(`SELECT s.id, s.statement_no, s.customer_id, s.customer_name, s.statement_date,
                       s.attn, s.fax, s.from_party, s.currency, s.remarks, s.status
                FROM statements s ${where} ORDER BY s.id DESC`)
      .all(...params) as StatementRow[];
    return rows.map((row) => this.toDto(row));
  }

  findOne(id: number): StatementDto {
    return this.toDto(this.findRow(id));
  }

  /**
   * 按客户 + 月份汇总该客户当月已确认(CONFIRMED)的送货单明细，生成对帐单预填数据。
   * 月份按送货单出货日期(deliveryDate)筛选；打回/草稿不计入。
   */
  fromCustomerMonth(customerId: number, month: string): StatementFromCustomerMonth {
    const customer = this.customers.findOne(customerId);
    const company = this.companyInfo.get();

    // 取该客户所有活跃送货单，再按「已确认 + 出货日期落在所选月份」过滤
    const notes = this.deliveryNotes.findAll({ customerId, group: 'active' })
      .filter((n) => n.status === 'CONFIRMED' && n.deliveryDate?.slice(0, 7) === month)
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.id - b.id);

    const items: StatementItemInput[] = [];
    for (const note of notes) {
      for (const item of note.items) {
        items.push({
          itemDate: note.deliveryDate,
          deliveryNo: note.deliveryNo,
          productName: item.productName,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          remark: item.remark,
        });
      }
    }

    return {
      customerId,
      customerName: customer.name,
      attn: customer.contact,
      fax: null,
      from: company.maker,
      currency: company.currency || 'RMB',
      // 制单日期取所选月份第一天，贴合「制单月份」语义
      statementDate: `${month}-01`,
      month,
      items,
      deliveryCount: notes.length,
    };
  }

  create(input: StatementInput): StatementDto {
    const statementNo = this.generateStatementNo();
    const id = transaction(() => {
      this.assertCustomerExists(input.customerId);
      const result = getDatabase()
        .prepare(`INSERT INTO statements
                  (statement_no, customer_id, customer_name, statement_date, attn, fax, from_party, currency, remarks, status)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT')`)
        .run(
          statementNo,
          input.customerId ?? null,
          this.resolveCustomerName(input),
          input.statementDate,
          input.attn ?? null,
          input.fax ?? null,
          input.from ?? null,
          input.currency ?? 'RMB',
          input.remarks ?? null,
        );
      const newId = Number(result.lastInsertRowid);
      this.insertItems(newId, input.items);
      return newId;
    });
    return this.findOne(id);
  }

  duplicate(id: number): StatementDto {
    const source = this.findOne(id);
    return this.create({
      customerId: source.customerId,
      customerName: source.customerName,
      statementDate: new Date().toISOString().slice(0, 10),
      attn: source.attn,
      fax: source.fax,
      from: source.from,
      currency: source.currency,
      remarks: source.remarks,
      items: source.items.map((item) => ({
        itemDate: item.itemDate,
        deliveryNo: item.deliveryNo,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        remark: item.remark,
      })),
    });
  }

  update(id: number, input: StatementInput): StatementDto {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的对帐单可以编辑');
    transaction(() => {
      this.assertCustomerExists(input.customerId);
      getDatabase()
        .prepare(`UPDATE statements SET customer_id = ?, customer_name = ?, statement_date = ?,
                  attn = ?, fax = ?, from_party = ?, currency = ?, remarks = ? WHERE id = ?`)
        .run(
          input.customerId ?? null,
          this.resolveCustomerName(input),
          input.statementDate,
          input.attn ?? null,
          input.fax ?? null,
          input.from ?? null,
          input.currency ?? 'RMB',
          input.remarks ?? null,
          id,
        );
      getDatabase().prepare('DELETE FROM statement_items WHERE statement_id = ?').run(id);
      this.insertItems(id, input.items);
    });
    return this.findOne(id);
  }

  remove(id: number): void {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的对帐单可以删除');
    getDatabase().prepare('DELETE FROM statements WHERE id = ?').run(id);
  }

  confirm(id: number): StatementDto {
    const row = this.findRow(id);
    if (row.status !== 'DRAFT') throw new ConflictError('只有草稿状态的对帐单可以确认');
    getDatabase().prepare("UPDATE statements SET status = 'CONFIRMED' WHERE id = ?").run(id);
    return this.findOne(id);
  }

  /** 打回：CONFIRMED→REJECTED。对帐单不动库存，仅改状态；同时删除该单的关联收款记录。 */
  reject(id: number): StatementDto {
    const row = this.findRow(id);
    if (row.status !== 'CONFIRMED') throw new ConflictError('只有已确认的对帐单可以打回');
    transaction(() => {
      getDatabase().prepare("UPDATE statements SET status = 'REJECTED' WHERE id = ?").run(id);
      // 打回时同步删除关联收款记录（主人要求：对帐单打回→收款管理同步打回）
      getDatabase().prepare("DELETE FROM finance_records WHERE ref_type = 'STATEMENT' AND ref_id = ?").run(id);
    });
    return this.findOne(id);
  }

  private resolveCustomerName(input: StatementInput): string | null {
    if (input.customerName) return input.customerName;
    if (input.customerId === null || input.customerId === undefined) return null;
    const row = getDatabase().prepare('SELECT name FROM customers WHERE id = ?').get(input.customerId) as { name: string } | undefined;
    return row?.name ?? null;
  }

  private insertItems(statementId: number, items: StatementItemInput[]): void {
    const insert = getDatabase()
      .prepare(`INSERT INTO statement_items
                (statement_id, seq, item_date, delivery_no, product_name, unit,
                 quantity, unit_price, amount, remark)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    items.forEach((item, index) => {
      const quantity = item.quantity ?? 0;
      const unitPrice = item.unitPrice ?? 0;
      insert.run(
        statementId,
        item.seq ?? index + 1,
        item.itemDate ?? null,
        item.deliveryNo ?? null,
        item.productName,
        item.unit ?? null,
        quantity,
        unitPrice,
        quantity * unitPrice,
        item.remark ?? null,
      );
    });
  }

  private generateStatementNo(): string {
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    let statementNo = `ST-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
    while (getDatabase().prepare('SELECT 1 FROM statements WHERE statement_no = ?').get(statementNo)) {
      statementNo = `ST-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
    }
    return statementNo;
  }

  private assertCustomerExists(customerId: number | null | undefined): void {
    if (customerId === null || customerId === undefined) return;
    if (!getDatabase().prepare('SELECT 1 FROM customers WHERE id = ?').get(customerId)) {
      throw new NotFoundError('客户', customerId);
    }
  }

  private findRow(id: number): StatementRow {
    const row = getDatabase()
      .prepare(`SELECT s.id, s.statement_no, s.customer_id, s.customer_name, s.statement_date,
                       s.attn, s.fax, s.from_party, s.currency, s.remarks, s.status
                FROM statements s WHERE s.id = ?`)
      .get(id) as StatementRow | undefined;
    if (!row) throw new NotFoundError('对帐单', id);
    return row;
  }

  private itemRows(statementId: number): StatementItemRow[] {
    return getDatabase()
      .prepare('SELECT * FROM statement_items WHERE statement_id = ? ORDER BY seq')
      .all(statementId) as StatementItemRow[];
  }

  /** 打印数据：主表 + 公司信息 + 明细 + 合计/大写金额。打印预览与 docx 同源。 */
  getPrintData(id: number): Record<string, unknown> {
    const dto = this.findOne(id);
    const company = this.companyInfo.get();
    const total = dto.items.reduce((sum, item) => sum + item.amount, 0);
    const columns = ['日期', '送货单号', '品名', '单位', '数量', '单价', '金额', '备注'];
    return {
      title: '对   帐   单',
      company: { name: company.name, currency: company.currency, maker: company.maker },
      statementNo: dto.statementNo,
      customerName: dto.customerName,
      attn: dto.attn,
      statementDate: dto.statementDate,
      fax: dto.fax,
      from: dto.from ?? company.maker,
      currency: dto.currency || company.currency,
      remarks: dto.remarks,
      columns,
      items: dto.items.map((item) => ({
        itemDate: item.itemDate,
        deliveryNo: item.deliveryNo,
        productName: item.productName,
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

  private toDto(row: StatementRow): StatementDto {
    const items = this.itemRows(row.id).map((item) => ({
      id: item.id,
      seq: item.seq,
      itemDate: item.item_date,
      deliveryNo: item.delivery_no,
      productName: item.product_name,
      unit: item.unit,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      amount: item.amount,
      remark: item.remark,
    }));
    return {
      id: row.id,
      statementNo: row.statement_no,
      customerId: row.customer_id,
      customerName: row.customer_name,
      statementDate: row.statement_date,
      attn: row.attn,
      fax: row.fax,
      from: row.from_party,
      currency: row.currency,
      remarks: row.remarks,
      status: row.status,
      items,
    };
  }
}
