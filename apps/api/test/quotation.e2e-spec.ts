import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase, getDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

describe('批次3 报价单 (e2e) · 报价阶段不涉及库存', () => {
  let app: INestApplication;
  let productId: number;
  let customerId: number;
  const createdQuoteIds: number[] = [];

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    const categories = await request(app.getHttpServer()).get('/categories');
    const tubeId = categories.body.find((c: { name: string }) => c.name === '纸管').id;
    const product = await request(app.getHttpServer())
      .post('/products')
      .send({ categoryId: tubeId, name: '__报价测试货品__', unit: '个' })
      .expect(201);
    productId = product.body.id;
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .send({ name: '__报价测试客户__' })
      .expect(201);
    customerId = customer.body.id;

    await request(app.getHttpServer())
      .post('/inventory/initial')
      .send({ productId, quantity: 100 })
      .expect(201);
  });

  afterAll(async () => {
    const db = getDatabase();
    for (const quoteId of createdQuoteIds) {
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(quoteId);
      db.prepare('DELETE FROM quotations WHERE id = ?').run(quoteId);
    }
    db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(productId);
    db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
    await app.close();
    closeDatabase();
  });

  async function createQuote(quantity: number): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/quotations')
      .send({
        customerId,
        quoteDate: '2026-11-21',
        currency: 'RMB',
        sender: '测试发货方',
        attn: '王先生',
        remarks: '测试备注',
        items: [
          {
            productId,
            productName: '纸管 φ13',
            specs: { phi: 13, thickness: 22 },
            specLabels: { phi: 'φ数', thickness: '厚度' },
            unit: '个',
            unitPrice: 0.17,
            quantity,
            deliveryDate: '2026-11-25',
          },
        ],
      })
      .expect(201);
    createdQuoteIds.push(res.body.id);
    return res.body.id;
  }

  async function stockOf(): Promise<number> {
    const res = await request(app.getHttpServer()).get('/inventory/stock').expect(200);
    return res.body.find((s: { productId: number }) => s.productId === productId).quantity;
  }

  it('建单为草稿，不动库存；单号格式正确', async () => {
    const id = await createQuote(30);
    const res = await request(app.getHttpServer()).get(`/quotations/${id}`).expect(200);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.quoteNo).toMatch(/^QT-\d{8}-\d{4}$/);
    expect(res.body.items).toHaveLength(1);
    expect(await stockOf()).toBe(100);
  });

  it('确认报价单：仅改状态，不扣库存（扣库已移到送货单阶段）', async () => {
    const id = await createQuote(30);
    const res = await request(app.getHttpServer()).post(`/quotations/${id}/confirm`).expect(201);
    expect(res.body.quotation.status).toBe('CONFIRMED');
    expect(res.body.lowStock).toHaveLength(0);
    expect(res.body.quotation.items[0].inventoryLedgerId).toBeNull();
    expect(await stockOf()).toBe(100); // 报价确认不再扣库
  });

  it('草稿报价单可直接打回（无确认环节），不冲销库存', async () => {
    const id = await createQuote(30);
    const res = await request(app.getHttpServer()).post(`/quotations/${id}/reject`).expect(201);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.items[0].reversalLedgerId).toBeNull();
    expect(await stockOf()).toBe(100); // 从未扣过，无需还回
  });

  it('重复打回被拒绝（409，状态机约束）', async () => {
    const id = await createQuote(30);
    await request(app.getHttpServer()).post(`/quotations/${id}/confirm`).expect(201);
    await request(app.getHttpServer()).post(`/quotations/${id}/reject`).expect(201);
    await request(app.getHttpServer()).post(`/quotations/${id}/reject`).expect(409);
    expect(await stockOf()).toBe(100);
  });

  it('确认后不可编辑/删除（409）', async () => {
    const id = await createQuote(10);
    await request(app.getHttpServer()).post(`/quotations/${id}/confirm`).expect(201);
    await request(app.getHttpServer())
      .patch(`/quotations/${id}`)
      .send({ customerId, quoteDate: '2026-11-21', items: [] })
      .expect(409);
    await request(app.getHttpServer()).delete(`/quotations/${id}`).expect(409);
  });

  it('复制报价单：生成新草稿单，信息照搬但单号不同、不动库存', async () => {
    const id = await createQuote(30);
    const stockBefore = await stockOf();
    const copy = await request(app.getHttpServer()).post(`/quotations/${id}/duplicate`).expect(201);
    createdQuoteIds.push(copy.body.id);
    expect(copy.body.id).not.toBe(id);
    expect(copy.body.status).toBe('DRAFT');
    expect(copy.body.quoteNo).not.toBe((await request(app.getHttpServer()).get(`/quotations/${id}`)).body.quoteNo);
    expect(copy.body.customerId).toBe(customerId);
    expect(copy.body.items).toHaveLength(1);
    expect(copy.body.items[0].productName).toBe('纸管 φ13');
    expect(copy.body.items[0].specs).toEqual({ phi: 13, thickness: 22 });
    expect(copy.body.items[0].specLabels).toEqual({ phi: 'φ数', thickness: '厚度' });
    expect(copy.body.items[0].inventoryLedgerId).toBeNull();
    expect(await stockOf()).toBe(stockBefore);
  });

  it('打印数据：含表头、明细列、备注条款', async () => {
    const id = await createQuote(5);
    const res = await request(app.getHttpServer()).get(`/quotations/${id}/print`).expect(200);
    expect(res.body.title).toBe('报  价  单');
    expect(res.body.customer).toBe('__报价测试客户__');
    expect(res.body.columns).toContain('规格');
    // 规格摘要按品类字段展开
    expect(res.body.items[0].specText).toContain('φ数');
    expect(res.body.items[0].specText).toContain('厚度');
    expect(res.body.terms).toHaveLength(0);
  });
});
