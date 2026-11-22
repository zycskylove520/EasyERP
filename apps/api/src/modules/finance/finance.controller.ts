import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query,
} from '@nestjs/common';
import {
  FinanceService,
  type FinanceDueRow,
  type FinanceRecordDto,
  type FinanceRecordInput,
  type FinanceSummary,
} from './finance.service';

/** 财务管理 HTTP 接口。 */
@Controller('finance')
export class FinanceController {
  constructor(private readonly service: FinanceService) {}

  /** 财务汇总 KPI + 趋势。 */
  @Get('summary')
  summary(): FinanceSummary {
    return this.service.summary();
  }

  /** 应收列表（已确认对帐单）。 */
  @Get('receivables')
  receivables(): FinanceDueRow[] {
    return this.service.receivables();
  }

  /** 应付列表（已确认订购单）。 */
  @Get('payables')
  payables(): FinanceDueRow[] {
    return this.service.payables();
  }

  /** 收付款记录。 */
  @Get('records')
  records(@Query('type') type?: 'RECEIVE' | 'PAY', @Query('refId') refId?: string): FinanceRecordDto[] {
    return this.service.records(type, refId === undefined ? undefined : Number(refId));
  }

  /** 登记收付款。 */
  @Post('records')
  create(@Body() input: FinanceRecordInput): FinanceRecordDto {
    return this.service.create(input);
  }

  /** 删除收付款记录。 */
  @Delete('records/:id')
  remove(@Param('id', ParseIntPipe) id: number): { deleted: boolean } {
    this.service.remove(id);
    return { deleted: true };
  }
}
