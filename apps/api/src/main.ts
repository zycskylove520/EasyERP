import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { initializeDatabase } from './database/init';
import * as path from 'node:path';
import * as fs from 'node:fs';

/** 应用启动入口：初始化数据库、启动 API、托管前端静态资源，监听端口。 */
async function bootstrap(): Promise<void> {
  initializeDatabase();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Electron 前端与本地后端不同源，放开 CORS。
  app.enableCors();

  // 托管前端构建产物：Electron 通过 http://127.0.0.1:PORT/ 访问，
  // 避免 file:// 下 ES module 的 CORS 限制与路由问题。
  // __dirname = apps/api/dist/src → 上三级到 apps/ → 进 web/dist
  const webDist = path.resolve(__dirname, '..', '..', '..', 'web', 'dist');
  if (fs.existsSync(webDist)) {
    // ExpressAdapter 的 useStaticAssets：把 dist 挂到根路径，并指定首页 index.html
    app.useStaticAssets(webDist, { index: 'index.html' });
  }

  const port = Number(process.env.PORT ?? 3100);
  await app.listen(port);
}

void bootstrap();
