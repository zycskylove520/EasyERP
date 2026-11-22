import { Controller, Get, Query } from '@nestjs/common';
import { OverviewService, type OverviewData } from './overview.service';

/** 概览看板 HTTP 接口。 */
@Controller('overview')
export class OverviewController {
  constructor(private readonly service: OverviewService) {}

  /** GET /overview?months=12 —— 一次性返回看板聚合数据。 */
  @Get()
  get(@Query('months') months?: string): OverviewData {
    const n = months === undefined ? 12 : Number(months);
    return this.service.get(Number.isFinite(n) ? n : 12);
  }
}
