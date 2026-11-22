import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase, getDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

/**
 * 全链路冒烟：订购加库 → 报价不动库 → 送货扣库 → 低库存提醒 → 对帐带入+导出 → 打回冲销。
 * 用一个货品贯穿所有单据，逐步断言库存数字，验证跨模块联动正确。
 */
describe('全链路业务冒烟 (e2e)', () => {
  let app: INestApplication;
  let productId: number;
  let customerId: number;
  let supplierId: number;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    const categories = await http().get('/categories');
    const tubeId = categories.body.find((c: { name: string }) => c.name === '纸管').id;
    productId = (await http().post('/products').send({ categoryId: tubeId, name: '__全链路货品__', unit: '个' }).expect(201)).body.id;
    customerId = (await http().post('/customers').send({ name: '__全链路客户__' }).expect(201)).body.id;
    supplierId = (await http().post('/suppliers').send({ name: '__全链路供应商__' }).expect(201)).body.id;
    await http().post('/inventory/initial').send({ productId, quantity: 100 }).expect(201);
  });

  afterAll(async () => {
    const db = getDatabase();
    db.prepare('DELETE FROM statement_items WHERE statement_id IN (SELECT id FROM statements)').run();
    db.prepare('DELETE FROM statements').run();
    db.prepare('UPDATE delivery_note_items SET inventory_ledger_id = NULL, reversal_ledger_id = NULL WHERE delivery_note_id IN (SELECT id FROM delivery_notes)').run();
    db.prepare('DELETE FROM delivery_note_items WHERE delivery_note_id IN (SELECT id FROM delivery_notes)').run();
    db.prepare('DELETE FROM delivery_notes').run();
    db.prepare('DELETE FROM quotation_items WHERE quotation_id IN (SELECT id FROM quotations)').run();
    db.prepare('DELETE FROM quotations').run();
    db.prepare('UPDATE purchase_order_items SET inventory_ledger_id = NULL, reversal_ledger_id = NULL WHERE purchase_order_id IN (SELECT id FROM purchase_orders)').run();
    db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id IN (SELECT id FROM purchase_orders)').run();
    db.prepare('DELETE FROM purchase_orders').run();
    db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(productId);
    db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(supplierId);
    await app.close();
    closeDatabase();
  });

  async function stockOf(): Promise<number> {
    const res = await http().get('/inventory/stock').expect(200);
    return res.body.find((s: { productId: number }) => s.productId === productId).quantity;
  }

  it('串起完整链路，库存数字逐步正确', async () => {
    // 期初
    expect(await stockOf()).toBe(100);

    // ① 订购单确认加库 +20 → 120
    const po = await http().post('/purchase-orders').send({
      supplierId, orderDate: '2026-11-21',
      items: [{ productId, productName: '纸管 φ13', unit: '个', quantity: 20 }],
    }).expect(201);
    const poConfirm = await http().post(`/purchase-orders/${po.body.id}/confirm`).expect(201);
    expect(poConfirm.body.order.status).toBe('CONFIRMED');
    expect(poConfirm.body.order.items[0].inventoryLedgerId).not.toBeNull();
    expect(await stockOf()).toBe(120);

    // ② 报价单确认不动库 → 仍 120
    const quote = await http().post('/quotations').send({
      customerId, quoteDate: '2026-11-21',
      items: [{ productId, productName: '纸管 φ13', unitPrice: 0.17, quantity: 10 }],
    }).expect(201);
    const quoteConfirm = await http().post(`/quotations/${quote.body.id}/confirm`).expect(201);
    expect(quoteConfirm.body.lowStock).toHaveLength(0);
    expect(quoteConfirm.body.quotation.items[0].inventoryLedgerId).toBeNull();
    expect(await stockOf()).toBe(120); // 报价不扣库

    // ③ 送货单确认扣库 -30 → 90
    const dn = await http().post('/delivery-notes').send({
      customerId, deliveryDate: '2026-11-21',
      items: [{ productId, productName: '纸管 φ13', unit: '个', quantity: 30, unitPrice: 0.17 }],
    }).expect(201);
    const dnConfirm = await http().post(`/delivery-notes/${dn.body.id}/confirm`).expect(201);
    expect(dnConfirm.body.lowStock).toHaveLength(0);
    expect(await stockOf()).toBe(90);

    // ④ 对帐单按客户+月份汇总送货单 → 明细生成；导出 docx 有效
    const prefill = await http().get(`/statements/from-customer-month?customerId=${customerId}&month=2026-11`).expect(200);
    expect(prefill.body.items).toHaveLength(1);
    expect(prefill.body.items[0].deliveryNo).toBe(dn.body.deliveryNo);
    expect(prefill.body.items[0].quantity).toBe(30);
    const st = await http().post('/statements').send({
      customerId: prefill.body.customerId,
      statementDate: '2026-11-21',
      items: prefill.body.items,
    }).expect(201);
    const docx = await http().get(`/statements/${st.body.id}/docx`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(docx.body.slice(0, 2).toString()).toBe('PK');

    // ⑤ 超量送货单 → 负库存 -110，触发补货提醒
    const dnBig = await http().post('/delivery-notes').send({
      customerId, deliveryDate: '2026-11-21',
      items: [{ productId, productName: '纸管 φ13', unit: '个', quantity: 200, unitPrice: 0.17 }],
    }).expect(201);
    const bigConfirm = await http().post(`/delivery-notes/${dnBig.body.id}/confirm`).expect(201);
    expect(bigConfirm.body.lowStock).toHaveLength(1);
    expect(bigConfirm.body.lowStock[0].remaining).toBe(-110);
    expect(await stockOf()).toBe(-110);

    // ⑥ 打回超量送货单 → 还库回 90
    await http().post(`/delivery-notes/${dnBig.body.id}/reject`).expect(201);
    expect(await stockOf()).toBe(90);

    // ⑦ 打回订购单 → 减回 20 → 70
    await http().post(`/purchase-orders/${po.body.id}/reject`).expect(201);
    expect(await stockOf()).toBe(70);

    // 核对流水原因齐全，且报价未产生任何扣减流水
    const ledger = await http().get(`/inventory/ledger?productId=${productId}`).expect(200);
    const reasons = new Set<string>(ledger.body.map((l: { reason: string }) => l.reason));
    expect(reasons.has('INITIAL')).toBe(true);
    expect(reasons.has('PO_RECEIVE')).toBe(true);
    expect(reasons.has('PO_REVERSE')).toBe(true);
    expect(reasons.has('DELIVERY_CONSUME')).toBe(true);
    expect(reasons.has('DELIVERY_REVERSE')).toBe(true);
    expect(reasons.has('QUOTATION_CONSUME')).toBe(false);
  });
});
