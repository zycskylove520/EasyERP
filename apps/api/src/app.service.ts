import { Injectable } from '@nestjs/common';

/** 提供应用级基础查询。骨架阶段仅返回健康检查与欢迎信息。 */
@Injectable()
export class AppService {
  /** 返回健康检查响应。 */
  getHealth(): { status: string; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** 返回欢迎信息。 */
  getHello(): string {
    return 'EasyERP API is running';
  }
}
