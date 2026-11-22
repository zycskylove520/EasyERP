// 每个 Jest worker 使用独立数据库文件，避免并行测试共享 data/easyerp.db 相互污染。
// 放在 test/tmp/ 下（.gitignore 已排除测试产物）。
import * as path from 'node:path';

const workerId = process.env.JEST_WORKER_ID ?? '1';
const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
process.env.EASYERP_DB_FILE = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '.tmp',
  `test-${workerId}-${unique}.db`,
);
