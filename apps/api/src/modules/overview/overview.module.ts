import { Module } from '@nestjs/common';
import { OverviewController } from './overview.controller';
import { OverviewService } from './overview.service';

/** 概览看板模块（聚合各业务表数据，只读）。 */
@Module({
  controllers: [OverviewController],
  providers: [OverviewService],
})
export class OverviewModule {}
