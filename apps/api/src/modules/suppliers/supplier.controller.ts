import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { SupplierService, type SupplierDto, type SupplierInput } from './supplier.service';

/** 供货商 HTTP 接口。 */
@Controller('suppliers')
export class SupplierController {
  constructor(private readonly service: SupplierService) {}

  @Get()
  findAll(): SupplierDto[] {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): SupplierDto {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() input: SupplierInput): SupplierDto {
    return this.service.create(input);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() input: SupplierInput): SupplierDto {
    return this.service.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { deleted: boolean } {
    this.service.remove(id);
    return { deleted: true };
  }
}
