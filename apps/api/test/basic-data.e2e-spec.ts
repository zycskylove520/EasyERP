import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

describe('批次1 基础数据 (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    closeDatabase();
  });

  it('品类：测试固件含纸管及规格模板（生产库无种子）', async () => {
    const res = await request(app.getHttpServer()).get('/categories').expect(200);
    const tube = res.body.find((c: { name: string }) => c.name === '纸管');
    expect(tube).toBeDefined();
    expect(tube.module).toBe('paper');
    expect(tube.specSchema.map((f: { key: string }) => f.key)).toContain('innerDiameter');
  });

  it('货品 CRUD：创建、按品类查、更新、删除', async () => {
    const categories = await request(app.getHttpServer()).get('/categories');
    const tubeId = categories.body.find((c: { name: string }) => c.name === '纸管').id;

    const created = await request(app.getHttpServer())
      .post('/products')
      .send({ categoryId: tubeId, name: '测试纸管-A', specs: { phi: 13, length: 22 }, unit: '个' })
      .expect(201);
    expect(created.body.specs).toEqual({ phi: 13, length: 22 });
    const id = created.body.id;

    const listed = await request(app.getHttpServer())
      .get(`/products?categoryId=${tubeId}`)
      .expect(200);
    expect(listed.body.some((p: { id: number }) => p.id === id)).toBe(true);

    await request(app.getHttpServer())
      .patch(`/products/${id}`)
      .send({ categoryId: tubeId, name: '测试纸管-B', specs: { phi: 18 }, unit: '个' })
      .expect(200);

    await request(app.getHttpServer()).delete(`/products/${id}`).expect(200);
  });

  it('供货商：经营品种自由文本，能读回', async () => {
    const created = await request(app.getHttpServer())
      .post('/suppliers')
      .send({ name: '测试供货商', contact: '张三', businessTypes: '纸箱、纸管、包装材料' })
      .expect(201);
    expect(created.body.businessTypes).toBe('纸箱、纸管、包装材料');
    await request(app.getHttpServer()).delete(`/suppliers/${created.body.id}`).expect(200);
  });

  it('客户 CRUD', async () => {
    const created = await request(app.getHttpServer())
      .post('/customers')
      .send({ name: '测试客户', contact: '李四', phone: '123' })
      .expect(201);
    const id = created.body.id;
    await request(app.getHttpServer()).get(`/customers/${id}`).expect(200);
    await request(app.getHttpServer())
      .patch(`/customers/${id}`)
      .send({ name: '测试客户2' })
      .expect(200);
    await request(app.getHttpServer()).delete(`/customers/${id}`).expect(200);
  });
});
