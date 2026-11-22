import { Injectable } from '@nestjs/common';
import { getDatabase, transaction } from '../../database/connection';
import { NotFoundError } from '../../common/errors';

/** 供货商视图 DTO：businessTypes 为客户自由填写的经营品种文本。 */
export interface SupplierDto {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  businessTypes: string | null;
}

/** 创建/更新供货商的输入。 */
export interface SupplierInput {
  name: string;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  /** 自由填写的经营品种；更新时若省略则保持原样 */
  businessTypes?: string | null;
}

interface SupplierRow {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  business_types: string | null;
}

/** 供货商服务：维护基本信息与自由填写的经营品种。 */
@Injectable()
export class SupplierService {
  findAll(): SupplierDto[] {
    const rows = getDatabase()
      .prepare('SELECT id, name, contact, phone, address, business_types FROM suppliers ORDER BY id')
      .all() as SupplierRow[];
    return rows.map((row) => this.toDto(row));
  }

  findOne(id: number): SupplierDto {
    return this.toDto(this.findRow(id));
  }

  /** 创建供货商，经营品种按自由文本直接入库。 */
  create(input: SupplierInput): SupplierDto {
    const id = transaction(() => {
      const result = getDatabase()
        .prepare('INSERT INTO suppliers (name, contact, phone, address, business_types) VALUES (?, ?, ?, ?, ?)')
        .run(
          input.name,
          input.contact ?? null,
          input.phone ?? null,
          input.address ?? null,
          input.businessTypes ?? null,
        );
      return Number(result.lastInsertRowid);
    });
    return this.findOne(id);
  }

  /** 更新供货商；businessTypes 省略时保留原值。 */
  update(id: number, input: SupplierInput): SupplierDto {
    const existing = this.findRow(id);
    transaction(() => {
      getDatabase()
        .prepare('UPDATE suppliers SET name = ?, contact = ?, phone = ?, address = ?, business_types = ? WHERE id = ?')
        .run(
          input.name,
          input.contact ?? null,
          input.phone ?? null,
          input.address ?? null,
          input.businessTypes === undefined ? existing.business_types : input.businessTypes,
          id,
        );
    });
    return this.findOne(id);
  }

  /** 删除供货商。 */
  remove(id: number): void {
    this.findRow(id);
    getDatabase().prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  }

  private findRow(id: number): SupplierRow {
    const row = getDatabase()
      .prepare('SELECT id, name, contact, phone, address, business_types FROM suppliers WHERE id = ?')
      .get(id) as SupplierRow | undefined;
    if (!row) throw new NotFoundError('供货商', id);
    return row;
  }

  private toDto(row: SupplierRow): SupplierDto {
    return {
      id: row.id,
      name: row.name,
      contact: row.contact,
      phone: row.phone,
      address: row.address,
      businessTypes: row.business_types,
    };
  }
}
