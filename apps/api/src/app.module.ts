import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import { CategoryModule } from './modules/categories/category.module';
import { ProductModule } from './modules/products/product.module';
import { SupplierModule } from './modules/suppliers/supplier.module';
import { CustomerModule } from './modules/customers/customer.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { QuotationModule } from './modules/quotations/quotation.module';
import { PurchaseOrderModule } from './modules/purchase-orders/purchase-order.module';
import { DeliveryNoteModule } from './modules/delivery-notes/delivery-note.module';
import { StatementModule } from './modules/statements/statement.module';
import { CompanyInfoModule } from './modules/company-info/company-info.module';
import { OverviewModule } from './modules/overview/overview.module';
import { FinanceModule } from './modules/finance/finance.module';

/** 应用根模块，聚合各业务模块与全局过滤器。 */
@Module({
  imports: [
    CategoryModule,
    ProductModule,
    SupplierModule,
    CustomerModule,
    InventoryModule,
    QuotationModule,
    PurchaseOrderModule,
    DeliveryNoteModule,
    StatementModule,
    CompanyInfoModule,
    OverviewModule,
    FinanceModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
