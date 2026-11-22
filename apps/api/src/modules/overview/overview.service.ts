import { Injectable } from '@nestjs/common';
import { getDatabase } from '../../database/connection';

/** 概览聚合数据（一次性返回给前端图表看板）。 */
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
  /** 库存数量按品类分布（饼图；value 为绝对值，actual 为实际正负值） */
  stockByCategory: Array<{ name: string; value: number; actual: number }>;
  /** 送货金额月度趋势（折线图） */
  deliveryTrend: Array<{ month: string; amount: number }>;
  /** 单据状态分布（堆叠柱状） */
  docStatus: {
    quotations: { draft: number; confirmed: number; rejected: number };
    purchaseOrders: { draft: number; confirmed: number; rejected: number };
    deliveryNotes: { draft: number; confirmed: number; rejected: number };
    statements: { draft: number; confirmed: number; rejected: number };
  };
  /** 客户对帐金额排行（横向柱状） */
  customerStatementRank: Array<{ name: string; amount: number }>;
  /** 库存流水出入库趋势（按 reason 的柱状/多系列） */
  ledgerTrend: Array<{ month: string; reason: string; delta: number }>;
  /** 负库存预警（表格） */
  negativeStock: Array<{ productName: string; categoryName: string; quantity: number }>;
  /** 畅出货品 TOP10（柱状） */
  topProducts: Array<{ name: string; quantity: number }>;
}

/**
 * 概览服务：把散落在各业务表的数据一次性聚合成看板数据。
 * 全部走 SQL 聚合，口径与库存模块一致（当前库存 = 流水 delta 之和）。
 */
