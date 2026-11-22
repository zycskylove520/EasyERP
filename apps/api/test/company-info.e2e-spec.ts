import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as zlib from 'node:zlib';
import { AppModule } from '../src/app.module';
import { initializeDatabase } from '../src/database/init';
import { closeDatabase } from '../src/database/connection';
import { seedTestData } from './test-seed';

/** 从 docx(zip) 中提取 word/document.xml 的文本（zip 项多为 deflateRaw）。 */
function docxText(buf: Buffer): string {
  let offset = 0;
  while (offset + 30 <= buf.length) {
    if (buf.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const name = buf.slice(offset + 30, offset + 30 + nameLen).toString('utf8');
    const dataStart = offset + 30 + nameLen + extraLen;
    if (name === 'word/document.xml') {
      const raw = buf.slice(dataStart, dataStart + compSize);
      return (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8');
    }
    offset = dataStart + compSize;
  }
  return '';
}

describe('公司基础信息 (e2e)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const original = {
    name: '', address: '', phone: '', fax: '', mobile: '', maker: '', businessScope: '', currency: 'RMB',
  };

  beforeAll(async () => {
    initializeDatabase();
    seedTestData();
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    const res = await http().get('/company-info').expect(200);
    Object.assign(original, res.body);
  });

  afterAll(async () => {
    // 恢复原值，避免污染其它测试
    await http().patch('/company-info').send(original).expect(200);
    await app.close();
    closeDatabase();
  });

  it('返回单条档案，含默认种子信息', async () => {
    const res = await http().get('/company-info').expect(200);
    expect(res.body.id).toBe(1);
    expect(typeof res.body.name).toBe('string');
  });

  it('更新公司信息后，报价单 docx 抬头反映新名称', async () => {
    await http().patch('/company-info').send({
      ...original,
      name: '__测试公司抬头__',
      businessScope: '__测试经营范围__',
    }).expect(200);

    // 建一张报价单并导出
    const quote = await http().post('/quotations').send({
      quoteDate: '2026-11-21',
      items: [{ productName: '测试品', unitPrice: 1, quantity: 1 }],
    }).expect(201);
    const docx = await http().get(`/quotations/${quote.body.id}/docx`).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    // 解压 docx 内的 document.xml 验证抬头确实反映新名称
    const text = docxText(docx.body);
    expect(text).toContain('__测试公司抬头__');

    // 清理报价单
    const db = (await import('../src/database/connection')).getDatabase();
    db.prepare('DELETE FROM quotation_items WHERE quotation_id = ?').run(quote.body.id);
    db.prepare('DELETE FROM quotations WHERE id = ?').run(quote.body.id);
  });
});
