import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/** 应用级基础路由控制器。 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** GET / —— 欢迎信息。 */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** GET /health —— 健康检查，供前端与运维探活。 */
  @Get('health')
  getHealth(): { status: string; timestamp: string } {
    return this.appService.getHealth();
  }
}
