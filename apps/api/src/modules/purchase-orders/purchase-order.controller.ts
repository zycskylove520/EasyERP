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
import { PurchaseOrderDocxService } from './purchase-order-docx.service';
import {
  PurchaseOrderService,
  type PurchaseOrderDto,
  type PurchaseOrderInput,
  type PurchaseOrderConfirmResult,
} from './purchase-order.service';

/** 订购单 HTTP 接口。 */
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(
    private readonly service: PurchaseOrderService,
    private readonly docxService: PurchaseOrderDocxService,
  ) {}

  @Get()
  findAll(
    @Query('orderNo') orderNo?: string,
    @Query('supplierId') supplierId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('group') group?: 'active' | 'rejected',
  ): PurchaseOrderDto[] {
    return this.service.findAll({
      orderNo,
      supplierId: supplierId === undefined ? undefined : Number(supplierId),
      dateFrom,
      dateTo,
      group,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): PurchaseOrderDto {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() input: PurchaseOrderInput): PurchaseOrderDto {
    return this.service.create(input);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() input: PurchaseOrderInput): PurchaseOrderDto {
    return this.service.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { deleted: boolean } {
    this.service.remove(id);
    return { deleted: true };
  }

  /** POST /purchase-orders/:id/confirm —— 确认并加库。 */
  @Post(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number): PurchaseOrderConfirmResult {
    return this.service.confirm(id);
  }

  /** POST /purchase-orders/:id/duplicate —— 复制为新草稿单。 */
  @Post(':id/duplicate')
  duplicate(@Param('id', ParseIntPipe) id: number): PurchaseOrderDto {
    return this.service.duplicate(id);
  }

  /** POST /purchase-orders/:id/reject —— 打回并冲销还库。 */
  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number): PurchaseOrderDto {
    return this.service.reject(id);
  }

  /** GET /purchase-orders/:id/print —— 打印视图数据（规格按品类动态拆列）。 */
  @Get(':id/print')
  print(@Param('id', ParseIntPipe) id: number): Record<string, unknown> {
    return this.service.getPrintData(id);
  }

  /** GET /purchase-orders/:id/docx —— 导出 Word 版订购单（与打印预览同源）。 */
  @Get(':id/docx')
  async docx(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const printData = this.service.getPrintData(id) as any;
    const buffer = await this.docxService.render(printData);
    const safeName = String(printData.orderNo ?? `purchase-${id}`).replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeName}.docx"`,
    });
    res.send(buffer);
  }
}
