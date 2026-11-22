import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase, getDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

describe('批次2 库存流水 (e2e)', () => {
  let app: INestApplication;
  let productId: number;

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    // 造一个专属测试货品，避免依赖其他测试数据
    const categories = await request(app.getHttpServer()).get('/categories');
    const tubeId = categories.body.find((c: { name: string }) => c.name === '纸管').id;
    const created = await request(app.getHttpServer())
      .post('/products')
      .send({ categoryId: tubeId, name: '__库存测试货品__', unit: '个' })
      .expect(201);
    productId = created.body.id;
  });

  afterAll(async () => {
    // 清理本测试产生的流水与货品，保持库干净
    const db = getDatabase();
    db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(productId);
    db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    await app.close();
    closeDatabase();
  });

  it('期初设置后当前库存 = 期初量，流水记为 INITIAL', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventory/initial')
      .send({ productId, quantity: 100, note: '期初盘点' })
      .expect(201);
    expect(res.body.reason).toBe('INITIAL');
    expect(res.body.delta).toBe(100);
    expect(res.body.note).toBe('期初盘点');

    const stock = await request(app.getHttpServer()).get('/inventory/stock').expect(200);
    const row = stock.body.find((s: { productId: number }) => s.productId === productId);
    expect(row.quantity).toBe(100);
  });

  it('重复设置期初被拒绝（409）', async () => {
    await request(app.getHttpServer())
      .post('/inventory/initial')
      .send({ productId, quantity: 999 })
      .expect(409);
  });

  it('手工调整后库存 = 累加结果，流水可追溯', async () => {
    await request(app.getHttpServer())
      .post('/inventory/adjust')
      .send({ productId, delta: -30, note: '损耗' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/inventory/adjust')
      .send({ productId, delta: 5 })
      .expect(201);

    const stock = await request(app.getHttpServer()).get('/inventory/stock').expect(200);
    const row = stock.body.find((s: { productId: number }) => s.productId === productId);
    expect(row.quantity).toBe(75); // 100 - 30 + 5

    const ledger = await request(app.getHttpServer())
      .get(`/inventory/ledger?productId=${productId}`)
      .expect(200);
    expect(ledger.body).toHaveLength(3);
    const reasons = ledger.body.map((l: { reason: string }) => l.reason);
    expect(reasons).toContain('INITIAL');
    expect(reasons.filter((r: string) => r === 'MANUAL_ADJUST')).toHaveLength(2);
    // 最新在前
    expect(ledger.body[0].id).toBeGreaterThan(ledger.body[1].id);
  });

  it('按原因筛选流水', async () => {
    const res = await request(app.getHttpServer())
      .get(`/inventory/ledger?productId=${productId}&reason=MANUAL_ADJUST`)
      .expect(200);
    expect(res.body).toHaveLength(2);
  });

  it('调整数量为 0 被拒绝（409）', async () => {
    await request(app.getHttpServer())
      .post('/inventory/adjust')
      .send({ productId, delta: 0 })
      .expect(409);
  });

  it('不存在的货品：期初/调整/查询返回 404', async () => {
    await request(app.getHttpServer())
      .post('/inventory/initial')
      .send({ productId: 999999, quantity: 1 })
      .expect(404);
    await request(app.getHttpServer())
      .post('/inventory/adjust')
      .send({ productId: 999999, delta: 1 })
      .expect(404);
  });
});
