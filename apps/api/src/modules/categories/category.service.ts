import { Injectable } from '@nestjs/common';
import { getDatabase, transaction } from '../../database/connection';
import { ConflictError, NotFoundError } from '../../common/errors';
import type { SpecField } from '../../database/seed';

/** 业务域：供货 / 销售。 */
export type BizType = 'SUPPLY' | 'SALE';

/** 品类数据视图（对外 DTO）。module 为客户可自定义的模块名；bizType 区分供货/销售域。 */
export interface CategoryDto {
  id: number;
  name: string;
  module: string;
  bizType: BizType;
  specSchema: SpecField[];
  sortOrder: number;
}

/** 创建/编辑品类的输入。 */
export interface CategoryInput {
  name: string;
  module: string;
  bizType?: BizType;
  sortOrder?: number;
  specSchema?: SpecField[];
}

interface CategoryRow {
  id: number;
  name: string;
  module: string;
  biz_type: BizType;
  spec_schema: string;
  sort_order: number;
}

/**
 * 品类字典服务：客户可自定义增删改品类与规格字段。
 * 规格字段以 spec_schema(JSON) 存储；删除/改名字段前检查是否已被货品使用，避免数据失联。
 */
@Injectable()
export class CategoryService {
  /** 列出品类（按 sort_order、id 排序）；可按品类名、模块、业务域筛选。 */
  findAll(filter?: { name?: string; module?: string; bizType?: BizType }): CategoryDto[] {
    const conditions: string[] = [];
    const params: string[] = [];
    if (filter?.name) { conditions.push('name LIKE ?'); params.push(`%${filter.name}%`); }
    if (filter?.module) { conditions.push('module LIKE ?'); params.push(`%${filter.module}%`); }
    if (filter?.bizType) { conditions.push('biz_type = ?'); params.push(filter.bizType); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = getDatabase()
      .prepare(`SELECT id, name, module, biz_type, spec_schema, sort_order FROM product_categories ${where} ORDER BY sort_order, id`)
      .all(...params) as CategoryRow[];
    return rows.map((row) => this.toDto(row));
  }

  /** 按 id 查询单个品类。 */
  findOne(id: number): CategoryDto {
    return this.toDto(this.findRow(id));
  }

  /** 新增品类。同一业务域内名称唯一；序号按业务域自动取最大值 +1。 */
  create(input: CategoryInput): CategoryDto {
    this.validateInput(input);
    const schema = input.specSchema ?? [];
    const bizType = input.bizType ?? 'SALE';
    const maxSort = (getDatabase()
      .prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM product_categories WHERE biz_type = ?')
      .get(bizType) as { m: number }).m;
    try {
      const result = getDatabase()
        .prepare(`INSERT INTO product_categories (name, module, biz_type, spec_schema, sort_order)
                  VALUES (?, ?, ?, ?, ?)`)
        .run(input.name.trim(), input.module.trim(), bizType, JSON.stringify(schema), maxSort + 1);
      return this.findOne(Number(result.lastInsertRowid));
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ConflictError(`该域的品类「${input.name}」已存在`);
      }
      throw error;
    }
  }

  /**
   * 编辑品类（含规格字段整组替换）。
   * 若移除或改名了已被货品 specs 使用的字段，则拒绝，防止已录数据失联。
   */
  update(id: number, input: CategoryInput): CategoryDto {
    const old = this.findOne(id);
    this.validateInput(input);
    const newSchema = input.specSchema ?? [];
    this.assertNoFieldLost(id, old.specSchema, newSchema);

    try {
      // 序号由系统维护，编辑时不改 sort_order
      getDatabase()
        .prepare(`UPDATE product_categories SET name = ?, module = ?, spec_schema = ? WHERE id = ?`)
        .run(input.name.trim(), input.module.trim(), JSON.stringify(newSchema), id);
      return this.findOne(id);
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new ConflictError(`品类「${input.name}」已存在`);
      }
      throw error;
    }
  }

  /**
   * 删除品类。若其下还有货品，禁止删除（409）；供货商经营关联随外键 CASCADE 清理。
   */
  remove(id: number): void {
    this.findRow(id);
    const productCount = (getDatabase()
      .prepare('SELECT COUNT(*) AS n FROM products WHERE category_id = ?')
      .get(id) as { n: number }).n;
    if (productCount > 0) {
      throw new ConflictError(`该品类下还有 ${productCount} 个货品，请先删除或转移这些货品`);
    }
    // 删除后把剩余品类按原顺序重新编号为 1..N，保持连续
    const db = getDatabase();
    db.transaction(() => {
      db.prepare('DELETE FROM product_categories WHERE id = ?').run(id);
      const rest = db.prepare('SELECT id FROM product_categories ORDER BY sort_order, id').all() as Array<{ id: number }>;
      const renumber = db.prepare('UPDATE product_categories SET sort_order = ? WHERE id = ?');
      rest.forEach((row, index) => renumber.run(index + 1, row.id));
    })();
  }

  /** 校验必填与规格字段结构。 */
  private validateInput(input: CategoryInput): void {
    if (!input.name || !input.name.trim()) throw new ConflictError('品类名称不能为空');
    if (!input.module || !input.module.trim()) throw new ConflictError('模块不能为空');
    const schema = input.specSchema ?? [];
    const keys = new Set<string>();
    for (const field of schema) {
      if (!field.key || !field.key.trim()) throw new ConflictError('规格字段的标识不能为空');
      if (keys.has(field.key)) throw new ConflictError(`规格字段标识「${field.key}」重复`);
      keys.add(field.key);
      if (field.type !== 'number' && field.type !== 'text') {
        throw new ConflictError(`规格字段「${field.key}」的类型只能是 number 或 text`);
      }
    }
  }

  /** 若某规格字段被移除或改 key，且已有货品存了该 key 的值，则拒绝。 */
  private assertNoFieldLost(categoryId: number, oldSchema: SpecField[], newSchema: SpecField[]): void {
    const oldKeys = new Set(oldSchema.map((f) => f.key));
    const newKeys = new Set(newSchema.map((f) => f.key));
    const lostKeys = [...oldKeys].filter((k) => !newKeys.has(k));
    if (lostKeys.length === 0) return;
    const products = getDatabase()
      .prepare('SELECT specs FROM products WHERE category_id = ?')
      .all(categoryId) as Array<{ specs: string }>;
    for (const row of products) {
      const specs = JSON.parse(row.specs) as Record<string, unknown>;
      if (lostKeys.some((k) => specs[k] !== undefined)) {
        throw new ConflictError(`规格字段「${lostKeys.join('、')}」已被该品类的货品使用，不能删除或改名`);
      }
    }
  }

  private findRow(id: number): CategoryRow {
    const row = getDatabase()
      .prepare('SELECT id, name, module, biz_type, spec_schema, sort_order FROM product_categories WHERE id = ?')
      .get(id) as CategoryRow | undefined;
    if (!row) throw new NotFoundError('品类', id);
    return row;
  }

  private toDto(row: CategoryRow): CategoryDto {
    return {
      id: row.id,
      name: row.name,
      module: row.module,
      bizType: row.biz_type,
      specSchema: JSON.parse(row.spec_schema) as SpecField[],
      sortOrder: row.sort_order,
    };
  }
}
