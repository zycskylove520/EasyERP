import { Injectable } from '@nestjs/common';
import { Document, Packer } from 'docx';
import { DocxSupport } from '../../common/docx-support';

/** 订购单打印数据（与 PurchaseOrderService.getPrintData 返回结构对应）。 */
export interface PurchasePrintData {
  title: string;
  company: {
    name: string;
    address: string | null;
    phone: string | null;
    fax: string | null;
    maker: string | null;
  };
  orderNo: string;
  orderDate: string;
  deliveryDate: string | null;
  supplierName: string | null;
  attn: string | null;
  fax: string | null;
  currency: string;
  fm: string | null;
  columns: string[];
  items: Array<Record<string, unknown>>;
  terms: string[];
  footnote: string;
}

/** 生成订购单 Word 文档（A4，纯单据内容；数据与打印预览同源）。 */
@Injectable()
export class PurchaseOrderDocxService extends DocxSupport {
  /** 把打印数据渲染成 docx 二进制。 */
  async render(data: PurchasePrintData): Promise<Buffer> {
    const company = data.company;
    const rows = data.items.map((item) => [
      String(item.seq),
      String(item.productName ?? ''),
      String(item.specText ?? ''),
      String(item.unit ?? ''),
      String(item.quantity ?? ''),
      String(item.remark ?? ''),
    ]);

    const children = [
      this.center(company.name, 28),
      this.line(`地址：${company.address ?? ''}`, { after: 40 }),
      this.line(`电话：${company.phone ?? ''}  传真：${company.fax ?? ''}`, { after: 120 }),
      this.center(data.title, 36),
      this.line(`TO：${data.supplierName ?? '——'}${sp(6)}ATTN：${data.attn ?? '——'}${sp(6)}DATE：${data.orderDate}`),
      this.line(`FAX：${data.fax ?? '——'}${sp(6)}FM：${data.fm ?? company.maker ?? ''}${sp(6)}币制：${data.currency}`),
      this.line(`交货期：${data.deliveryDate || '——'}`, { after: 200 }),
      this.buildTable(data.columns, rows),
      this.line(''),
      this.line('备注：', { bold: true }),
      ...data.terms.map((term, i) => this.line(`${i + 1}．${term}`)),
      this.line(''),
      this.line(data.footnote, { after: 300 }),
      this.line('供货商确认（盖章）：____________'),
      this.line(''),
      this.line(`${company.name}（盖章）：____________`),
    ];

    const doc = new Document({
      sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }],
    });
    return Packer.toBuffer(doc);
  }
}

function sp(n: number): string {
  return ' '.repeat(n);
}
