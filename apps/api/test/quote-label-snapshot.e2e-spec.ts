import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

describe('业务变更02 报价规格 label 快照 (e2e)', () => {
  let app: INestApplication;
  let categoryId: number;
  let productId: number;
  let quoteId: number;

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    // 建一个带规格字段的品类（label=长度）
    const cat = await request(app.getHttpServer()).post('/categories').send({
      name: '快照测试品类', module: '测试',
      specSchema: [{ key: 'length', label: '长度', type: 'number', unit: 'MM' }],
    }).expect(201);
    categoryId = cat.body.id;

    const prod = await request(app.getHttpServer()).post('/products').send({
      categoryId, name: '快照测试货品', specs: { length: 350 },
    }).expect(201);
    productId = prod.body.id;

    // 制单时带 label 快照
    const q = await request(app.getHttpServer()).post('/quotations').send({
      quoteDate: '2026-11-21',
      items: [{
        productId, productName: '快照测试货品',
        specs: { length: 350 }, specLabels: { length: '长度' },
        unitPrice: 1, quantity: 1,
      }],
    }).expect(201);
    quoteId = q.body.id;
  });

  afterAll(async () => {
    const db = (await import('../src/database/connection')).getDatabase();
    db.prepare('UPDATE quotation_items SET inventory_ledger_id = NULL, reversal_ledger_id = NULL WHERE quotation_id = ?').run(quoteId);
    db.prepare('DELETE FROM quotations WHERE id = ?').run(quoteId);
    db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(productId);
    db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    try { db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId); } catch { /* 独立测试库，忽略清理残留 */ }
    await app.close();
    closeDatabase();
  });

  it('改品类字段 label 后，历史报价单打印仍用快照 label', async () => {
    // 把品类字段 label 从「长度」改成「LENGTH」
    await request(app.getHttpServer()).patch(`/categories/${categoryId}`).send({
      name: '快照测试品类', module: '测试',
      specSchema: [{ key: 'length', label: 'LENGTH', type: 'number', unit: 'MM' }],
    }).expect(200);

    // 货品列表列头会跟着变（活数据）——验证新 label 生效
    const printBefore = await request(app.getHttpServer()).get(`/quotations/${quoteId}/print`).expect(200);
    // 但报价单打印的规格摘要用的是制单快照 label「长度」，不是新的「LENGTH」
    expect(printBefore.body.items[0].specText).toContain('长度');
    expect(printBefore.body.items[0].specText).toContain('350');
    expect(printBefore.body.items[0].specText).not.toContain('LENGTH');
  });

  it('新报价单用最新 label', async () => {
    const q = await request(app.getHttpServer()).post('/quotations').send({
      quoteDate: '2026-11-21',
      items: [{
        productId, productName: '快照测试货品',
        specs: { length: 400 }, specLabels: { length: 'LENGTH' },
        unitPrice: 1, quantity: 1,
      }],
    }).expect(201);
    const print = await request(app.getHttpServer()).get(`/quotations/${q.body.id}/print`).expect(200);
    expect(print.body.items[0].specText).toContain('LENGTH');
    expect(print.body.items[0].specText).toContain('400');
    // 清理这张新单
    const db = (await import('../src/database/connection')).getDatabase();
    db.prepare('DELETE FROM quotations WHERE id = ?').run(q.body.id);
  });
});
