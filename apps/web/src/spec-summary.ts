import type { Category } from './types';

/**
 * 前端规格摘要：把一条明细的 specs 按品类 schema 格式化成单行「中文名+数值+单位」。
 * 与后端 common/dynamic-specs.ts 的 formatSpecSummary 保持一致，用于制单页即时预览。
 * label 优先制单快照 labels，再品类 schema；顺序按 schema，无 schema 的 key 追加在后。
 */
export function formatSpecSummary(
  specs: Record<string, unknown> | null | undefined,
  labels: Record<string, string> | null | undefined,
  categories: Category[],
  categoryId: number | null | undefined,
): string {
  if (categoryId === null || categoryId === undefined) {
    // 未关联品类：直接按快照 key=value 平铺
    return Object.entries(specs ?? {})
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${labels?.[k] || k}${v}`)
      .join(' ');
  }
  const cat = categories.find((c) => c.id === categoryId);
  const schema = cat?.specSchema ?? [];
  const parts: string[] = [];
  const used = new Set<string>();
  for (const f of schema) {
    if (f.reserved) continue;
    const v = specs?.[f.key];
    if (v === undefined || v === null || v === '') continue;
    parts.push(`${labels?.[f.key] || f.label || f.key}${v}${f.unit ?? ''}`);
    used.add(f.key);
  }
  for (const [k, v] of Object.entries(specs ?? {})) {
    if (used.has(k) || v === undefined || v === null || v === '') continue;
    parts.push(`${labels?.[k] || k}${v}`);
  }
  return parts.join(' ');
}

/** 从货品找其品类 specSchema 的非预留字段（制单页按行动态填规格用）。 */
export function fieldsForProduct(
  productId: number | null | undefined,
  products: Array<{ id: number; categoryId: number }>,
  categories: Category[],
) {
  const p = products.find((x) => x.id === productId);
  if (!p) return [];
  const cat = categories.find((c) => c.id === p.categoryId);
  return cat?.specSchema.filter((f) => !f.reserved) ?? [];
}
