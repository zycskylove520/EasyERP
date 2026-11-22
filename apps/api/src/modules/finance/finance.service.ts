import { Injectable } from '@nestjs/common';
import { getDatabase, transaction } from '../../database/connection';
import { BadRequestError, NotFoundError } from '../../common/errors';

/** 收付款类型。 */
export type FinanceType = 'RECEIVE' | 'PAY';
/** 关联单据类型。 */
export type FinanceRefType = 'STATEMENT' | 'PURCHASE_ORDER';

/** 收付款记录视图。 */
export interface FinanceRecordDto {
  id: number;
  type: FinanceType;
  refType: FinanceRefType;
  refId: number;
  refNo: string | null;
  partyName: string | null;
  amount: number;
  recordDate: string;
  method: string | null;
  /** 收付款单号（SK/FK + 日期 + 序号，自动生成） */
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

/** 应收/应付行。 */
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

/** 财务汇总。 */
export interface FinanceSummary {
  receivableTotal: number;
  payableTotal: number;
  net: number;
  monthReceived: number;
  monthPaid: number;
  /** 近 12 个月收付款趋势 */
  trend: Array<{ month: string; received: number; paid: number }>;
}

/** 新增收付款输入。 */
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

interface FinanceRecordRow {
  id: number;
  type: FinanceType;
  ref_type: FinanceRefType;
  ref_id: number;
  ref_no: string | null;
  party_name: string | null;
  amount: number;
  record_date: string;
  method: string | null;
  record_no: string | null;
  handler: string | null;
  invoice_no: string | null;
  invoice_status: string | null;
  remark: string | null;
  created_at: string;
}

/**
 * 财务服务：基于已确认单据的应收应付 + 收付款登记。
 * 关键规则：只有已确认单据计入；单据打回后因状态变化自动不计入（JOIN 过滤 status）。
 */
@Injectable()
export class FinanceService {
  /** 应收列表：已确认对帐单，含已收/未收。 */
  receivables(): FinanceDueRow[] {
    return this.dueList('STATEMENT');
  }

  /** 应付列表：已确认订购单，含已付/未付。 */
  payables(): FinanceDueRow[] {
    return this.dueList('PURCHASE_ORDER');
  }

  private dueList(refType: FinanceRefType): FinanceDueRow[] {
    const db = getDatabase();
    const isStmt = refType === 'STATEMENT';
    const table = isStmt ? 'statements' : 'purchase_orders';
    const itemTable = isStmt ? 'statement_items' : 'purchase_order_items';
    const fk = isStmt ? 'statement_id' : 'purchase_order_id';
    const noCol = isStmt ? 'statement_no' : 'order_no';
    const dateCol = isStmt ? 'statement_date' : 'order_date';
    const partyCol = isStmt ? 'customer_name' : 'supplier_name';
    const payType: FinanceType = isStmt ? 'RECEIVE' : 'PAY';

    const rows = db.prepare(`
      SELECT d.id AS ref_id, d.${noCol} AS doc_no, d.${partyCol} AS party_name, d.${dateCol} AS doc_date,
             COALESCE(SUM(i.amount), 0) AS amount
      FROM ${table} d
      LEFT JOIN ${itemTable} i ON i.${fk} = d.id
      WHERE d.status = 'CONFIRMED'
      GROUP BY d.id
      ORDER BY d.${dateCol} DESC, d.id DESC
    `).all() as Array<{ ref_id: number; doc_no: string; party_name: string | null; doc_date: string; amount: number }>;

    return rows.map((r) => {
      // 只统计关联单据当前仍为 CONFIRMED 的收款/付款记录（打回自动失效、重新确认自动恢复）
      const paidRow = db.prepare(`
        SELECT COALESCE(SUM(f.amount), 0) AS v
        FROM finance_records f
        JOIN ${table} d ON d.id = f.ref_id
        WHERE f.ref_type = ? AND f.ref_id = ? AND f.type = ? AND d.status = 'CONFIRMED'
      `).get(refType, r.ref_id, payType) as { v: number };
      const received = Number(paidRow.v);
      const amount = Number(r.amount);
      return {
        refType, refId: r.ref_id, docNo: r.doc_no, partyName: r.party_name,
        docDate: r.doc_date, amount, received, balance: Number((amount - received).toFixed(2)),
      };
    });
  }

  /** 财务汇总 KPI + 近 12 月趋势。 */
  summary(): FinanceSummary {
    const db = getDatabase();
    const receivableTotal = this.dueList('STATEMENT').reduce((s, r) => s + r.balance, 0);
    const payableTotal = this.dueList('PURCHASE_ORDER').reduce((s, r) => s + r.balance, 0);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const monthSum = (type: FinanceType): number => {
      const row = db.prepare(`
        SELECT COALESCE(SUM(f.amount), 0) AS v
        FROM finance_records f
        JOIN ${type === 'RECEIVE' ? 'statements' : 'purchase_orders'} d ON d.id = f.ref_id
        WHERE f.type = ? AND substr(f.record_date,1,7) = ? AND d.status = 'CONFIRMED'
      `).get(type, currentMonth) as { v: number };
      return Number(row.v);
    };
    const monthReceived = monthSum('RECEIVE');
    const monthPaid = monthSum('PAY');

    // 近 12 个月收付款趋势（按 record_date 月份，只统计关联单据 CONFIRMED）
    const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const startMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
    // 收付款分属不同单据表，分别查询趋势
    const receivedRows = db.prepare(`
      SELECT substr(f.record_date,1,7) AS month, SUM(f.amount) AS v
      FROM finance_records f JOIN statements d ON d.id = f.ref_id
      WHERE f.type='RECEIVE' AND d.status='CONFIRMED' AND substr(f.record_date,1,7) >= ?
      GROUP BY month
    `).all(startMonth) as Array<{ month: string; v: number }>;
    const paidRows = db.prepare(`
      SELECT substr(f.record_date,1,7) AS month, SUM(f.amount) AS v
      FROM finance_records f JOIN purchase_orders d ON d.id = f.ref_id
      WHERE f.type='PAY' AND d.status='CONFIRMED' AND substr(f.record_date,1,7) >= ?
      GROUP BY month
    `).all(startMonth) as Array<{ month: string; v: number }>;
    const recvMap = new Map(receivedRows.map((r) => [r.month, Number(r.v)]));
    const paidMap = new Map(paidRows.map((r) => [r.month, Number(r.v)]));
    const trend: Array<{ month: string; received: number; paid: number }> = [];
    let [y, m] = startMonth.split('-').map(Number);
    for (let i = 0; i < 12; i++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      trend.push({ month: key, received: recvMap.get(key) ?? 0, paid: paidMap.get(key) ?? 0 });
      m += 1; if (m > 12) { m = 1; y += 1; }
    }

    return {
      receivableTotal: Number(receivableTotal.toFixed(2)),
      payableTotal: Number(payableTotal.toFixed(2)),
      net: Number((receivableTotal - payableTotal).toFixed(2)),
      monthReceived, monthPaid, trend,
    };
  }

