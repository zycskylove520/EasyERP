import { Injectable } from '@nestjs/common';
import { getDatabase } from '../../database/connection';
import { NotFoundError } from '../../common/errors';

/** 客户（收货方）视图 DTO。 */
export interface CustomerDto {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
}

/** 创建/更新客户的输入。 */
export interface CustomerInput {
  name: string;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
}

/** 客户服务：维护送货客户信息。 */
@Injectable()
export class CustomerService {
  findAll(): CustomerDto[] {
    return getDatabase()
      .prepare('SELECT id, name, contact, phone, address FROM customers ORDER BY id')
      .all() as CustomerDto[];
  }

  findOne(id: number): CustomerDto {
    const row = getDatabase()
      .prepare('SELECT id, name, contact, phone, address FROM customers WHERE id = ?')
      .get(id) as CustomerDto | undefined;
    if (!row) throw new NotFoundError('客户', id);
    return row;
  }

  create(input: CustomerInput): CustomerDto {
    const result = getDatabase()
      .prepare('INSERT INTO customers (name, contact, phone, address) VALUES (?, ?, ?, ?)')
      .run(input.name, input.contact ?? null, input.phone ?? null, input.address ?? null);
    return this.findOne(Number(result.lastInsertRowid));
  }

  update(id: number, input: CustomerInput): CustomerDto {
    this.findOne(id);
    getDatabase()
      .prepare('UPDATE customers SET name = ?, contact = ?, phone = ?, address = ? WHERE id = ?')
      .run(input.name, input.contact ?? null, input.phone ?? null, input.address ?? null, id);
    return this.findOne(id);
  }

  remove(id: number): void {
    this.findOne(id);
    getDatabase().prepare('DELETE FROM customers WHERE id = ?').run(id);
  }
}
