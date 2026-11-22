import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductService, type ProductDto, type ProductInput } from './product.service';

/** 货品 HTTP 接口。 */
@Controller('products')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  /** GET /products —— 货品列表（可按品类、业务域筛选）。 */
  @Get()
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('bizType') bizType?: 'SUPPLY' | 'SALE',
  ): ProductDto[] {
    return this.service.findAll(
      categoryId === undefined ? undefined : Number(categoryId),
      bizType,
    );
  }

  /** GET /products/:id —— 单个货品。 */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): ProductDto {
    return this.service.findOne(id);
  }

  /** POST /products —— 新建货品。 */
  @Post()
  create(@Body() input: ProductInput): ProductDto {
    return this.service.create(input);
  }

  /** PATCH /products/:id —— 更新货品。 */
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() input: ProductInput): ProductDto {
    return this.service.update(id, input);
  }

  /** DELETE /products/:id —— 删除货品。 */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { deleted: boolean } {
    this.service.remove(id);
    return { deleted: true };
  }
}
