import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase, getDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

describe('订购单与库存联动 (e2e)', () => {
  let app: INestApplication;
  let productId: number;
  let supplierId: number;
  const orderIds: number[] = [];

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
      .send({ categoryId: tubeId, name: '__订购测试货品__', unit: '个' })
      .expect(201);
    productId = product.body.id;
    const supplier = await request(app.getHttpServer())
      .post('/suppliers')
      .send({ name: '__订购测试供应商__' })
      .expect(201);
    supplierId = supplier.body.id;
    await request(app.getHttpServer()).post('/inventory/initial').send({ productId, quantity: 100 }).expect(201);
  });

  afterAll(async () => {
    const db = getDatabase();
    for (const id of orderIds) {
      db.prepare('UPDATE purchase_order_items SET inventory_ledger_id = NULL, reversal_ledger_id = NULL WHERE purchase_order_id = ?').run(id);
      db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(id);
      db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(id);
    }
    db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(productId);
    db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(supplierId);
    await app.close();
    closeDatabase();
  });

  async function createOrder(quantity: number): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/purchase-orders')
      .send({
        supplierId,
        orderDate: '2026-11-21',
        deliveryDate: '2026-11-25',
        attn: '陈先生',
        items: [
          {
            productId,
            productName: '纸管 φ13',
            specs: { phi: 13, thickness: 22, material: '白底' },
            specLabels: { phi: 'φ数', thickness: '厚度', material: '材质' },
            unit: '个',
            quantity,
          },
        ],
      })
      .expect(201);
    orderIds.push(res.body.id);
    return res.body.id;
  }

  async function stockOf(): Promise<number> {
    const res = await request(app.getHttpServer()).get('/inventory/stock').expect(200);
    return res.body.find((s: { productId: number }) => s.productId === productId).quantity;
  }

  it('建单为草稿，不动库存；单号格式与供应商名快照正确', async () => {
    const id = await createOrder(20);
    const res = await request(app.getHttpServer()).get(`/purchase-orders/${id}`).expect(200);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.orderNo).toMatch(/^PO-\d{8}-\d{4}$/);
    expect(res.body.supplierName).toBe('__订购测试供应商__');
    expect(res.body.deliveryDate).toBe('2026-11-25'); // 交货期在表头
    expect(res.body.items[0].specs.phi).toBe(13); // 规格结构化拆分
    expect(res.body.items[0].specs.material).toBe('白底'); // 材质是规格字段之一
    expect(res.body.items[0].specLabels.material).toBe('材质');
    expect(await stockOf()).toBe(100);
  });

  it('确认订购单：按数量加库，明细记录 PO_RECEIVE 流水', async () => {
    const id = await createOrder(20);
    const res = await request(app.getHttpServer()).post(`/purchase-orders/${id}/confirm`).expect(201);
    expect(res.body.order.status).toBe('CONFIRMED');
    expect(res.body.order.items[0].inventoryLedgerId).not.toBeNull();
    expect(await stockOf()).toBe(120);

    const ledger = await request(app.getHttpServer())
      .get(`/inventory/ledger?productId=${productId}&reason=PO_RECEIVE`)
      .expect(200);
    const mine = ledger.body.find((l: { refId: number }) => l.refId === id);
    expect(mine).toBeDefined();
    expect(mine.delta).toBe(20);
    expect(mine.refType).toBe('purchase_order');

    await request(app.getHttpServer()).post(`/purchase-orders/${id}/reject`).expect(201);
    expect(await stockOf()).toBe(100);
  });

  it('打回：冲销减回，生成 PO_REVERSE 指向原加库，幂等', async () => {
    const id = await createOrder(20);
    await request(app.getHttpServer()).post(`/purchase-orders/${id}/confirm`).expect(201);
    const res = await request(app.getHttpServer()).post(`/purchase-orders/${id}/reject`).expect(201);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.items[0].reversalLedgerId).not.toBeNull();
    expect(await stockOf()).toBe(100);

    const reversals = await request(app.getHttpServer())
      .get(`/inventory/ledger?productId=${productId}&reason=PO_REVERSE`)
      .expect(200);
    const mine = reversals.body.find(
      (l: { reversalOf: number }) => l.reversalOf === res.body.items[0].inventoryLedgerId,
    );
    expect(mine).toBeDefined();
    expect(mine.delta).toBe(-20);

    await request(app.getHttpServer()).post(`/purchase-orders/${id}/reject`).expect(409);
    expect(await stockOf()).toBe(100);
  });

  it('复制订购单：新草稿单，不动库存', async () => {
    const id = await createOrder(10);
    const copy = await request(app.getHttpServer()).post(`/purchase-orders/${id}/duplicate`).expect(201);
    orderIds.push(copy.body.id);
    expect(copy.body.id).not.toBe(id);
    expect(copy.body.status).toBe('DRAFT');
    expect(copy.body.items[0].productName).toBe('纸管 φ13');
    expect(await stockOf()).toBe(100);
  });

  it('导出 docx：返回有效 Word 文件（PK 头）', async () => {
    const id = await createOrder(10);
    const res = await request(app.getHttpServer()).get(`/purchase-orders/${id}/docx`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(res.headers['content-type']).toContain('wordprocessingml');
    expect(res.headers['content-disposition']).toContain('.docx');
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.slice(0, 2).toString()).toBe('PK');
  });

  it('分组：active / rejected 互斥', async () => {
    const active = await request(app.getHttpServer()).get('/purchase-orders?group=active').expect(200);
    const rejected = await request(app.getHttpServer()).get('/purchase-orders?group=rejected').expect(200);
    expect(active.body.every((o: { status: string }) => ['DRAFT', 'CONFIRMED'].includes(o.status))).toBe(true);
    expect(rejected.body.every((o: { status: string }) => ['REJECTED', 'WITHDRAWN'].includes(o.status))).toBe(true);
  });

  it('备注条款/表尾备注由客户填写；留空回退默认样本', async () => {
    // 自定义备注
    const custom = await request(app.getHttpServer()).post('/purchase-orders').send({
      supplierId,
      orderDate: '2026-11-21',
      terms: '客户自定条款一\n客户自定条款二',
      footnote: '客户自定表尾备注',
      items: [{ productId, productName: '纸管', unit: '个', quantity: 1, unitPrice: 1 }],
    }).expect(201);
    orderIds.push(custom.body.id);
    expect(custom.body.terms).toBe('客户自定条款一\n客户自定条款二');
    const print = await request(app.getHttpServer()).get(`/purchase-orders/${custom.body.id}/print`).expect(200);
    expect(print.body.terms).toEqual(['客户自定条款一', '客户自定条款二']);
    expect(print.body.footnote).toBe('客户自定表尾备注');

    // 留空则无条款（不再回退旧样本）
    const blank = await createOrder(1);
    const blankPrint = await request(app.getHttpServer()).get(`/purchase-orders/${blank}/print`).expect(200);
    expect(blankPrint.body.terms).toHaveLength(0);
    expect(blankPrint.body.footnote).toBe('');
  });
});
