import {
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx';

/** 单据 docx 导出的共用构件：表格单元格、居中标题、标准边框明细表。 */
export abstract class DocxSupport {
  /** 居中文字段落（公司抬头、单据标题）。 */
  protected center(text: string, size: number, bold = true): Paragraph {
    return new Paragraph({
      children: [new TextRun({ text, size, bold })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
    });
  }

  /** 普通左对齐段落。 */
  protected line(text: string, opts?: { bold?: boolean; after?: number; size?: number }): Paragraph {
    return new Paragraph({
      children: [new TextRun({ text, bold: opts?.bold ?? false, size: opts?.size })],
      spacing: { after: opts?.after ?? 80 },
    });
  }

  /** 表格单元格（居中）。 */
  protected cell(text: string, bold = false): TableCell {
    return new TableCell({
      children: [new Paragraph({ children: [new TextRun({ text, bold })], alignment: AlignmentType.CENTER })],
    });
  }

  /**
   * 标准明细表：首行表头加粗，外框+内线单线边框，宽度 100%。
   * @param columns 表头文字
   * @param rows 明细（二维数组，每个元素一行）
   * @param minRows 至少补足到该行数（含表头），贴合单据样本留白
   */
  protected buildTable(columns: string[], rows: string[][], minRows = 6): Table {
    const tableRows: TableRow[] = [new TableRow({ children: columns.map((c) => this.cell(c, true)) })];
    for (const row of rows) {
      tableRows.push(new TableRow({ children: columns.map((_, i) => this.cell(row[i] ?? '', false)) }));
    }
    while (tableRows.length < minRows) {
      tableRows.push(new TableRow({ children: columns.map(() => this.cell('', false)) }));
    }
    return new Table({
      rows: tableRows,
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
}