@Injectable()
export class OverviewService {
  get(months: number): OverviewData {
    const db = getDatabase();
    const windowMonths = Math.max(1, Math.min(months, 120));
    // 近 N 个月的起始月份（含当月），YYYY-MM
    const startMonth = this.monthOffset(-(windowMonths - 1));

    // --- KPI ---
    const scalar = (sql: string, ...params: Array<string | number>): number => {
      const row = db.prepare(sql).get(...params) as { v: number | null } | undefined;
      return Number(row?.v ?? 0);
    };
    const productCount = scalar('SELECT COUNT(*) AS v FROM products');
    const categoryCount = scalar('SELECT COUNT(*) AS v FROM product_categories');
    const customerCount = scalar('SELECT COUNT(*) AS v FROM customers');
    const supplierCount = scalar('SELECT COUNT(*) AS v FROM suppliers');
    const currentMonth = this.monthOffset(0);

    // 当前库存总量 + 负库存数量（口径：按货品 SUM(delta)）
    const stockRows = db.prepare(`
      SELECT SUM(l.delta) AS qty
      FROM products p
      LEFT JOIN inventory_ledger l ON l.product_id = p.id
      GROUP BY p.id
    `).all() as Array<{ qty: number | null }>;
    const stockTotal = stockRows.reduce((s, r) => s + Number(r.qty ?? 0), 0);
    const negativeStockCount = stockRows.filter((r) => Number(r.qty ?? 0) < 0).length;

    const monthQuotations = scalar("SELECT COUNT(*) AS v FROM quotations WHERE substr(quote_date,1,7) = ?", currentMonth);
    const monthDeliveries = scalar("SELECT COUNT(*) AS v FROM delivery_notes WHERE substr(delivery_date,1,7) = ?", currentMonth);
    const monthStatements = scalar("SELECT COUNT(*) AS v FROM statements WHERE substr(statement_date,1,7) = ?", currentMonth);

    // --- 库存按品类分布（饼图）---
    // 饼图用绝对值作扇区大小（ECharts 饼图不支持负值），actual 保留实际正负供标注；
    // 负库存不剔除，避免整库为负时饼图空白。
    const stockByCategory = (db.prepare(`
      SELECT c.name AS name,
             ABS(COALESCE(SUM(l.delta), 0)) AS value,
             COALESCE(SUM(l.delta), 0) AS actual
      FROM product_categories c
      JOIN products p ON p.category_id = c.id
      LEFT JOIN inventory_ledger l ON l.product_id = p.id
      GROUP BY c.id
      HAVING ABS(COALESCE(SUM(l.delta), 0)) > 0
      ORDER BY value DESC
    `).all() as Array<{ name: string; value: number; actual: number }>).map((r) => ({
      name: r.name, value: Number(r.value), actual: Number(r.actual),
    }));

    // --- 送货金额月度趋势（折线图）：近 N 月补零 ---
    const deliveryRows = db.prepare(`
      SELECT substr(d.delivery_date,1,7) AS month, SUM(i.amount) AS amount
      FROM delivery_notes d
      JOIN delivery_note_items i ON i.delivery_note_id = d.id
      WHERE d.status = 'CONFIRMED' AND substr(d.delivery_date,1,7) >= ?
      GROUP BY month ORDER BY month
    `).all(startMonth) as Array<{ month: string; amount: number }>;
    const deliveryMap = new Map(deliveryRows.map((r) => [r.month, Number(r.amount)]));
    const deliveryTrend = this.monthsRange(startMonth, currentMonth).map((m) => ({ month: m, amount: deliveryMap.get(m) ?? 0 }));

    // --- 单据状态分布（堆叠柱状）---
    const docStatus = {
      quotations: this.statusCounts('quotations', 'quote_date', currentMonth),
      purchaseOrders: this.statusCounts('purchase_orders', 'order_date', currentMonth),
      deliveryNotes: this.statusCounts('delivery_notes', 'delivery_date', currentMonth),
      statements: this.statusCounts('statements', 'statement_date', currentMonth),
    };

    // --- 客户对帐金额排行（横向柱状，TOP 8）---
    const customerStatementRank = (db.prepare(`
      SELECT s.customer_name AS name, SUM(i.amount) AS amount
      FROM statements s
      JOIN statement_items i ON i.statement_id = s.id
      WHERE s.customer_name IS NOT NULL
      GROUP BY s.customer_name
      ORDER BY amount DESC LIMIT 8
    `).all() as Array<{ name: string; amount: number }>).map((r) => ({ name: r.name, amount: Number(r.amount) }));

    // --- 库存流水出入库趋势（按 reason，近 N 月）---
    const ledgerRows = db.prepare(`
      SELECT substr(created_at,1,7) AS month, reason, SUM(delta) AS delta
      FROM inventory_ledger
      WHERE substr(created_at,1,7) >= ?
      GROUP BY month, reason ORDER BY month, reason
    `).all(startMonth) as Array<{ month: string; reason: string; delta: number }>;
    const ledgerTrend = ledgerRows.map((r) => ({ month: r.month, reason: r.reason, delta: Number(r.delta) }));

    // --- 负库存预警（表格）---
    const negativeStock = (db.prepare(`
      SELECT p.name AS productName, c.name AS categoryName, SUM(l.delta) AS quantity
      FROM products p
      JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN inventory_ledger l ON l.product_id = p.id
      GROUP BY p.id
      HAVING SUM(l.delta) < 0
      ORDER BY quantity ASC
    `).all() as Array<{ productName: string; categoryName: string; quantity: number }>)
      .map((r) => ({ productName: r.productName, categoryName: r.categoryName, quantity: Number(r.quantity) }));

    // --- 畅出货品 TOP10（柱状）---
    const topProducts = (db.prepare(`
      SELECT product_name AS name, SUM(quantity) AS quantity
      FROM delivery_note_items
      WHERE product_name IS NOT NULL AND product_name <> ''
      GROUP BY product_name
      ORDER BY quantity DESC LIMIT 10
    `).all() as Array<{ name: string; quantity: number }>).map((r) => ({ name: r.name, quantity: Number(r.quantity) }));

    return {
      generatedAt: new Date().toISOString(),
      months: windowMonths,
      kpi: {
        productCount, categoryCount, customerCount, supplierCount,
        stockTotal, negativeStockCount, monthQuotations, monthDeliveries, monthStatements,
      },
      stockByCategory,
      deliveryTrend,
      docStatus,
      customerStatementRank,
      ledgerTrend,
      negativeStock,
      topProducts,
    };
  }

  /** 单据状态统计（近当月，草稿/已确认/打回）。 */
  private statusCounts(table: string, dateCol: string, month: string) {
    const rows = getDatabase().prepare(
      `SELECT status, COUNT(*) AS c FROM ${table} WHERE substr(${dateCol},1,7) = ? GROUP BY status`,
    ).all(month) as Array<{ status: string; c: number }>;
    const map = new Map(rows.map((r) => [r.status, r.c]));
    return {
      draft: map.get('DRAFT') ?? 0,
      confirmed: map.get('CONFIRMED') ?? 0,
      rejected: map.get('REJECTED') ?? 0,
    };
  }

  /** 返回从 startMonth 到 endMonth 的连续月份数组（含两端）。 */
  private monthsRange(startMonth: string, endMonth: string): string[] {
    const result: string[] = [];
    let [y, m] = startMonth.split('-').map(Number);
    const [ey, em] = endMonth.split('-').map(Number);
    while (y < ey || (y === ey && m <= em)) {
      result.push(`${y}-${String(m).padStart(2, '0')}`);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return result;
  }

  /** 相对当前月偏移 N 个月的 YYYY-MM。 */
  private monthOffset(offset: number): string {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
