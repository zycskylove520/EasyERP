import { Module } from '@nestjs/common';
import { DeliveryNoteController } from './delivery-note.controller';
import { DeliveryNoteService } from './delivery-note.service';
import { DeliveryNoteDocxService } from './delivery-note-docx.service';
import { InventoryModule } from '../inventory/inventory.module';
import { QuotationModule } from '../quotations/quotation.module';
import { CompanyInfoModule } from '../company-info/company-info.module';

/** 送货单模块（依赖库存做扣库、依赖报价单做可选带入）。 */
@Module({
  imports: [InventoryModule, QuotationModule, CompanyInfoModule],
  controllers: [DeliveryNoteController],
  providers: [DeliveryNoteService, DeliveryNoteDocxService],
  exports: [DeliveryNoteService],
})
export class DeliveryNoteModule {}
