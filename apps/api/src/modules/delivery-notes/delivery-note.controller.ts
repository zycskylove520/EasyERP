import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { DeliveryNoteDocxService } from './delivery-note-docx.service';
import {
  DeliveryNoteService,
  type DeliveryNoteDto,
  type DeliveryNoteInput,
  type DeliveryNoteConfirmResult,
  type DeliveryFromQuotation,
} from './delivery-note.service';

/** 送货单 HTTP 接口。 */
@Controller('delivery-notes')
export class DeliveryNoteController {
  constructor(
    private readonly service: DeliveryNoteService,
    private readonly docxService: DeliveryNoteDocxService,
  ) {}

  @Get()
  findAll(
    @Query('deliveryNo') deliveryNo?: string,
    @Query('customerId') customerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('group') group?: 'active' | 'rejected',
  ): DeliveryNoteDto[] {
    return this.service.findAll({
      deliveryNo,
      customerId: customerId === undefined ? undefined : Number(customerId),
      dateFrom,
      dateTo,
      group,
    });
  }

  /** GET /delivery-notes/from-quotation/:id —— 从报价单带入的预填数据。 */
  @Get('from-quotation/:id')
  fromQuotation(@Param('id', ParseIntPipe) id: number): DeliveryFromQuotation {
    return this.service.fromQuotation(id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): DeliveryNoteDto {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() input: DeliveryNoteInput): DeliveryNoteDto {
    return this.service.create(input);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() input: DeliveryNoteInput): DeliveryNoteDto {
    return this.service.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { deleted: boolean } {
    this.service.remove(id);
    return { deleted: true };
  }

  /** POST /delivery-notes/:id/confirm —— 确认并扣库。 */
  @Post(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number): DeliveryNoteConfirmResult {
    return this.service.confirm(id);
  }

  /** POST /delivery-notes/:id/duplicate —— 复制为新草稿单。 */
  @Post(':id/duplicate')
  duplicate(@Param('id', ParseIntPipe) id: number): DeliveryNoteDto {
    return this.service.duplicate(id);
  }

  /** POST /delivery-notes/:id/reject —— 打回并冲销还库。 */
  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number): DeliveryNoteDto {
    return this.service.reject(id);
  }

  /** GET /delivery-notes/:id/print —— 打印视图数据（规格按品类动态拆列）。 */
  @Get(':id/print')
  print(@Param('id', ParseIntPipe) id: number): Record<string, unknown> {
    return this.service.getPrintData(id);
  }

  /** GET /delivery-notes/:id/docx —— 导出 Word 版送货单（与打印预览同源）。 */
  @Get(':id/docx')
  async docx(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const printData = this.service.getPrintData(id) as any;
    const buffer = await this.docxService.render(printData);
    const safeName = String(printData.deliveryNo ?? `delivery-${id}`).replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeName}.docx"`,
    });
    res.send(buffer);
  }
}
