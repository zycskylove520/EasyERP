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
import { CustomerService, type CustomerDto, type CustomerInput } from './customer.service';

/** 客户 HTTP 接口。 */
@Controller('customers')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Get()
  findAll(): CustomerDto[] {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number): CustomerDto {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() input: CustomerInput): CustomerDto {
    return this.service.create(input);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() input: CustomerInput): CustomerDto {
    return this.service.update(id, input);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number): { deleted: boolean } {
    this.service.remove(id);
    return { deleted: true };
  }
}
