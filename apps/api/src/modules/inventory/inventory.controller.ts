import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  InventoryService,
  type LedgerReason,
  type LedgerDto,
  type StockDto,
} from './inventory.service';

/** 期初设置输入。 */
export interface InitialInput {
  productId: number;
  quantity: number;
  note?: string;
}

/** 手工调整输入（增量模式）。 */
export interface AdjustInput {
  productId: number;
  delta: number;
  note?: string;
}

/** 手工调整输入（目标值模式）。 */
export interface SetQuantityInput {
  productId: number;
  target: number;
  note?: string;
}

/** 库存 HTTP 接口。 */
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  /** GET /inventory/stock?categoryId= —— 当前库存汇总。 */
  @Get('stock')
  getStock(@Query('categoryId') categoryId?: string): StockDto[] {
    return this.service.getStock(categoryId === undefined ? undefined : Number(categoryId));
  }

  /** GET /inventory/ledger?productId=&reason= —— 库存流水。 */
  @Get('ledger')
  getLedger(
    @Query('productId') productId?: string,
    @Query('reason') reason?: LedgerReason,
  ): LedgerDto[] {
    return this.service.getLedger(
      productId === undefined ? undefined : Number(productId),
      reason,
    );
  }

  /** POST /inventory/initial —— 设置期初库存（每个货品仅一次）。 */
  @Post('initial')
  setInitial(@Body() input: InitialInput): LedgerDto {
    return this.service.setInitial(input.productId, input.quantity, input.note);
  }

  /** POST /inventory/adjust —— 手工调整库存（增量模式）。 */
  @Post('adjust')
  adjust(@Body() input: AdjustInput): LedgerDto {
    return this.service.adjust(input.productId, input.delta, input.note);
  }

  /** POST /inventory/set —— 手工调整库存（目标值模式：直接设为指定数量）。 */
  @Post('set')
  setQuantity(@Body() input: SetQuantityInput): LedgerDto {
    return this.service.setQuantity(input.productId, input.target, input.note);
  }
}
