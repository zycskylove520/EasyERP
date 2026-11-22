/**
 * 测试专用固件：为测试库补入测试所需的最小基础数据。
 *
 * 生产库不含任何种子（见 src/database/init.ts）；这些品类模板只用于
 * 测试里构造货品/单据，名字均为明显的测试名，不含任何真实业务信息。
 */
import { getDatabase } from '../src/database/connection';

interface TestCategory {
  name: string;
  module: string;
  specSchema: Array<{ key: string; label: string; type: 'number' | 'text'; unit?: string; reserved?: boolean }>;
}

/** 测试用纸管品类：多数单据测试按名字 "纸管" 取此品类。 */
const TEST_CATEGORIES: TestCategory[] = [
  {
    name: '纸管',
    module: 'paper',
    specSchema: [
      { key: 'phi', label: 'φ数', type: 'number', unit: 'MM' },
      { key: 'length', label: '长度', type: 'number', unit: 'MM' },
      { key: 'thickness', label: '厚度', type: 'number', unit: 'MM' },
      { key: 'innerDiameter', label: '内径', type: 'number', unit: 'MM' },
    ],
  },
];

/** 在测试库里幂等写入测试品类与公司空档案（必须在 initializeDatabase 之后调用）。 */
export function seedTestData(): void {
  const db = getDatabase();
  const insertCat = db.prepare(
    `INSERT OR IGNORE INTO product_categories (name, module, spec_schema, sort_order)
     VALUES (?, ?, ?, ?)`,
  );
  for (const [i, cat] of TEST_CATEGORIES.entries()) {
    insertCat.run(cat.name, cat.module, JSON.stringify(cat.specSchema), i);
  }
  db.prepare(
    `INSERT OR IGNORE INTO company_info (id, name, currency) VALUES (1, '', 'RMB')`,
  ).run();
}
