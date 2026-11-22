import { getDatabase } from './connection';

/** 幂等补列：旧库缺少该列时才执行 ALTER，新库/已迁移库不动。 */
function addPoColumnIfMissing(
  table: string,
  column: string,
  sql: string,
): void {
  const db = getDatabase();
  const exists = (db.pragma(`table_info(${table})`) as Array<{ name: string }>).some(
    (info) => info.name === column,
  );
  if (!exists) db.exec(sql);
}

/**
 * 建表（幂等）：所有表以最终结构直接创建，无历史迁移逻辑。
 * 数据库为全新库；字段设计见 .project_memory/architecture/。
 */
export function migrate(): void {
  const db = getDatabase();

  // 兼容旧库：品类表的唯一约束从 UNIQUE(name) 升级为 UNIQUE(name, biz_type)，
  // 以允许供货/销售各存一份同名品类。检测建表 SQL，缺新约束则重建表并保留数据。
  const catDef = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='product_categories'").get() as { sql: string } | undefined;
  if (catDef && !catDef.sql.includes('UNIQUE (name, biz_type)')) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE product_categories_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        biz_type    TEXT NOT NULL DEFAULT 'SALE',
        module      TEXT NOT NULL,
        spec_schema TEXT NOT NULL DEFAULT '[]',
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (name, biz_type)
      );
      INSERT INTO product_categories_new (id, name, biz_type, module, spec_schema, sort_order, created_at)
        SELECT id, name, 'SALE', module, spec_schema, sort_order, created_at FROM product_categories;
      DROP TABLE product_categories;
      ALTER TABLE product_categories_new RENAME TO product_categories;
    `);
    db.pragma('foreign_keys = ON');
  }

  db.exec(`
    -- 品类字典：客户可自定义增删改；module 为材质分类；biz_type 区分供货/销售域
    CREATE TABLE IF NOT EXISTS product_categories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      biz_type    TEXT NOT NULL DEFAULT 'SALE',
      module      TEXT NOT NULL,
      spec_schema TEXT NOT NULL DEFAULT '[]',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (name, biz_type)
    );

    -- 货品（SKU）：归属品类，biz_type 与品类一致；供货/销售各自独立
    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES product_categories(id),
      name        TEXT NOT NULL,
      biz_type    TEXT NOT NULL DEFAULT 'SALE',
      specs       TEXT NOT NULL DEFAULT '{}',
      unit        TEXT NOT NULL DEFAULT '个',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

    -- 供货商
    CREATE TABLE IF NOT EXISTS suppliers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      contact     TEXT,
      phone       TEXT,
      address     TEXT,
      business_types TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 供货商↔品类 多对多
    CREATE TABLE IF NOT EXISTS supplier_categories (
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES product_categories(id) ON DELETE CASCADE,
      PRIMARY KEY (supplier_id, category_id)
    );

    -- 客户（收货方）
    CREATE TABLE IF NOT EXISTS customers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      contact     TEXT,
      phone       TEXT,
      address     TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 库存流水：当前库存 = 所有流水 delta 之和
    CREATE TABLE IF NOT EXISTS inventory_ledger (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL REFERENCES products(id),
      delta       REAL NOT NULL,
      reason      TEXT NOT NULL CHECK (reason IN ('INITIAL','MANUAL_ADJUST','DELIVERY_CONSUME','DELIVERY_REVERSE','PO_RECEIVE','PO_REVERSE')),
      ref_type    TEXT,
      ref_id      INTEGER,
      reversal_of INTEGER REFERENCES inventory_ledger(id),
      note        TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ledger_product ON inventory_ledger(product_id);

    -- 报价单主表
    CREATE TABLE IF NOT EXISTS quotations (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_no       TEXT NOT NULL UNIQUE,
      customer_id    INTEGER REFERENCES customers(id),
      quote_date     TEXT NOT NULL,
      currency       TEXT NOT NULL DEFAULT 'RMB',
      sender         TEXT,
      attn           TEXT,
      fax            TEXT,
      valid_until    TEXT,
      payment_terms  TEXT,
      shipping_terms TEXT,
      remarks        TEXT,
      status         TEXT NOT NULL DEFAULT 'DRAFT'
                     CHECK (status IN ('DRAFT','CONFIRMED','REJECTED')),
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 报价单明细
    CREATE TABLE IF NOT EXISTS quotation_items (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      quotation_id        INTEGER NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
      seq                 INTEGER NOT NULL,
      product_id          INTEGER REFERENCES products(id),
      product_name        TEXT NOT NULL,
      specs               TEXT NOT NULL DEFAULT '{}',
      spec_labels         TEXT NOT NULL DEFAULT '{}',
      unit                TEXT,
      unit_price          REAL NOT NULL DEFAULT 0,
      quantity            REAL NOT NULL DEFAULT 0,
      delivery_date       TEXT,
      remark              TEXT,
      inventory_ledger_id INTEGER REFERENCES inventory_ledger(id),
      reversal_ledger_id  INTEGER REFERENCES inventory_ledger(id)
    );
    CREATE INDEX IF NOT EXISTS idx_quote_items_quote ON quotation_items(quotation_id);

    -- 订购单主表（采购侧；确认时逐明细加库）
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no      TEXT NOT NULL UNIQUE,
      supplier_id   INTEGER REFERENCES suppliers(id),
      supplier_name TEXT,
      order_date    TEXT NOT NULL,
      attn          TEXT,
      fax           TEXT,
      currency      TEXT NOT NULL DEFAULT 'RMB',
      fm            TEXT,
      delivery_date TEXT,
      terms         TEXT,
      footnote      TEXT,
      status        TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','CONFIRMED','REJECTED')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id   INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      seq                 INTEGER NOT NULL,
      product_id          INTEGER REFERENCES products(id),
      product_name        TEXT NOT NULL,
      unit                TEXT,
      specs               TEXT NOT NULL DEFAULT '{}',
      spec_labels         TEXT NOT NULL DEFAULT '{}',
      quantity            REAL NOT NULL DEFAULT 0,
      unit_price          REAL NOT NULL DEFAULT 0,
      amount              REAL NOT NULL DEFAULT 0,
      remark              TEXT,
      inventory_ledger_id INTEGER REFERENCES inventory_ledger(id),
      reversal_ledger_id  INTEGER REFERENCES inventory_ledger(id)
    );
    CREATE INDEX IF NOT EXISTS idx_po_items_order ON purchase_order_items(purchase_order_id);

    -- 送货单主表（确认时逐明细扣库）
    CREATE TABLE IF NOT EXISTS delivery_notes (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_no         TEXT NOT NULL UNIQUE,
      customer_id         INTEGER REFERENCES customers(id),
      customer_name       TEXT,
      ship_address        TEXT,
      delivery_date       TEXT NOT NULL,
      order_no            TEXT,
      source_quotation_id INTEGER REFERENCES quotations(id),
      remarks             TEXT,
      status              TEXT NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT','CONFIRMED','REJECTED')),
      created_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS delivery_note_items (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      delivery_note_id    INTEGER NOT NULL REFERENCES delivery_notes(id) ON DELETE CASCADE,
      seq                 INTEGER NOT NULL,
      product_id          INTEGER REFERENCES products(id),
      product_name        TEXT NOT NULL,
      unit                TEXT,
      specs               TEXT NOT NULL DEFAULT '{}',
      spec_labels         TEXT NOT NULL DEFAULT '{}',
      quantity            REAL NOT NULL DEFAULT 0,
      unit_price          REAL NOT NULL DEFAULT 0,
      amount              REAL NOT NULL DEFAULT 0,
      remark              TEXT,
      inventory_ledger_id INTEGER REFERENCES inventory_ledger(id),
      reversal_ledger_id  INTEGER REFERENCES inventory_ledger(id)
    );
    CREATE INDEX IF NOT EXISTS idx_dn_items_note ON delivery_note_items(delivery_note_id);

    -- 对帐单主表（不动库存）
    CREATE TABLE IF NOT EXISTS statements (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_no  TEXT NOT NULL UNIQUE,
      customer_id   INTEGER REFERENCES customers(id),
      customer_name TEXT,
      statement_date TEXT NOT NULL,
      attn          TEXT,
      fax           TEXT,
      from_party    TEXT,
      currency      TEXT NOT NULL DEFAULT 'RMB',
      remarks       TEXT,
      status        TEXT NOT NULL DEFAULT 'DRAFT'
                    CHECK (status IN ('DRAFT','CONFIRMED','REJECTED')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS statement_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      statement_id  INTEGER NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
      seq           INTEGER NOT NULL,
      item_date     TEXT,
      delivery_no   TEXT,
      product_name  TEXT NOT NULL,
      unit          TEXT,
      quantity      REAL NOT NULL DEFAULT 0,
      unit_price    REAL NOT NULL DEFAULT 0,
      amount        REAL NOT NULL DEFAULT 0,
      remark        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_st_items_statement ON statement_items(statement_id);

    -- 公司基础信息（单条档案，id 固定为 1）
    CREATE TABLE IF NOT EXISTS company_info (
      id                 INTEGER PRIMARY KEY CHECK (id = 1),
      name               TEXT NOT NULL DEFAULT '',
      address            TEXT,
      phone              TEXT,
      fax                TEXT,
      mobile             TEXT,
      maker              TEXT,
      business_scope     TEXT,
      delivery_no_prefix TEXT,
      currency           TEXT NOT NULL DEFAULT 'RMB',
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 财务收付款记录（只关联已确认单据）
    CREATE TABLE IF NOT EXISTS finance_records (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      type           TEXT NOT NULL CHECK (type IN ('RECEIVE','PAY')),
      ref_type       TEXT NOT NULL CHECK (ref_type IN ('STATEMENT','PURCHASE_ORDER')),
      ref_id         INTEGER NOT NULL,
      party_name     TEXT,
      amount         REAL NOT NULL DEFAULT 0,
      record_date    TEXT NOT NULL,
      method         TEXT,
      record_no      TEXT,
      handler        TEXT,
      invoice_no     TEXT,
      invoice_status TEXT,
      remark         TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_finance_ref ON finance_records(ref_type, ref_id);
  `);

  addPoColumnIfMissing('suppliers', 'business_types', 'ALTER TABLE suppliers ADD COLUMN business_types TEXT');
  // 兼容已有库（用户已安装软件）：补 biz_type 列，默认 SALE；新库建表时已含该列。
  addPoColumnIfMissing('product_categories', 'biz_type', "ALTER TABLE product_categories ADD COLUMN biz_type TEXT NOT NULL DEFAULT 'SALE'");
  addPoColumnIfMissing('products', 'biz_type', "ALTER TABLE products ADD COLUMN biz_type TEXT NOT NULL DEFAULT 'SALE'");
}
