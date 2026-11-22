import { Injectable } from '@nestjs/common';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx';
import { CompanyInfoService } from '../company-info/company-info.service';

/** 打印数据（与 QuotationService.getPrintData 返回结构对应）。 */
export interface PrintData {
  quoteNo: string;
  date: string;
  currency: string;
  customer: string | null;
  attn: string | null;
  from: string | null;
  fax: string | null;
  columns: string[];
  items: Array<Record<string, unknown>>;
  terms: string[];
  paymentTerms: string | null;
  shippingTerms: string | null;
  remarks: string | null;
}

/** 生成报价单 Word 文档（A4，纯报价单内容，无界面元素）。 */
@Injectable()
export class QuotationDocxService {
  constructor(private readonly companyInfo: CompanyInfoService) {}

  /** 把打印数据渲染成 docx 二进制。 */
  async render(data: PrintData): Promise<Buffer> {
    const company = this.companyInfo.get();
    const children: (Paragraph | Table)[] = [];

    children.push(this.center(company.name, 28, true));
    children.push(this.center('报  价  单', 36, true));

    children.push(new Paragraph({
      children: [
        new TextRun(`TO：${data.customer ?? '——'}     `),
        new TextRun(`ATTN：${data.attn ?? '——'}     `),
        new TextRun(`DATE：${data.date}`),
      ],
    }));
    children.push(new Paragraph({
      children: [
        new TextRun(`FAX：${data.fax ?? '——'}     `),
        new TextRun(`FROM：${data.from ?? '——'}     `),
        new TextRun(`币制：${data.currency}`),
      ],
      spacing: { after: 200 },
    }));

    children.push(this.buildItemsTable(data));
    children.push(new Paragraph({ text: '' }));

    // 结算及付款方式、运输方式：单独成块，不混进备注条款
    if (data.paymentTerms) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `结算及付款方式：${data.paymentTerms}`, bold: true })],
        spacing: { after: 100 },
      }));
    }
    if (data.shippingTerms) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `运输方式：${data.shippingTerms}`, bold: true })],
        spacing: { after: 100 },
      }));
    }
    children.push(new Paragraph({ text: '' }));

    data.terms.forEach((term, i) => {
      children.push(new Paragraph({ children: [new TextRun(`${i + 1}. ${term}`)], spacing: { after: 80 } }));
    });
    if (data.remarks) {
      // 备注完全由客户填写，按换行拆成多段显示
      for (const line of data.remarks.split('\n')) {
        children.push(new Paragraph({ children: [new TextRun(line)], spacing: { after: 80 } }));
      }
    }

    children.push(new Paragraph({ text: '' }));
    children.push(new Paragraph({
      children: [
        new TextRun('客户（盖章）：____________          '),
        new TextRun(`${company.name}（盖章）：____________`),
      ],
      spacing: { before: 300 },
    }));

    const doc = new Document({
      sections: [{ properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }],
    });
    return Packer.toBuffer(doc);
  }

  /** 明细表：列 = 序号/品名/规格(单行摘要)/单位/单价/数量/交货日期/备注。 */
  private buildItemsTable(data: PrintData): Table {
    const header = new TableRow({
      children: data.columns.map((c) => this.cell(c, true)),
    });
    const rows: TableRow[] = [header];

    for (const raw of data.items) {
      const values: string[] = [
        String(raw.seq ?? ''),
        String(raw.productName ?? ''),
        String(raw.specText ?? ''),
        String(raw.unit ?? ''),
        String(raw.unitPrice ?? ''),
        String(raw.quantity ?? ''),
        String(raw.deliveryDate ?? ''),
        String(raw.remark ?? ''),
      ];
      rows.push(new TableRow({ children: values.map((v) => this.cell(v, false)) }));
    }

    // 补足空行至至少 6 行，贴合原报价单样式
    while (rows.length < 7) {
      rows.push(new TableRow({ children: data.columns.map(() => this.cell('', false)) }));
    }

    return new Table({
      rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4 },
        bottom: { style: BorderStyle.SINGLE, size: 4 },
        left: { style: BorderStyle.SINGLE, size: 4 },
        right: { style: BorderStyle.SINGLE, size: 4 },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
        insideVertical: { style: BorderStyle.SINGLE, size: 4 },
      },
    });
  }

  private cell(text: string, bold: boolean): TableCell {
    return new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold })], alignment: AlignmentType.CENTER })],
    });
  }

  private center(text: string, size: number, bold: boolean): Paragraph {
    return new Paragraph({
      children: [new TextRun({ text, size, bold })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    });
  }
}
