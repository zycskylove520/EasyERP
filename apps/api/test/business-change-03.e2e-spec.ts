import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase, getDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

/** 业务变更03 四条整改的端到端验证。 */
describe('业务变更03 打印预览/动态规格/单号前缀/去料号 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  let productId: number;
  let customerId: number;
  let supplierId: number;
  let categoryId: number;
  const noteIds: number[] = [];
  const orderIds: number[] = [];
  const statementIds: number[] = [];
  let originalCompany: Record<string, unknown>;

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    const cats = await http().get('/categories').expect(200);
    categoryId = cats.body.find((c: { name: string }) => c.name === '纸管').id;
    productId = (await http().post('/products').send({
      categoryId, name: '__变更03测试货品__', unit: '个', specs: { phi: 13, thickness: 22 },
    }).expect(201)).body.id;
    customerId = (await http().post('/customers').send({ name: '__变更03测试客户__' }).expect(201)).body.id;
    supplierId = (await http().post('/suppliers').send({ name: '__变更03测试供货商__' }).expect(201)).body.id;
    originalCompany = { ...(await http().get('/company-info').expect(200)).body };
  });

  afterAll(async () => {
    const db = getDatabase();
    for (const id of noteIds) {
      db.prepare('UPDATE delivery_note_items SET inventory_ledger_id = NULL, reversal_ledger_id = NULL WHERE delivery_note_id = ?').run(id);
      db.prepare('DELETE FROM delivery_note_items WHERE delivery_note_id = ?').run(id);
      db.prepare('DELETE FROM delivery_notes WHERE id = ?').run(id);
    }
    for (const id of orderIds) {
      db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(id);
      db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(id);
    }
    for (const id of statementIds) {
      db.prepare('DELETE FROM statement_items WHERE statement_id = ?').run(id);
      db.prepare('DELETE FROM statements WHERE id = ?').run(id);
    }
    db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(productId);
    db.prepare('DELETE FROM products WHERE id = ?').run(productId);
    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(supplierId);
    await http().patch('/company-info').send(originalCompany).expect(200);
    await app.close();
    closeDatabase();
  });

  /** R4：送货明细无料号；R2：规格按品类动态拆列。 */
  it('送货单：无料号字段，规格按品类 spec_schema 动态展开', async () => {
    const schema = (await http().get(`/categories/${categoryId}`).expect(200)).body.specSchema;
    const labels: Record<string, string> = {};
    for (const f of schema) labels[f.key] = f.label;

    const created = await http().post('/delivery-notes').send({
      customerId,
      deliveryDate: '2026-11-21',
      items: [{
        productId, productName: '纸管', specs: { phi: 13, thickness: 22 },
        specLabels: { phi: labels.phi, thickness: labels.thickness },
        unit: '个', quantity: 2, unitPrice: 1.5,
      }],
    }).expect(201);
    noteIds.push(created.body.id);

    expect(created.body.items[0].partNo).toBeUndefined();
    expect(created.body.items[0].specs).toEqual({ phi: 13, thickness: 22 });

    const print = await http().get(`/delivery-notes/${created.body.id}/print`).expect(200);
    // 规格改为单行摘要，每行按自己品类显示「中文名+值+单位」
    expect(print.body.columns).toContain('规格');
    expect(print.body.items[0].specText).toContain(labels.phi);
    expect(print.body.items[0].specText).toContain('厚度');
    expect(print.body.columns.some((c: string) => c.includes('料号'))).toBe(false);
  });

  /** R3：公司信息配置前缀后，送货单号以该前缀开头。 */
  it('公司信息设置 deliveryNoPrefix=YLD 后，新送货单号以 YLD 开头', async () => {
    await http().patch('/company-info').send({ ...originalCompany, deliveryNoPrefix: 'YLD' }).expect(200);
    const created = await http().post('/delivery-notes').send({
      customerId, deliveryDate: '2026-11-21',
      items: [{ productId, productName: '纸管', unit: '个', quantity: 1, unitPrice: 1 }],
    }).expect(201);
    noteIds.push(created.body.id);
    expect(created.body.deliveryNo).toMatch(/^YLD-\d{8}-\d{4}$/);

    // 前缀留空后回退 DN
    await http().patch('/company-info').send({ ...originalCompany, deliveryNoPrefix: '' }).expect(200);
    const created2 = await http().post('/delivery-notes').send({
      customerId, deliveryDate: '2026-11-21',
      items: [{ productName: '无前缀单', unit: '个', quantity: 1, unitPrice: 1 }],
    }).expect(201);
    noteIds.push(created2.body.id);
    expect(created2.body.deliveryNo).toMatch(/^DN-\d{8}-\d{4}$/);
  });

  /** R1：三单据均有 print 端点，结构与 docx 同源；docx 仍为有效 Word。 */
  it('三单据 print 端点返回预览数据，docx 与预览同源', async () => {
    const note = await http().post('/delivery-notes').send({
      customerId, deliveryDate: '2026-11-21',
      items: [{ productId, productName: '纸管', unit: '个', quantity: 3, unitPrice: 2, specs: { phi: 13 }, specLabels: { phi: 'φ数' } }],
    }).expect(201);
    noteIds.push(note.body.id);
    const dnPrint = await http().get(`/delivery-notes/${note.body.id}/print`).expect(200);
    expect(dnPrint.body.deliveryNo).toBe(note.body.deliveryNo);
    expect(dnPrint.body.total).toBe('6.00');

    const order = await http().post('/purchase-orders').send({
      supplierId, orderDate: '2026-11-21', deliveryDate: '2026-11-25',
      items: [{ productId, productName: '纸管', specs: { phi: 13 }, specLabels: { phi: 'φ数' }, unit: '个', quantity: 5, remark: '' }],
    }).expect(201);
    orderIds.push(order.body.id);
    const poPrint = await http().get(`/purchase-orders/${order.body.id}/print`).expect(200);
    expect(poPrint.body.orderNo).toBe(order.body.orderNo);
    expect(poPrint.body.columns).toContain('规格');
    expect(poPrint.body.items[0].specText).toContain('φ数');

    const statement = await http().post('/statements').send({
      customerId, statementDate: '2026-11-21',
      items: [{ itemDate: '2026-11-21', deliveryNo: note.body.deliveryNo, productName: '纸管', spec: '直径=13', unit: '个', quantity: 3, unitPrice: 2 }],
    }).expect(201);
    statementIds.push(statement.body.id);
    const stPrint = await http().get(`/statements/${statement.body.id}/print`).expect(200);
    expect(stPrint.body.statementNo).toBe(statement.body.statementNo);

    // 每个端点 docx 均为有效 zip/docx（PK 头）
    for (const path of [
      `/delivery-notes/${note.body.id}/docx`,
      `/purchase-orders/${order.body.id}/docx`,
      `/statements/${statement.body.id}/docx`,
    ]) {
      const res = await http().get(path).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      expect(res.headers['content-type']).toContain('wordprocessingml');
      expect(res.body.slice(0, 2).toString()).toBe('PK');
    }
  });
});
