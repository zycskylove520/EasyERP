import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  QuotationService,
  type QuotationDto,
  type QuotationInput,
  type ConfirmResult,
} from './quotation.service';
import { QuotationDocxService } from './quotation-docx.service';

/** 报价单 HTTP 接口。 */
@Controller('quotations')
export class QuotationController {
  constructor(
    private readonly service: QuotationService,
    private readonly docxService: QuotationDocxService,
  ) {}

  @Get()
  findAll(
    @Query('quoteNo') quoteNo?: string,
    @Query('customerId') customerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('group') group?: 'active' | 'rejected',
  ): QuotationDto[] {
    return this.service.findAll({
      quoteNo,
      customerId: customerId === undefined ? undefined : Number(customerId),
      dateFrom,
      dateTo,
      group,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): QuotationDto {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() input: QuotationInput): QuotationDto {
    return this.service.create(input);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() input: QuotationInput): QuotationDto {
    return this.service.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { deleted: boolean } {
    this.service.remove(id);
    return { deleted: true };
  }

  /** POST /quotations/:id/confirm —— 确认并扣减库存。 */
  @Post(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number): ConfirmResult {
    return this.service.confirm(id);
  }

  /** POST /quotations/:id/duplicate —— 复制为新草稿单。 */
  @Post(':id/duplicate')
  duplicate(@Param('id', ParseIntPipe) id: number): QuotationDto {
    return this.service.duplicate(id);
  }

  /** POST /quotations/:id/reject —— 打回并冲销还库。 */
  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number): QuotationDto {
    return this.service.reject(id);
  }

  /** GET /quotations/:id/print —— 打印视图数据。 */
  @Get(':id/print')
  print(@Param('id', ParseIntPipe) id: number): Record<string, unknown> {
    return this.service.getPrintData(id);
  }

  /** GET /quotations/:id/docx —— 导出 Word 版报价单（纯单据内容）。 */
  @Get(':id/docx')
  async docx(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const printData = this.service.getPrintData(id) as any;
    const buffer = await this.docxService.render(printData);
    const safeName = String(printData.quoteNo ?? `quotation-${id}`).replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeName}.docx"`,
    });
    res.send(buffer);
  }
}
