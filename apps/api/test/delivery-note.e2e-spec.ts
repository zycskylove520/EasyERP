import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase, getDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

describe('送货单与库存联动 (e2e)', () => {
  let app: INestApplication;
  let productId: number;
  let customerId: number;
  const noteIds: number[] = [];
  const quoteIds: number[] = [];

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    const categories = await request(app.getHttpServer()).get('/categories');
    const tubeId = categories.body.find((c: { name: string }) => c.name === '纸管').id;
    const product = await request(app.getHttpServer())
      .post('/products')
      .send({ categoryId: tubeId, name: '__送货测试货品__', unit: '个' })
      .expect(201);
    productId = product.body.id;
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .send({ name: '__送货测试客户__' })
      .expect(201);
    customerId = customer.body.id;
    await request(app.getHttpServer()).post('/inventory/initial').send({ productId, quantity: 100 }).expect(201);
  });

  afterAll(async () => {
    const db = getDatabase();
    for (const id of noteIds) {
      db.prepare('UPDATE delivery_note_items SET inventory_ledger_id = NULL, reversal_ledger_id = NULL WHERE delivery_note_id = ?').run(id);
      db.prepare('DELETE FROM delivery_note_items WHERE delivery_note_id = ?').run(id);
      db.prepare('DELETE FROM delivery_notes WHERE id = ?').run(id);
    }
    for (const id of quoteIds) {
      db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(id);
      db.prepare('DELETE FROM quotations WHERE id = ?').run(id);
    }
    db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(productId);
    db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
    await app.close();
    closeDatabase();
  });

  async function createNote(quantity: number): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/delivery-notes')
      .send({
        customerId,
        shipAddress: '测试地址',
        deliveryDate: '2026-11-21',
        orderNo: 'QT-TEST',
        items: [
          {
            partNo: 'L001',
            productId,
            productName: '纸管 φ13',
            spec: 'φ13*22',
            unit: '个',
            quantity,
            unitPrice: 0.17,
          },
        ],
      })
      .expect(201);
    noteIds.push(res.body.id);
    return res.body.id;
  }

  async function stockOf(): Promise<number> {
    const res = await request(app.getHttpServer()).get('/inventory/stock').expect(200);
    return res.body.find((s: { productId: number }) => s.productId === productId).quantity;
  }

  it('建单为草稿，不动库存；单号格式正确', async () => {
    const id = await createNote(30);
    const res = await request(app.getHttpServer()).get(`/delivery-notes/${id}`).expect(200);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.deliveryNo).toMatch(/^DN-\d{8}-\d{4}$/);
    expect(res.body.items[0].amount).toBeCloseTo(30 * 0.17, 6);
    expect(await stockOf()).toBe(100);
  });

  it('确认送货单：按数量扣库，明细记录 DELIVERY_CONSUME 流水', async () => {
    const id = await createNote(30);
    const res = await request(app.getHttpServer()).post(`/delivery-notes/${id}/confirm`).expect(201);
    expect(res.body.deliveryNote.status).toBe('CONFIRMED');
    expect(res.body.lowStock).toHaveLength(0);
    expect(res.body.deliveryNote.items[0].inventoryLedgerId).not.toBeNull();
    expect(await stockOf()).toBe(70);

    const ledger = await request(app.getHttpServer())
      .get(`/inventory/ledger?productId=${productId}&reason=DELIVERY_CONSUME`)
      .expect(200);
    const mine = ledger.body.find((l: { refId: number }) => l.refId === id);
    expect(mine).toBeDefined();
    expect(mine.delta).toBe(-30);
    expect(mine.refType).toBe('delivery_note');

    await request(app.getHttpServer()).post(`/delivery-notes/${id}/reject`).expect(201);
    expect(await stockOf()).toBe(100);
  });

  it('打回：冲销还库，生成 DELIVERY_REVERSE 指向原扣减，幂等', async () => {
    const id = await createNote(30);
    await request(app.getHttpServer()).post(`/delivery-notes/${id}/confirm`).expect(201);
    const res = await request(app.getHttpServer()).post(`/delivery-notes/${id}/reject`).expect(201);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.items[0].reversalLedgerId).not.toBeNull();
    expect(await stockOf()).toBe(100);

    const reversals = await request(app.getHttpServer())
      .get(`/inventory/ledger?productId=${productId}&reason=DELIVERY_REVERSE`)
      .expect(200);
    const mine = reversals.body.find(
      (l: { reversalOf: number }) => l.reversalOf === res.body.items[0].inventoryLedgerId,
    );
    expect(mine).toBeDefined();
    expect(mine.delta).toBe(30);

    await request(app.getHttpServer()).post(`/delivery-notes/${id}/reject`).expect(409);
    expect(await stockOf()).toBe(100);
  });

  it('库存不足时确认成功，允许负库存并返回补货提醒', async () => {
    const id = await createNote(500);
    const res = await request(app.getHttpServer()).post(`/delivery-notes/${id}/confirm`).expect(201);
    expect(res.body.deliveryNote.status).toBe('CONFIRMED');
    expect(res.body.lowStock).toHaveLength(1);
    expect(res.body.lowStock[0].productName).toContain('纸管');
    expect(res.body.lowStock[0].remaining).toBe(-400);
    expect(await stockOf()).toBe(-400);
    await request(app.getHttpServer()).post(`/delivery-notes/${id}/reject`).expect(201);
    expect(await stockOf()).toBe(100);
  });

  it('从报价单带入：明细与表头复制，来源记录正确', async () => {
    const quote = await request(app.getHttpServer())
      .post('/quotations')
      .send({
        customerId,
        quoteDate: '2026-11-21',
        items: [{ productId, productName: '纸管 φ13', spec: 'φ13*22', unit: '个', unitPrice: 0.5, quantity: 12 }],
      })
      .expect(201);
    quoteIds.push(quote.body.id);

    const prefill = await request(app.getHttpServer())
      .get(`/delivery-notes/from-quotation/${quote.body.id}`)
      .expect(200);
    expect(prefill.body.customerId).toBe(customerId);
    expect(prefill.body.orderNo).toBe(quote.body.quoteNo);
    expect(prefill.body.sourceQuotationId).toBe(quote.body.id);
    expect(prefill.body.items).toHaveLength(1);
    expect(prefill.body.items[0].productId).toBe(productId);
    expect(prefill.body.items[0].quantity).toBe(12);

    const id = (await request(app.getHttpServer()).post('/delivery-notes').send({
      customerId: prefill.body.customerId,
      deliveryDate: '2026-11-21',
      orderNo: prefill.body.orderNo,
      sourceQuotationId: prefill.body.sourceQuotationId,
      items: prefill.body.items,
    }).expect(201)).body.id;
    noteIds.push(id);
    const detail = await request(app.getHttpServer()).get(`/delivery-notes/${id}`).expect(200);
    expect(detail.body.sourceQuotationId).toBe(quote.body.id);
    expect(detail.body.items[0].quantity).toBe(12);
  });

  it('导出 docx：返回有效 Word 文件（PK 头）', async () => {
    const id = await createNote(10);
    const res = await request(app.getHttpServer()).get(`/delivery-notes/${id}/docx`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers['content-type']).toContain('wordprocessingml');
    expect(res.headers['content-disposition']).toContain('.docx');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.slice(0, 2).toString()).toBe('PK'); // zip/docx magic
  });

  it('分组：active 只含草稿/确认，rejected 只含打回', async () => {
    const active = await request(app.getHttpServer()).get('/delivery-notes?group=active').expect(200);
    const rejected = await request(app.getHttpServer()).get('/delivery-notes?group=rejected').expect(200);
    expect(active.body.every((n: { status: string }) => ['DRAFT', 'CONFIRMED'].includes(n.status))).toBe(true);
    expect(rejected.body.every((n: { status: string }) => ['REJECTED', 'WITHDRAWN'].includes(n.status))).toBe(true);
  });
});
