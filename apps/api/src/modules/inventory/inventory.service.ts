import { Injectable } from '@nestjs/common';
import { getDatabase, transaction } from '../../database/connection';
import { ConflictError, NotFoundError } from '../../common/errors';

/** 库存流水原因（与 schema CHECK 约束一致）。 */
export type LedgerReason =
  | 'INITIAL'
  | 'MANUAL_ADJUST'
  | 'DELIVERY_CONSUME'
  | 'DELIVERY_REVERSE'
  | 'PO_RECEIVE'
  | 'PO_REVERSE';

/** 当前库存汇总视图。 */
export interface StockDto {
  productId: number;
  productName: string;
  categoryName: string;
  unit: string;
  quantity: number;
}

/** 库存流水视图。 */
export interface LedgerDto {
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

interface StockRow {
  product_id: number;
  product_name: string;
  category_name: string;
  unit: string;
  quantity: number | null;
}

interface LedgerRow {
  id: number;
  product_id: number;
  product_name: string;
  delta: number;
  reason: LedgerReason;
  ref_type: string | null;
  ref_id: number | null;
  reversal_of: number | null;
  note: string | null;
  created_at: string;
}

/**
 * 库存服务：流水账模型。
 * 当前库存永远是流水 delta 的累加结果，历史流水不可变。
 */
@Injectable()
export class InventoryService {
  /**
   * 当前库存汇总：列出所有货品及其库存（无流水则为 0）。
   * 可按品类筛选。
   */
  getStock(categoryId?: number): StockDto[] {
    const sql = `SELECT p.id AS product_id, p.name AS product_name,
                        c.name AS category_name, p.unit,
                        SUM(l.delta) AS quantity
                 FROM products p
                 JOIN product_categories c ON c.id = p.category_id
                 LEFT JOIN inventory_ledger l ON l.product_id = p.id
                 ${categoryId !== undefined ? 'WHERE p.category_id = ?' : ''}
                 GROUP BY p.id
                 ORDER BY p.id`;
    const rows = (categoryId !== undefined
      ? getDatabase().prepare(sql).all(categoryId)
      : getDatabase().prepare(sql).all()) as StockRow[];
    return rows.map((row) => ({
      productId: row.product_id,
      productName: row.product_name,
      categoryName: row.category_name,
      unit: row.unit,
      quantity: row.quantity ?? 0,
    }));
  }

  /** 查询某货品当前库存（不存在返回 0）。 */
  getQuantity(productId: number): number {
    this.assertProductExists(productId);
    const row = getDatabase()
      .prepare('SELECT COALESCE(SUM(delta), 0) AS quantity FROM inventory_ledger WHERE product_id = ?')
      .get(productId) as { quantity: number };
    return row.quantity;
  }

