import { Injectable } from '@nestjs/common';
import { getDatabase } from '../../database/connection';

/** 公司基础信息（单条档案，全系统共用）。 */
export interface CompanyInfoDto {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  fax: string | null;
  mobile: string | null;
  maker: string | null;
  businessScope: string | null;
  /** 送货单号前缀（如 YLD；留空则用默认 DN）。 */
  deliveryNoPrefix: string | null;
  currency: string;
}

/** 公司基础信息输入。 */
export interface CompanyInfoInput {
  name: string;
  address?: string | null;
  phone?: string | null;
  fax?: string | null;
  mobile?: string | null;
  maker?: string | null;
  businessScope?: string | null;
  deliveryNoPrefix?: string | null;
  currency?: string;
}

interface CompanyRow {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  fax: string | null;
  mobile: string | null;
  maker: string | null;
  business_scope: string | null;
  delivery_no_prefix: string | null;
  currency: string;
}

/**
 * 公司基础信息服务：单条档案的读取与更新。
 * 各单据导出与制单默认值从这里取数（档案缺失时返回空白值）。
 */
@Injectable()
export class CompanyInfoService {
  /** 获取公司信息（档案缺失时返回空白默认值，保证前端不崩）。 */
  get(): CompanyInfoDto {
    const row = getDatabase().prepare('SELECT * FROM company_info WHERE id = 1').get() as CompanyRow | undefined;
    if (!row) {
      return { id: 1, name: '', address: null, phone: null, fax: null, mobile: null, maker: null, businessScope: null, deliveryNoPrefix: null, currency: 'RMB' };
    }
    return this.toDto(row);
  }

  /** 更新公司信息（整条替换；档案不存在时插入 id=1，兼容空库首次录入）。 */
  update(input: CompanyInfoInput): CompanyInfoDto {
    getDatabase()
      .prepare(`INSERT INTO company_info
                (id, name, address, phone, fax, mobile, maker, business_scope, delivery_no_prefix, currency, updated_at)
                VALUES (1, @name, @address, @phone, @fax, @mobile, @maker, @businessScope, @deliveryNoPrefix, @currency, datetime('now'))
                ON CONFLICT(id) DO UPDATE SET
                  name = excluded.name, address = excluded.address, phone = excluded.phone,
                  fax = excluded.fax, mobile = excluded.mobile, maker = excluded.maker,
                  business_scope = excluded.business_scope, delivery_no_prefix = excluded.delivery_no_prefix,
                  currency = excluded.currency, updated_at = datetime('now')`)
      .run({
        name: input.name,
        address: input.address ?? null,
        phone: input.phone ?? null,
        fax: input.fax ?? null,
        mobile: input.mobile ?? null,
        maker: input.maker ?? null,
        businessScope: input.businessScope ?? null,
        deliveryNoPrefix: input.deliveryNoPrefix?.trim() || null,
        currency: input.currency ?? 'RMB',
      });
    return this.get();
  }

  private toDto(row: CompanyRow): CompanyInfoDto {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      phone: row.phone,
      fax: row.fax,
      mobile: row.mobile,
      maker: row.maker,
      businessScope: row.business_scope,
      deliveryNoPrefix: row.delivery_no_prefix,
      currency: row.currency,
    };
  }
}
