import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase, getDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

/** 财务管理 (e2e)：只有已确认单据计入账，打回自动失效。 */
describe('财务管理 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  let customerId: number;
  let statementId: number;
  let orderId: number;
  const recordIds: number[] = [];

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();

    customerId = (await http().post('/customers').send({ name: '__财务测试客户__' }).expect(201)).body.id;
    // 已确认对帐单，金额 1000
    const st = await http().post('/statements').send({
      customerId, statementDate: '2026-11-01',
      items: [{ productName: '测试品', unit: '个', quantity: 10, unitPrice: 100 }],
    }).expect(201);
    statementId = st.body.id;
    await http().post(`/statements/${statementId}/confirm`).expect(201);
    // 已确认订购单，金额 500
    const po = await http().post('/purchase-orders').send({
      orderDate: '2026-11-01',
      items: [{ productName: '采购品', unit: '个', quantity: 5, unitPrice: 100 }],
    }).expect(201);
    orderId = po.body.id;
    await http().post(`/purchase-orders/${orderId}/confirm`).expect(201);
  });

  afterAll(async () => {
    const db = getDatabase();
    recordIds.forEach((id) => db.prepare('DELETE FROM finance_records WHERE id = ?').run(id));
    db.prepare('DELETE FROM statement_items WHERE statement_id = ?').run(statementId);
    db.prepare('DELETE FROM statements WHERE id = ?').run(statementId);
    db.prepare('DELETE FROM purchase_order_items WHERE purchase_order_id = ?').run(orderId);
    db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(orderId);
    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
    await app.close();
    closeDatabase();
  });

  it('已确认单据计入应收应付；草稿不计入', async () => {
    const recv = await http().get('/finance/receivables').expect(200);
    const mine = recv.body.find((r: { refId: number }) => r.refId === statementId);
    expect(mine).toBeDefined();
    expect(mine.amount).toBe(1000);
    expect(mine.balance).toBe(1000);

    const pay = await http().get('/finance/payables').expect(200);
    const po = pay.body.find((r: { refId: number }) => r.refId === orderId);
    expect(po).toBeDefined();
    expect(po.amount).toBe(500);

    // 建一张草稿对帐单，不应出现在应收
    const draft = await http().post('/statements').send({
      customerId, statementDate: '2026-11-02',
      items: [{ productName: '草稿品', unitPrice: 999, quantity: 1 }],
    }).expect(201);
    const recv2 = await http().get('/finance/receivables').expect(200);
    expect(recv2.body.some((r: { refId: number }) => r.refId === draft.body.id)).toBe(false);
    getDatabase().prepare('DELETE FROM statements WHERE id = ?').run(draft.body.id);
  });

  it('登记收款后应收减少，删除后恢复', async () => {
    const created = await http().post('/finance/records').send({
      type: 'RECEIVE', refType: 'STATEMENT', refId: statementId,
      amount: 400, recordDate: '2026-11-10', method: '转账', remark: '首款',
    }).expect(201);
    recordIds.push(created.body.id);

    let recv = await http().get('/finance/receivables').expect(200);
    let mine = recv.body.find((r: { refId: number }) => r.refId === statementId);
    expect(mine.received).toBe(400);
    expect(mine.balance).toBe(600);

    await http().delete(`/finance/records/${created.body.id}`).expect(200);
    recordIds.splice(recordIds.indexOf(created.body.id), 1);
    recv = await http().get('/finance/receivables').expect(200);
    mine = recv.body.find((r: { refId: number }) => r.refId === statementId);
    expect(mine.balance).toBe(1000);
  });

  it('超过未结金额的收款被拒绝；非已确认单据被拒绝', async () => {
    await http().post('/finance/records').send({
      type: 'RECEIVE', refType: 'STATEMENT', refId: statementId,
      amount: 9999, recordDate: '2026-11-10',
    }).expect(400);

    const draft = await http().post('/statements').send({
      customerId, statementDate: '2026-11-03',
      items: [{ productName: '草稿', unitPrice: 1, quantity: 1 }],
    }).expect(201);
    await http().post('/finance/records').send({
      type: 'RECEIVE', refType: 'STATEMENT', refId: draft.body.id,
      amount: 1, recordDate: '2026-11-10',
    }).expect(400);
    getDatabase().prepare('DELETE FROM statements WHERE id = ?').run(draft.body.id);
  });

  it('打回对帐单后其收款不计入财务；重新确认后恢复', async () => {
    const created = await http().post('/finance/records').send({
      type: 'RECEIVE', refType: 'STATEMENT', refId: statementId,
      amount: 300, recordDate: '2026-11-11',
    }).expect(201);
    recordIds.push(created.body.id);

    // 确认状态：应收已收 300
    let recv = await http().get('/finance/receivables').expect(200);
    expect(recv.body.find((r: { refId: number }) => r.refId === statementId).received).toBe(300);

    // 打回
    await http().post(`/statements/${statementId}/reject`).expect(201);
    recv = await http().get('/finance/receivables').expect(200);
    expect(recv.body.some((r: { refId: number }) => r.refId === statementId)).toBe(false);

    // 打回已同步删除关联收款记录（不再恢复）
    const recs = await http().get('/finance/records').expect(200);
    expect(recs.body.some((r: { refId: number; type: string }) => r.refId === statementId && r.type === 'RECEIVE')).toBe(false);
    // 重新确认后应收恢复，但收款记录已清空
    getDatabase().prepare("UPDATE statements SET status='CONFIRMED' WHERE id=?").run(statementId);
    recv = await http().get('/finance/receivables').expect(200);
    const restored = recv.body.find((r: { refId: number }) => r.refId === statementId);
    expect(restored.received).toBe(0);
    expect(restored.balance).toBe(1000);
  });

  it('summary 汇总结构正确', async () => {
    const res = await http().get('/finance/summary').expect(200);
    expect(typeof res.body.receivableTotal).toBe('number');
    expect(typeof res.body.payableTotal).toBe('number');
    expect(res.body.trend).toHaveLength(12);
    expect(res.body.trend[0]).toHaveProperty('received');
    expect(res.body.trend[0]).toHaveProperty('paid');
  });
});
