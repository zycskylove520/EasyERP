import { Module } from '@nestjs/common';
import { PurchaseOrderController } from './purchase-order.controller';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseOrderDocxService } from './purchase-order-docx.service';
import { InventoryModule } from '../inventory/inventory.module';
import { CompanyInfoModule } from '../company-info/company-info.module';

/** 订购单模块（依赖库存模块做确认加库 / 打回减库）。 */
@Module({
  imports: [InventoryModule, CompanyInfoModule],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService, PurchaseOrderDocxService],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
