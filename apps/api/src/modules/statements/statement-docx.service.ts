import { Injectable } from '@nestjs/common';
import { Document, Packer } from 'docx';
import { DocxSupport } from '../../common/docx-support';

/** 对帐单打印数据（与 StatementService.getPrintData 返回结构对应）。 */
export interface StatementPrintData {
  title: string;
  company: { name: string; currency: string; maker: string | null };
  statementNo: string;
  customerName: string | null;
  attn: string | null;
  statementDate: string;
  fax: string | null;
  from: string | null;
  currency: string;
  /** 整单全局备注（打印在明细表下方）。 */
  remarks: string | null;
  columns: string[];
  items: Array<Record<string, unknown>>;
  total: string;
  totalChinese: string;
}

/** 生成对帐单 Word 文档（A4；数据与打印预览同源）。 */
@Injectable()
export class StatementDocxService extends DocxSupport {
  /** 把打印数据渲染成 docx 二进制。 */
  async render(data: StatementPrintData): Promise<Buffer> {
    const rows = data.items.map((item) => [
      String(item.itemDate ?? ''),
      String(item.deliveryNo ?? ''),
      String(item.productName ?? ''),
      String(item.unit ?? ''),
      String(item.quantity ?? ''),
      String(item.unitPrice ?? ''),
      String(item.amount ?? ''),
      String(item.remark ?? ''),
    ]);

    const children = [
      this.line(
        `TO：${data.customerName ?? '——'}${sp(4)}ATTN：${data.attn ?? '——'}${sp(4)}DATE：${data.statementDate}`,
      ),
      this.line(
        `FAX：${data.fax ?? '——'}${sp(4)}FROM：${data.from ?? data.company.maker ?? ''}${sp(4)}币制：${data.currency}`,
        { after: 160 },
      ),
      this.buildTable(data.columns, rows),
      ...(data.remarks ? data.remarks.split(/\r?\n/).filter(Boolean).map((line) => this.line(`备注：${line}`)) : []),
      this.line('合计', { bold: true, after: 80 }),
      this.line(`人民币大写金额：${data.totalChinese}`, { bold: true, after: 200 }),
      this.line('客户回签（盖章）：____________    审核：____________    作成：____________', { after: 120 }),
      this.line('核对后烦请回签，TKS！！'),
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
