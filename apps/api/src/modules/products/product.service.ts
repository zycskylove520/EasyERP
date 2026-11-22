import { Injectable } from '@nestjs/common';
import { getDatabase } from '../../database/connection';
import { ConflictError, NotFoundError } from '../../common/errors';

/** 货品视图 DTO。bizType 与所属品类一致（供货/销售分域）。 */
export interface ProductDto {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  bizType: 'SUPPLY' | 'SALE';
  specs: Record<string, unknown>;
  unit: string;
}

/** 创建/更新货品的输入。 */
export interface ProductInput {
  categoryId: number;
  name: string;
  specs?: Record<string, unknown>;
  unit?: string;
}

interface ProductRow {
  id: number;
  category_id: number;
  category_name: string;
  name: string;
  biz_type: 'SUPPLY' | 'SALE';
  specs: string;
  unit: string;
}

/** 货品（SKU）服务：规格以 JSON 存储，字段由品类 spec_schema 定义。 */
@Injectable()
export class ProductService {
  /** 列出货品，可按品类、业务域筛选。 */
  findAll(categoryId?: number, bizType?: 'SUPPLY' | 'SALE'): ProductDto[] {
    const conditions: string[] = [];
    const params: Array<number | string> = [];
    if (categoryId !== undefined) { conditions.push('p.category_id = ?'); params.push(categoryId); }
    if (bizType) { conditions.push('p.biz_type = ?'); params.push(bizType); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT p.id, p.category_id, c.name AS category_name, p.name, p.biz_type, p.specs, p.unit
                 FROM products p JOIN product_categories c ON c.id = p.category_id
                 ${where} ORDER BY p.id`;
    const rows = getDatabase().prepare(sql).all(...params) as ProductRow[];
    return rows.map((row) => this.toDto(row));
  }

  /** 按 id 查询单个货品。 */
  findOne(id: number): ProductDto {
    const row = this.findRow(id);
    return this.toDto(row);
  }

  /** 创建货品。品类必须存在；biz_type 继承品类；同名货品在同一品类下不允许重复。 */
  create(input: ProductInput): ProductDto {
    const category = this.getCategory(input.categoryId);
    const duplicate = getDatabase()
      .prepare('SELECT id FROM products WHERE category_id = ? AND name = ?')
      .get(input.categoryId, input.name);
    if (duplicate) throw new ConflictError(`货品「${input.name}」在该品类下已存在`);

    const result = getDatabase()
      .prepare('INSERT INTO products (category_id, name, biz_type, specs, unit) VALUES (?, ?, ?, ?, ?)')
      .run(input.categoryId, input.name, category.biz_type, JSON.stringify(input.specs ?? {}), input.unit ?? '个');
    return this.findOne(Number(result.lastInsertRowid));
  }

  /** 更新货品（全量替换可编辑字段）。改品类时 biz_type 继承新品类。 */
  update(id: number, input: ProductInput): ProductDto {
    this.findRow(id); // 不存在则抛错
    const category = this.getCategory(input.categoryId);
    getDatabase()
      .prepare('UPDATE products SET category_id = ?, name = ?, biz_type = ?, specs = ?, unit = ? WHERE id = ?')
      .run(input.categoryId, input.name, category.biz_type, JSON.stringify(input.specs ?? {}), input.unit ?? '个', id);
    return this.findOne(id);
  }

  /** 删除货品。若已被库存流水或报价明细引用，由外键约束阻止。 */
  remove(id: number): void {
    this.findRow(id);
    try {
      getDatabase().prepare('DELETE FROM products WHERE id = ?').run(id);
    } catch (error) {
      if (error instanceof Error && error.message.includes('FOREIGN KEY')) {
        throw new ConflictError('该货品已被库存或报价单引用，不能删除');
      }
      throw error;
    }
  }

  private findRow(id: number): ProductRow {
    const row = getDatabase()
      .prepare(`SELECT p.id, p.category_id, c.name AS category_name, p.name, p.biz_type, p.specs, p.unit
                FROM products p JOIN product_categories c ON c.id = p.category_id WHERE p.id = ?`)
      .get(id) as ProductRow | undefined;
    if (!row) throw new NotFoundError('货品', id);
    return row;
  }

  /** 取品类（含 biz_type），不存在则抛错。 */
  private getCategory(categoryId: number): { biz_type: 'SUPPLY' | 'SALE' } {
    const row = getDatabase()
      .prepare('SELECT biz_type FROM product_categories WHERE id = ?')
      .get(categoryId) as { biz_type: 'SUPPLY' | 'SALE' } | undefined;
    if (!row) throw new NotFoundError('品类', categoryId);
    return row;
  }

  private toDto(row: ProductRow): ProductDto {
    return {
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      name: row.name,
      bizType: row.biz_type,
      specs: JSON.parse(row.specs) as Record<string, unknown>,
      unit: row.unit,
    };
  }
}
