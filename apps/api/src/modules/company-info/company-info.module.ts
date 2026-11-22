import { Module } from '@nestjs/common';
import { CompanyInfoController } from './company-info.controller';
import { CompanyInfoService } from './company-info.service';

/** 公司基础信息模块（单条档案，供各单据引用与前端维护）。 */
@Module({
  controllers: [CompanyInfoController],
  providers: [CompanyInfoService],
  exports: [CompanyInfoService],
})
export class CompanyInfoModule {}
