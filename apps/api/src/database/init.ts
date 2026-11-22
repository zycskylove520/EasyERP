import { migrate } from './schema';

/**
 * 应用启动时初始化数据库：只建表，不写任何种子。
 * 品类与公司档案等业务数据一律由使用者自行录入。
 */
export function initializeDatabase(): void {
  migrate();
}
