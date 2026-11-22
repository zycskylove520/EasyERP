import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Patch,
  Post,
} from '@nestjs/common';
import { CategoryService, type CategoryDto, type CategoryInput } from './category.service';

/** 品类字典 HTTP 接口。 */
@Controller('categories')
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  /** GET /categories —— 全部品类，可按业务域过滤。 */
  @Get()
  findAll(
    @Query('name') name?: string,
    @Query('module') module?: string,
    @Query('bizType') bizType?: 'SUPPLY' | 'SALE',
  ): CategoryDto[] {
    return this.service.findAll({ name, module, bizType });
  }

  /** GET /categories/:id —— 单个品类。 */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): CategoryDto {
    return this.service.findOne(id);
  }

  /** POST /categories —— 新增品类。 */
  @Post()
  create(@Body() input: CategoryInput): CategoryDto {
    return this.service.create(input);
  }

  /** PATCH /categories/:id —— 编辑品类（含规格字段）。 */
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() input: CategoryInput): CategoryDto {
    return this.service.update(id, input);
  }

  /** DELETE /categories/:id —— 删除品类（有货品时拒绝）。 */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { deleted: boolean } {
    this.service.remove(id);
    return { deleted: true };
  }
}
