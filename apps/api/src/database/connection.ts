import Database from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';

/**
 * 数据库连接单例。
 *
 * 数据库文件固定在项目内 `data/easyerp.db`（相对本源码目录解析，不依赖进程 cwd），
 * 保证「随软件走、不污染项目外」。
 */
let instance: Database.Database | null = null;

/** 返回数据库文件的绝对路径（项目内 data/easyerp.db）。 */
export function databaseFilePath(): string {
  // 测试可通过 EASYERP_DB_FILE 指定独立库，避免并行 worker 互相污染。
  const override = process.env.EASYERP_DB_FILE;
  if (override) return path.resolve(override);
  // 运行时位于 dist/database/connection.js 或源码 src/database/connection.ts，
  // 两者的 ../../data 都指向 apps/api/data。
  const dataDir = path.resolve(__dirname, '..', '..', 'data');
  return path.join(dataDir, 'easyerp.db');
}

/** 获取（或首次创建）数据库连接。连接启用 WAL 与外键约束。 */
export function getDatabase(): Database.Database {
  if (instance) return instance;
  const file = databaseFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  instance = db;
  return db;
}

/**
 * 在事务中执行函数，返回其返回值；异常时自动回滚。
 *
 * 库存扣减/冲销与单据状态变更必须包在同一事务里，避免出现
 * 「单据已生成但库存未扣」或「已打回但库存未还」的中间态。
 */
export function transaction<T>(fn: () => T): T {
  return getDatabase().transaction(fn)();
}

/** 关闭连接（供测试与优雅退出使用）。 */
export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
