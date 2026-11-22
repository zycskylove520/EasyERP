import { Body, Controller, Get, Patch } from '@nestjs/common';
import { CompanyInfoService, type CompanyInfoDto, type CompanyInfoInput } from './company-info.service';

/** 公司基础信息 HTTP 接口（单条档案）。 */
@Controller('company-info')
export class CompanyInfoController {
  constructor(private readonly service: CompanyInfoService) {}

  /** GET /company-info —— 获取公司信息。 */
  @Get()
  get(): CompanyInfoDto {
    return this.service.get();
  }

  /** PATCH /company-info —— 更新公司信息。 */
  @Patch()
  update(@Body() input: CompanyInfoInput): CompanyInfoDto {
    return this.service.update(input);
  }
}
