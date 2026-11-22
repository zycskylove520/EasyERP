import { getDatabase } from '../database/connection';

/** 结构化规格明细的最小形状（各单据明细都满足）。 */
export interface SpecItemLike {
  productId: number | null;
  specs?: Record<string, unknown> | null;
  specLabels?: Record<string, string> | null;
}

/** 动态规格列视图：字段键、显示名，以及每条明细的规格值快照。 */
export interface DynamicSpecView {
  fields: Array<{ key: string; label: string }>;
  itemSpecs: Array<{ specs: Record<string, unknown>; labels: Record<string, string> }>;
}

/** 查询某货品所属品类的规格 schema（key → label/unit）。 */
export function schemaOfProduct(productId: number | null): Array<{ key: string; label: string; unit?: string; reserved?: boolean }> {
  if (productId === null) return [];
  const row = getDatabase()
    .prepare(`SELECT c.spec_schema FROM products p
              JOIN product_categories c ON c.id = p.category_id WHERE p.id = ?`)
    .get(productId) as { spec_schema: string } | undefined;
  return row ? (JSON.parse(row.spec_schema) as Array<{ key: string; label: string; unit?: string; reserved?: boolean }>) : [];
}

/**
 * 把一条明细的规格格式化成单行摘要（中文名+数值+单位，如「φ数13MM 厚度22MM」）。
 * label 优先制单快照，再品类 schema；顺序按品类 schema，无 schema 的 key 追加在后。
 */
export function formatSpecSummary(
  specs: Record<string, unknown> | null | undefined,
  labels: Record<string, string> | null | undefined,
  productId: number | null,
): string {
  const merged = { ...(specs ?? {}) };
  const schema = schemaOfProduct(productId);
  const parts: string[] = [];
  const used = new Set<string>();
  for (const field of schema) {
    if (field.reserved) continue;
    const value = merged[field.key];
    if (value === undefined || value === null || value === '') continue;
    const label = labels?.[field.key] || field.label || field.key;
    parts.push(`${label}${value}${field.unit ?? ''}`);
    used.add(field.key);
  }
  for (const [key, value] of Object.entries(merged)) {
    if (used.has(key) || value === undefined || value === null || value === '') continue;
    parts.push(`${labels?.[key] || key}${value}`);
  }
  return parts.join(' ');
}

/** 从明细集合构造动态规格列视图（保留供可能需要按列展示的场景）。 */
export function buildDynamicSpecColumns(items: SpecItemLike[]): DynamicSpecView {
  const itemSpecs = items.map((item) => ({
    specs: { ...(item.specs ?? {}) },
    labels: { ...(item.specLabels ?? {}) },
  }));

  const fields: Array<{ key: string; label: string }> = [];
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const schema = schemaOfProduct(item.productId);
    const labels = itemSpecs[index].labels;
    for (const key of Object.keys(itemSpecs[index].specs)) {
      if (seen.has(key)) continue;
      seen.add(key);
      const found = schema.find((f) => f.key === key)?.label;
      labels[key] = labels[key] || found || key;
      fields.push({ key, label: labels[key] });
    }
  });

  return { fields, itemSpecs };
}
