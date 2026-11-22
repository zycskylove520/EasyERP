import { Module } from '@nestjs/common';
import { QuotationController } from './quotation.controller';
import { QuotationService } from './quotation.service';
import { QuotationDocxService } from './quotation-docx.service';
import { CompanyInfoModule } from '../company-info/company-info.module';

/** 报价单模块（报价阶段不涉及库存，扣库在送货单阶段）。 */
@Module({
  imports: [CompanyInfoModule],
  controllers: [QuotationController],
  providers: [QuotationService, QuotationDocxService],
  exports: [QuotationService],
})
export class QuotationModule {}