  /** 收付款记录列表（可按类型/关联单据过滤）。 */
  records(type?: FinanceType, refId?: number): FinanceRecordDto[] {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    if (type) { conditions.push('f.type = ?'); params.push(type); }
    if (refId !== undefined) { conditions.push('f.ref_id = ?'); params.push(refId); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = getDatabase().prepare(`
      SELECT f.id, f.type, f.ref_type, f.ref_id, f.party_name, f.amount, f.record_date,
             f.method, f.record_no, f.handler, f.invoice_no, f.invoice_status, f.remark, f.created_at,
             CASE WHEN f.ref_type='STATEMENT'
               THEN (SELECT statement_no FROM statements WHERE id=f.ref_id)
               ELSE (SELECT order_no FROM purchase_orders WHERE id=f.ref_id) END AS ref_no
      FROM finance_records f ${where}
      ORDER BY f.record_date DESC, f.id DESC
    `).all(...params) as FinanceRecordRow[];
    return rows.map((r) => ({
      id: r.id, type: r.type, refType: r.ref_type, refId: r.ref_id, refNo: r.ref_no,
      partyName: r.party_name, amount: Number(r.amount), recordDate: r.record_date,
      method: r.method, recordNo: r.record_no, handler: r.handler,
      invoiceNo: r.invoice_no, invoiceStatus: r.invoice_status,
      remark: r.remark, createdAt: r.created_at,
    }));
  }

  /** 登记收付款：关联单据必须存在且为 CONFIRMED，金额>0 且不超过未结金额。 */
  create(input: FinanceRecordInput): FinanceRecordDto {
    this.validateInput(input);
    const { table, partyCol } = input.refType === 'STATEMENT'
      ? { table: 'statements', partyCol: 'customer_name' }
      : { table: 'purchase_orders', partyCol: 'supplier_name' };
    const id = transaction(() => {
      const doc = getDatabase().prepare(`SELECT ${partyCol} AS party FROM ${table} WHERE id = ?`).get(input.refId) as { party: string | null } | undefined;
      const recordNo = this.generateRecordNo(input.type);
      const result = getDatabase().prepare(`
        INSERT INTO finance_records
          (type, ref_type, ref_id, party_name, amount, record_date, method,
           record_no, handler, invoice_no, invoice_status, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        input.type, input.refType, input.refId, doc?.party ?? null,
        input.amount, input.recordDate, input.method ?? null,
        recordNo, input.handler ?? null, input.invoiceNo ?? null,
        input.invoiceStatus ?? null, input.remark ?? null,
      );
      return Number(result.lastInsertRowid);
    });
    return this.records().find((r) => r.id === id)!;
  }

  /** 删除收付款记录。 */
  remove(id: number): void {
    const row = getDatabase().prepare('SELECT id FROM finance_records WHERE id = ?').get(id);
    if (!row) throw new NotFoundError('收付款记录', id);
    getDatabase().prepare('DELETE FROM finance_records WHERE id = ?').run(id);
  }

  /** 生成收付款单号：收款 SK-、付款 FK- + 日期 + 4 位序号。 */
  private generateRecordNo(type: FinanceType): string {
    const prefix = type === 'RECEIVE' ? 'SK' : 'FK';
    const now = new Date();
    const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const db = getDatabase();
    let no = `${prefix}-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
    while (db.prepare('SELECT 1 FROM finance_records WHERE record_no = ?').get(no)) {
      no = `${prefix}-${date}-${Math.floor(Math.random() * 9000 + 1000)}`;
    }
    return no;
  }

  private validateInput(input: FinanceRecordInput): void {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestError('金额必须大于 0');
    }
    if (!input.recordDate) throw new BadRequestError('日期不能为空');
    const { table } = input.refType === 'STATEMENT'
      ? { table: 'statements' } : { table: 'purchase_orders' };
    const doc = getDatabase().prepare(`SELECT status FROM ${table} WHERE id = ?`).get(input.refId) as { status: string } | undefined;
    if (!doc) throw new NotFoundError(input.refType === 'STATEMENT' ? '对帐单' : '订购单', input.refId);
    if (doc.status !== 'CONFIRMED') throw new BadRequestError('只能对已确认的单据登记收付款');
    // 不超过未结金额
    const due = this.dueList(input.refType).find((r) => r.refId === input.refId);
    if (due && input.amount > due.balance + 1e-6) {
      throw new BadRequestError(`金额不能超过未结金额 ${due.balance}`);
    }
  }
}