  /** 查询库存流水，可按货品、原因筛选；最新的在前。 */
  getLedger(productId?: number, reason?: LedgerReason): LedgerDto[] {
    const conditions: string[] = [];
    const params: Array<number | string> = [];
    if (productId !== undefined) {
      conditions.push('l.product_id = ?');
      params.push(productId);
    }
    if (reason !== undefined) {
      conditions.push('l.reason = ?');
      params.push(reason);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = getDatabase()
      .prepare(`SELECT l.id, l.product_id, p.name AS product_name, l.delta, l.reason,
                       l.ref_type, l.ref_id, l.reversal_of, l.note, l.created_at
                FROM inventory_ledger l JOIN products p ON p.id = l.product_id
                ${where}
                ORDER BY l.id DESC`)
      .all(...params) as LedgerRow[];
    return rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      delta: row.delta,
      reason: row.reason,
      refType: row.ref_type,
      refId: row.ref_id,
      reversalOf: row.reversal_of,
      note: row.note,
      createdAt: row.created_at,
    }));
  }

  /**
   * 设置期初库存：每个货品只允许一次（幂等）。
   * 已有任何流水时拒绝，避免与后续变动冲突。
   */
  setInitial(productId: number, quantity: number, note?: string): LedgerDto {
    this.assertProductExists(productId);
    return transaction(() => {
      const existing = getDatabase()
        .prepare('SELECT 1 FROM inventory_ledger WHERE product_id = ? LIMIT 1')
        .get(productId);
      if (existing) throw new ConflictError('该货品已有库存流水，不能重复设置期初');
      const result = getDatabase()
        .prepare(`INSERT INTO inventory_ledger (product_id, delta, reason, note)
                  VALUES (?, ?, 'INITIAL', ?)`)
        .run(productId, quantity, note ?? null);
      return this.findLedgerRow(Number(result.lastInsertRowid));
    });
  }

  /** 手工调整库存：delta 可正可负，必须非 0。 */
  adjust(productId: number, delta: number, note?: string): LedgerDto {
    this.assertProductExists(productId);
    if (!Number.isFinite(delta) || delta === 0) {
      throw new ConflictError('调整数量必须是非 0 的数字');
    }
    const result = getDatabase()
      .prepare(`INSERT INTO inventory_ledger (product_id, delta, reason, note)
                VALUES (?, ?, 'MANUAL_ADJUST', ?)`)
      .run(productId, delta, note ?? null);
    return this.findLedgerRow(Number(result.lastInsertRowid));
  }

  /**
   * 手工调整（目标值模式）：直接把库存设为指定数量。
   * 内部算出 差额 = 目标 - 当前，记作一条 MANUAL_ADJUST 流水（保留可追溯性）。
   * 目标必须 ≥ 0；差额为 0 时不做任何变更。
   */
  setQuantity(productId: number, target: number, note?: string): LedgerDto {
    this.assertProductExists(productId);
    if (!Number.isFinite(target) || target < 0) {
      throw new ConflictError('目标库存必须是非负数');
    }
    return transaction(() => {
      const current = this.getQuantity(productId);
      const delta = target - current;
      if (delta === 0) {
        throw new ConflictError('目标库存与当前库存相同，无需调整');
      }
      const result = getDatabase()
        .prepare(`INSERT INTO inventory_ledger (product_id, delta, reason, note)
                  VALUES (?, ?, 'MANUAL_ADJUST', ?)`)
        .run(productId, delta, note ?? null);
      return this.findLedgerRow(Number(result.lastInsertRowid));
    });
  }

  /**
   * 订购单确认加库（正 delta，ref_type='purchase_order'）。
   * 不自行开事务——由调用方把状态变更与多行加库包在同一事务。
   * @returns 加库流水 id 与加库后的库存余量
   */
  receive(productId: number, quantity: number, refId: number, note?: string): { ledgerId: number; remaining: number } {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ConflictError('入库数量必须大于 0');
    }
    const result = getDatabase()
      .prepare(`INSERT INTO inventory_ledger
                (product_id, delta, reason, ref_type, ref_id, note)
                VALUES (?, ?, 'PO_RECEIVE', 'purchase_order', ?, ?)`)
      .run(productId, quantity, refId, note ?? null);
    const remaining = this.getQuantity(productId);
    return { ledgerId: Number(result.lastInsertRowid), remaining };
  }

  /**
   * 送货单确认扣库（负 delta，ref_type='delivery_note'）。
   * 允许扣成负数；不自行开事务，由调用方包事务。
   * @returns 扣减流水 id 与扣减后的库存余量（供调用方判断低库存提醒）
   */
  consumeDelivery(productId: number, quantity: number, refId: number, note?: string): { ledgerId: number; remaining: number } {
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new ConflictError('扣减数量必须大于 0');
    }
    const result = getDatabase()
      .prepare(`INSERT INTO inventory_ledger
                (product_id, delta, reason, ref_type, ref_id, note)
                VALUES (?, ?, 'DELIVERY_CONSUME', 'delivery_note', ?, ?)`)
      .run(productId, -quantity, refId, note ?? null);
    const remaining = this.getQuantity(productId);
    return { ledgerId: Number(result.lastInsertRowid), remaining };
  }

  /**
   * 通用冲销：按原流水的反方向记账（加库流水→减回，扣库流水→还回）。
   * reversal_of 指向原流水并查重保证幂等；不自行开事务。
   * @param reason 冲销原因（PO_REVERSE / DELIVERY_REVERSE）
   * @param delta 冲销数量（带符号：减库传负数，还库传正数）
   * @returns 新建冲销流水 id
   */
  reverseFlow(
    productId: number,
    delta: number,
    reason: Extract<LedgerReason, 'PO_REVERSE' | 'DELIVERY_REVERSE'>,
    originalLedgerId: number,
    refId: number,
    note?: string,
  ): number {
    const refType = reason === 'PO_REVERSE' ? 'purchase_order' : 'delivery_note';
    const alreadyReversed = getDatabase()
      .prepare('SELECT 1 FROM inventory_ledger WHERE reversal_of = ? LIMIT 1')
      .get(originalLedgerId);
    if (alreadyReversed) throw new ConflictError('该流水已被冲销，不能重复打回');
    const result = getDatabase()
      .prepare(`INSERT INTO inventory_ledger
                (product_id, delta, reason, ref_type, ref_id, reversal_of, note)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(productId, delta, reason, refType, refId, originalLedgerId, note ?? null);
    return Number(result.lastInsertRowid);
  }

  private assertProductExists(productId: number): void {
    const exists = getDatabase().prepare('SELECT 1 FROM products WHERE id = ?').get(productId);
    if (!exists) throw new NotFoundError('货品', productId);
  }

  private findLedgerRow(id: number): LedgerDto {
    const row = getDatabase()
      .prepare(`SELECT l.id, l.product_id, p.name AS product_name, l.delta, l.reason,
                       l.ref_type, l.ref_id, l.reversal_of, l.note, l.created_at
                FROM inventory_ledger l JOIN products p ON p.id = l.product_id WHERE l.id = ?`)
      .get(id) as LedgerRow | undefined;
    if (!row) throw new NotFoundError('库存流水', id);
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      delta: row.delta,
      reason: row.reason,
      refType: row.ref_type,
      refId: row.ref_id,
      reversalOf: row.reversal_of,
      note: row.note,
      createdAt: row.created_at,
    };
  }
}
