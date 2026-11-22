import { Injectable } from '@nestjs/common';
import { Document, Packer } from 'docx';
import { DocxSupport } from '../../common/docx-support';

/** 送货单打印数据（与 DeliveryNoteService.getPrintData 返回结构对应）。 */
export interface DeliveryPrintData {
  title: string;
  company: {
    name: string;
    address: string | null;
    phone: string | null;
    mobile: string | null;
    businessScope: string | null;
    maker: string | null;
  };
  deliveryNo: string;
  deliveryDate: string;
  customerName: string | null;
  shipAddress: string | null;
  orderNo: string | null;
  /** 整单全局备注（打印在明细表下方）。 */
  remarks: string | null;
  columns: string[];
  items: Array<Record<string, unknown>>;
  total: string;
  totalChinese: string;
}

/** 生成送货单 Word 文档（A4；数据与打印预览页同源，规格为单行摘要，无料号列）。 */
@Injectable()
export class DeliveryNoteDocxService extends DocxSupport {
  /** 把打印数据渲染成 docx 二进制。 */
  async render(data: DeliveryPrintData): Promise<Buffer> {
    const company = data.company;
    const rows = data.items.map((item) => [
      String(item.seq),
      String(item.orderNo ?? ''),
      String(item.productName ?? ''),
      String(item.specText ?? ''),
      String(item.unit ?? ''),
      String(item.quantity ?? ''),
      String(item.unitPrice ?? ''),
      String(item.amount ?? ''),
      String(item.remark ?? ''),
    ]);

    const children = [
      this.center(company.name, 28),
      this.line(`地址：${company.address ?? ''}`, { after: 40 }),
      this.line(`电话/传真：${company.phone ?? ''}${company.mobile ? `  手机：${company.mobile}` : ''}`, { after: 120 }),
      this.center(data.title, 36),
      this.line(`客户名称：${data.customerName ?? '——'}`, { after: 40 }),
      this.line(`收货地址：${data.shipAddress ?? '——'}`),
      this.line(`出货单号：${data.deliveryNo}${sp(6)}出货日期：${data.deliveryDate}`, { after: 200 }),
      this.buildTable(data.columns, rows),
      ...(data.remarks ? data.remarks.split(/\r?\n/).filter(Boolean).map((line) => this.line(`备注：${line}`)) : []),
      this.line(`本页金额小计（RMB）：${data.total}`, { bold: true, after: 80 }),
      this.line(`总计金额（大写）：${data.totalChinese}`, { bold: true, after: 200 }),
      this.line(company.businessScope ? `经营范围：${company.businessScope}` : '', { after: 200 }),
      this.line(`制单：${company.maker ?? ''}`),
      this.line('送货单位及送货人（盖章）：____________'),
      this.line('收货单位收货人（盖章）：____________'),
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
