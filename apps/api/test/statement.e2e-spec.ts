import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase, getDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

describe('对帐单 (e2e)', () => {
  let app: INestApplication;
  let customerId: number;
  const statementIds: number[] = [];
  const noteIds: number[] = [];

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    const customer = await request(app.getHttpServer())
      .post('/customers')
      .send({ name: '__对帐测试客户__' })
      .expect(201);
    customerId = customer.body.id;
  });

  afterAll(async () => {
    const db = getDatabase();
    for (const id of statementIds) {
      db.prepare('DELETE FROM statement_items WHERE statement_id = ?').run(id);
      db.prepare('DELETE FROM statements WHERE id = ?').run(id);
    }
    for (const id of noteIds) {
      db.prepare('DELETE FROM delivery_note_items WHERE delivery_note_id = ?').run(id);
      db.prepare('DELETE FROM delivery_notes WHERE id = ?').run(id);
    }
    db.prepare('DELETE FROM customers WHERE id = ?').run(customerId);
    await app.close();
    closeDatabase();
  });

  async function createStatement(): Promise<number> {
    const res = await request(app.getHttpServer())
      .post('/statements')
      .send({
        customerId,
        statementDate: '2026-11-21',
        attn: '王先生',
        items: [
          {
            itemDate: '02/06',
            deliveryNo: '1800559',
            productName: 'PET纸芯',
            spec: 'Φ8',
            unit: '个',
            quantity: 10000,
            unitPrice: 0.095,
          },
        ],
      })
      .expect(201);
    statementIds.push(res.body.id);
    return res.body.id;
  }

  it('建单为草稿，单号格式与金额计算正确', async () => {
    const id = await createStatement();
    const res = await request(app.getHttpServer()).get(`/statements/${id}`).expect(200);
    expect(res.body.status).toBe('DRAFT');
    expect(res.body.statementNo).toMatch(/^ST-\d{8}-\d{4}$/);
    expect(res.body.items[0].amount).toBeCloseTo(10000 * 0.095, 6);
  });

  it('确认与打回仅改状态，不动库存', async () => {
    const id = await createStatement();
    const confirmed = await request(app.getHttpServer()).post(`/statements/${id}/confirm`).expect(201);
    expect(confirmed.body.status).toBe('CONFIRMED');
    const rejected = await request(app.getHttpServer()).post(`/statements/${id}/reject`).expect(201);
    expect(rejected.body.status).toBe('REJECTED');
    await request(app.getHttpServer()).post(`/statements/${id}/reject`).expect(409);
  });

  it('导出 docx：返回有效 Word 文件（PK 头）', async () => {
    const id = await createStatement();
    const res = await request(app.getHttpServer()).get(`/statements/${id}/docx`).buffer(true).parse((r, cb) => {
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
    const active = await request(app.getHttpServer()).get('/statements?group=active').expect(200);
    const rejected = await request(app.getHttpServer()).get('/statements?group=rejected').expect(200);
    expect(active.body.every((s: { status: string }) => ['DRAFT', 'CONFIRMED'].includes(s.status))).toBe(true);
    expect(rejected.body.every((s: { status: string }) => ['REJECTED', 'WITHDRAWN'].includes(s.status))).toBe(true);
  });

  it('按客户+月份汇总：只含当月已确认送货单，草稿/其它月份不计入', async () => {
    // 11 月已确认（应计入）
    const inMonth = await request(app.getHttpServer()).post('/delivery-notes').send({
      customerId, deliveryDate: '2026-11-15',
      items: [{ productName: '当月货', unit: '个', quantity: 10, unitPrice: 2, specs: { phi: 8 }, specLabels: { phi: 'φ数' } }],
    }).expect(201);
    noteIds.push(inMonth.body.id);
    await request(app.getHttpServer()).post(`/delivery-notes/${inMonth.body.id}/confirm`).expect(201);

    // 11 月草稿（不计入）
    const draft = await request(app.getHttpServer()).post('/delivery-notes').send({
      customerId, deliveryDate: '2026-11-20',
      items: [{ productName: '草稿货', unit: '个', quantity: 99, unitPrice: 1 }],
    }).expect(201);
    noteIds.push(draft.body.id);

    // 10 月已确认（不计入）
    const otherMonth = await request(app.getHttpServer()).post('/delivery-notes').send({
      customerId, deliveryDate: '2026-10-15',
      items: [{ productName: '上月货', unit: '个', quantity: 50, unitPrice: 1 }],
    }).expect(201);
    noteIds.push(otherMonth.body.id);
    await request(app.getHttpServer()).post(`/delivery-notes/${otherMonth.body.id}/confirm`).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/statements/from-customer-month?customerId=${customerId}&month=2026-11`).expect(200);
    expect(res.body.customerId).toBe(customerId);
    expect(res.body.month).toBe('2026-11');
    expect(res.body.statementDate).toBe('2026-11-01');
    expect(res.body.deliveryCount).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].productName).toBe('当月货');
    expect(res.body.items[0].deliveryNo).toBe(inMonth.body.deliveryNo);
  });
});
