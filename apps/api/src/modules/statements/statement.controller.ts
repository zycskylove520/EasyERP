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
import { StatementDocxService } from './statement-docx.service';
import {
  StatementService,
  type StatementDto,
  type StatementInput,
  type StatementFromCustomerMonth,
} from './statement.service';

/** 对帐单 HTTP 接口。 */
@Controller('statements')
export class StatementController {
  constructor(
    private readonly service: StatementService,
    private readonly docxService: StatementDocxService,
  ) {}

  @Get()
  findAll(
    @Query('statementNo') statementNo?: string,
    @Query('customerId') customerId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('group') group?: 'active' | 'rejected',
  ): StatementDto[] {
    return this.service.findAll({
      statementNo,
      customerId: customerId === undefined ? undefined : Number(customerId),
      dateFrom,
      dateTo,
      group,
    });
  }

  /** GET /statements/from-customer-month?customerId=&month=YYYY-MM —— 按客户+月份汇总送货单。 */
  @Get('from-customer-month')
  fromCustomerMonth(
    @Query('customerId', ParseIntPipe) customerId: number,
    @Query('month') month: string,
  ): StatementFromCustomerMonth {
    return this.service.fromCustomerMonth(customerId, month);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): StatementDto {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() input: StatementInput): StatementDto {
    return this.service.create(input);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() input: StatementInput): StatementDto {
    return this.service.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { deleted: boolean } {
    this.service.remove(id);
    return { deleted: true };
  }

  /** POST /statements/:id/confirm —— 确认（不动库存）。 */
  @Post(':id/confirm')
  confirm(@Param('id', ParseIntPipe) id: number): StatementDto {
    return this.service.confirm(id);
  }

  /** POST /statements/:id/duplicate —— 复制为新草稿单。 */
  @Post(':id/duplicate')
  duplicate(@Param('id', ParseIntPipe) id: number): StatementDto {
    return this.service.duplicate(id);
  }

  /** POST /statements/:id/reject —— 打回（不动库存）。 */
  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number): StatementDto {
    return this.service.reject(id);
  }

  /** GET /statements/:id/print —— 打印视图数据。 */
  @Get(':id/print')
  print(@Param('id', ParseIntPipe) id: number): Record<string, unknown> {
    return this.service.getPrintData(id);
  }

  /** GET /statements/:id/docx —— 导出 Word 版对帐单（与打印预览同源）。 */
  @Get(':id/docx')
  async docx(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const printData = this.service.getPrintData(id) as any;
    const buffer = await this.docxService.render(printData);
    const safeName = String(printData.statementNo ?? `statement-${id}`).replace(/[^\w\u4e00-\u9fa5-]/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${safeName}.docx"`,
    });
    res.send(buffer);
  }
}
