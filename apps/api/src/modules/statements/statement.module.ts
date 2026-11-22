import { Module } from '@nestjs/common';
import { StatementController } from './statement.controller';
import { StatementService } from './statement.service';
import { StatementDocxService } from './statement-docx.service';
import { DeliveryNoteModule } from '../delivery-notes/delivery-note.module';
import { CompanyInfoModule } from '../company-info/company-info.module';
import { CustomerModule } from '../customers/customer.module';

/** 对帐单模块（依赖送货单模块汇总明细、客户模块取 ATTN；不涉及库存）。 */
@Module({
  imports: [DeliveryNoteModule, CompanyInfoModule, CustomerModule],
  controllers: [StatementController],
  providers: [StatementService, StatementDocxService],
  exports: [StatementService],
})
export class StatementModule {}
