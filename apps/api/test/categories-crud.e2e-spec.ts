import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

describe('业务变更01 品类自定义 (e2e)', () => {
  let app: INestApplication;
  const createdIds: number[] = [];

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

  it('新增品类：自定义模块 + 自定义规格字段', async () => {
    // 先取当前最大序号（POST 之前，避免把新建的算进去）
    const before = await request(app.getHttpServer()).get('/categories').expect(200);
    const maxOrder = Math.max(-1, ...before.body.map((c: { sortOrder: number }) => c.sortOrder));
    const res = await request(app.getHttpServer())
      .post('/categories')
      .send({
        name: '金属支架',
        module: '金属制品',
        sortOrder: 99,
        specSchema: [
          { key: 'height', label: '高度', type: 'number', unit: 'MM' },
          { key: 'color', label: '颜色', type: 'text' },
        ],
      })
      .expect(201);
    createdIds.push(res.body.id);
    expect(res.body.module).toBe('金属制品');
    // 序号自动分配：新增前的最大序号 +1，忽略前端传入的 99（生产库无种子，数量不固定）
    expect(res.body.sortOrder).toBe(maxOrder + 1);
    expect(res.body.specSchema.map((f: { key: string }) => f.key)).toEqual(['height', 'color']);
  });

  it('重名品类被拒绝（409）', async () => {
    await request(app.getHttpServer())
      .post('/categories')
      .send({ name: '金属支架', module: '金属制品' })
      .expect(409);
  });

  it('模块/名称为空被拒绝（409）', async () => {
    await request(app.getHttpServer())
      .post('/categories')
      .send({ name: '', module: 'x' })
      .expect(409);
    await request(app.getHttpServer())
      .post('/categories')
      .send({ name: 'x', module: '' })
      .expect(409);
  });

  it('编辑品类：改模块、增规格字段', async () => {
    const id = createdIds[0];
    const res = await request(app.getHttpServer())
      .patch(`/categories/${id}`)
      .send({
        name: '金属支架',
        module: '五金',
        sortOrder: 5,
        specSchema: [
          { key: 'height', label: '高度', type: 'number', unit: 'MM' },
          { key: 'color', label: '颜色', type: 'text' },
          { key: 'width', label: '宽度', type: 'number', unit: 'MM' },
        ],
      })
      .expect(200);
    expect(res.body.module).toBe('五金');
    expect(res.body.specSchema).toHaveLength(3);
  });

  it('删除未被使用的品类：成功', async () => {
    const created = await request(app.getHttpServer())
      .post('/categories')
      .send({ name: '临时品类', module: '临时模块' })
      .expect(201);
    await request(app.getHttpServer()).delete(`/categories/${created.body.id}`).expect(200);
    await request(app.getHttpServer()).get(`/categories/${created.body.id}`).expect(404);
  });

  it('删除有货品的品类：被拒绝（409）', async () => {
    // 用种子里的「纸管」——其他测试文件独立库，这里库是干净的但种子含纸管，且可能无货品；
    // 先造一个货品归属它，再尝试删品类
    const categories = await request(app.getHttpServer()).get('/categories');
    const tube = categories.body.find((c: { name: string }) => c.name === '纸管');
    await request(app.getHttpServer())
      .post('/products')
      .send({ categoryId: tube.id, name: '测试占用货品', specs: {} })
      .expect(201);
    await request(app.getHttpServer()).delete(`/categories/${tube.id}`).expect(409);
  });

  it('删除品类后，剩余品类序号自动重排连续', async () => {
    // 造 3 个无货品品类，删除中间一个，验证剩余序号连续
    const a = await request(app.getHttpServer()).post('/categories').send({ name: '排序A', module: '测试' }).expect(201);
    const b = await request(app.getHttpServer()).post('/categories').send({ name: '排序B', module: '测试' }).expect(201);
    const c = await request(app.getHttpServer()).post('/categories').send({ name: '排序C', module: '测试' }).expect(201);
    const before = [a.body.sortOrder, b.body.sortOrder, c.body.sortOrder];
    expect(before[1]).toBe(before[0] + 1);
    expect(before[2]).toBe(before[1] + 1);

    await request(app.getHttpServer()).delete(`/categories/${b.body.id}`).expect(200);
    const all = await request(app.getHttpServer()).get('/categories').expect(200);
    const orders = all.body.map((x: { sortOrder: number }) => x.sortOrder).sort((p: number, q: number) => p - q);
    // 全部序号应为 1..N 连续，无断档
    orders.forEach((o: number, i: number) => expect(o).toBe(i + 1));
  });

  it('已有货品使用时，不能删除/改名该规格字段（409）', async () => {
    // 造一个带规格字段的品类 + 货品用了该字段
    const cat = await request(app.getHttpServer())
      .post('/categories')
      .send({
        name: '带规格品类',
        module: '测试',
        specSchema: [{ key: 'size', label: '尺寸', type: 'text' }],
      })
      .expect(201);
    createdIds.push(cat.body.id);
    await request(app.getHttpServer())
      .post('/products')
      .send({ categoryId: cat.body.id, name: '规格货品', specs: { size: '大' } })
      .expect(201);

    // 尝试移除 size 字段 → 应被拒绝
    await request(app.getHttpServer())
      .patch(`/categories/${cat.body.id}`)
      .send({
        name: '带规格品类',
        module: '测试',
        specSchema: [{ key: 'other', label: '其它', type: 'text' }],
      })
      .expect(409);
  });
});
