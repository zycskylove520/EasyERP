/** 供货/销售分域 (e2e)：同名共存、货品继承品类域、单据下拉按域过滤。 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase, getDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

describe('供货/销售分域 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const catIds: number[] = [];
  const prodIds: number[] = [];

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const mod: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    const db = getDatabase();
    prodIds.forEach((id) => db.prepare('DELETE FROM products WHERE id = ?').run(id));
    catIds.forEach((id) => db.prepare('DELETE FROM product_categories WHERE id = ?').run(id));
    await app.close();
    closeDatabase();
  });

  it('同名品类可在供货/销售各存在一份，且按 bizType 过滤', async () => {
    const supply = await http().post('/categories').send({ name: '__分域纸管__', module: '纸', bizType: 'SUPPLY' }).expect(201);
    const sale = await http().post('/categories').send({ name: '__分域纸管__', module: '纸', bizType: 'SALE' }).expect(201);
    catIds.push(supply.body.id, sale.body.id);
    expect(supply.body.bizType).toBe('SUPPLY');
    expect(sale.body.bizType).toBe('SALE');
    expect(supply.body.id).not.toBe(sale.body.id);

    const s = await http().get('/categories?bizType=SUPPLY').expect(200);
    const a = await http().get('/categories?bizType=SALE').expect(200);
    expect(s.body.some((c: { id: number }) => c.id === supply.body.id)).toBe(true);
    expect(s.body.some((c: { id: number }) => c.id === sale.body.id)).toBe(false);
    expect(a.body.some((c: { id: number }) => c.id === sale.body.id)).toBe(true);
    expect(a.body.some((c: { id: number }) => c.id === supply.body.id)).toBe(false);
  });

  it('货品继承所属品类的 bizType，按域过滤生效', async () => {
    const supplyCat = catIds[0], saleCat = catIds[1];
    const sp = await http().post('/products').send({ categoryId: supplyCat, name: '供货纸管', unit: '个' }).expect(201);
    const sa = await http().post('/products').send({ categoryId: saleCat, name: '销售纸管', unit: '个' }).expect(201);
    prodIds.push(sp.body.id, sa.body.id);
    expect(sp.body.bizType).toBe('SUPPLY');
    expect(sa.body.bizType).toBe('SALE');

    const s = await http().get('/products?bizType=SUPPLY').expect(200);
    const a = await http().get('/products?bizType=SALE').expect(200);
    expect(s.body.some((p: { id: number }) => p.id === sp.body.id)).toBe(true);
    expect(s.body.some((p: { id: number }) => p.id === sa.body.id)).toBe(false);
    expect(a.body.some((p: { id: number }) => p.id === sa.body.id)).toBe(true);
    expect(a.body.some((p: { id: number }) => p.id === sp.body.id)).toBe(false);
  });

  it('同名货品在两个域可各存在一份（品类不同）', async () => {
    const sp = await http().post('/products').send({ categoryId: catIds[0], name: '同名货品', unit: '个' }).expect(201);
    const sa = await http().post('/products').send({ categoryId: catIds[1], name: '同名货品', unit: '个' }).expect(201);
    prodIds.push(sp.body.id, sa.body.id);
    expect(sp.body.id).not.toBe(sa.body.id);
  });
});
