<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { quotationsApi, customersApi, productsApi, categoriesApi, companyInfoApi, ApiError } from '../api';
import type { Customer, Product, Category, SpecField, QuotationItemInput } from '../types';
import { formatSpecSummary } from '../spec-summary';
import { checkNumeric, checkRequired, firstError } from '../validation';

const router = useRouter();
const route = useRoute();
const editingId = route.params.id ? Number(route.params.id) : null;

const customers = ref<Customer[]>([]);
const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const error = ref('');
const saving = ref(false);

const header = ref({
  customerId: undefined as number | undefined,
  quoteDate: new Date().toISOString().slice(0, 10),
  currency: 'RMB',
  sender: '', attn: '', fax: '', validUntil: '',
  paymentTerms: '', shippingTerms: '', remarks: '',
});

function newItem(): QuotationItemInput {
  return { productId: null, productName: '', specs: {}, specLabels: {}, unit: '个', unitPrice: 0, quantity: 0, deliveryDate: '', remark: '' };
}
const items = ref<QuotationItemInput[]>([newItem()]);

/** 某明细行关联货品所属品类的规格字段（去掉预留） */
function fieldsFor(item: QuotationItemInput): SpecField[] {
  const p = products.value.find(p => p.id === item.productId);
  if (!p) return [];
  const cat = categories.value.find(c => c.id === p.categoryId);
  return cat?.specSchema.filter(f => !f.reserved) ?? [];
}

/** 当前展开规格编辑的行索引（null=都收起）。每行只按自己货品品类的字段填写。 */
const expandedSpecRow = ref<number | null>(null);

/** 规格摘要（中文名+数值+单位），用于明细表单列展示。 */
function specText(item: QuotationItemInput): string {
  const p = products.value.find(p => p.id === item.productId);
  return formatSpecSummary(item.specs, item.specLabels, categories.value, p?.categoryId);
}

onMounted(async () => {
  try {
    const [cust, prod, cats, company] = await Promise.all([
      customersApi.list(), productsApi.list(undefined, 'SALE'), categoriesApi.list({ bizType: 'SALE' }), companyInfoApi.get(),
    ]);
    customers.value = cust; products.value = prod; categories.value = cats;
    // 新建时 FROM 默认取公司信息的制单人；编辑时不覆盖已存值
    if (!editingId && company.maker) header.value.sender = company.maker;
    if (editingId) {
      const q = await quotationsApi.get(editingId);
      header.value = {
        customerId: q.customerId ?? undefined, quoteDate: q.quoteDate, currency: q.currency,
        sender: q.sender ?? '', attn: q.attn ?? '', fax: q.fax ?? '', validUntil: q.validUntil ?? '',
        paymentTerms: q.paymentTerms ?? '', shippingTerms: q.shippingTerms ?? '', remarks: q.remarks ?? '',
      };
      items.value = q.items.map(i => ({
        productId: i.productId, productName: i.productName,
        specs: { ...(i.specs ?? {}) },
        specLabels: { ...(i.specLabels ?? {}) },
        unit: i.unit ?? '', unitPrice: i.unitPrice, quantity: i.quantity,
        deliveryDate: i.deliveryDate ?? '', remark: i.remark ?? '',
      }));
    }
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
});

/** 选客户后：ATTN 默认填客户名称（仍可手动修改）。 */
function onCustomerChange() {
  const c = customers.value.find((c) => c.id === header.value.customerId);
  if (c) header.value.attn = c.name;
}

/** 选货品：带出品名、规格值、单位，并把字段名 label 存为快照 */
function onProductChange(item: QuotationItemInput) {
  const p = products.value.find(p => p.id === item.productId);
  if (p) {
    item.productName = p.name;
    item.specs = { ...(p.specs ?? {}) };
    item.unit = p.unit;
    const labels: Record<string, string> = {};
    for (const f of fieldsFor(item)) labels[f.key] = f.label;
    // 货品 specs 里若有 schema 之外的遗留字段，也记下 key 本身
    for (const key of Object.keys(item.specs)) if (!labels[key]) labels[key] = key;
    item.specLabels = labels;
  }
}
function setSpec(item: QuotationItemInput, key: string, value: unknown) {
  item.specs = { ...(item.specs ?? {}), [key]: value };
  // 记录该字段当前 label 快照（从品类 schema 找）
  if (!item.specLabels?.[key]) {
    const field = fieldsFor(item).find(f => f.key === key);
    item.specLabels = { ...(item.specLabels ?? {}), [key]: field?.label ?? key };
  }
}
function addItem() { items.value.push(newItem()); }
function removeItem(index: number) { items.value.splice(index, 1); }

async function save() {
  error.value = '';
  // 提交校验：客户必填 + 每条明细的品名/数量/单价
  const errs: Array<string | null> = [checkRequired(header.value.customerId, '客户')];
  items.value.forEach((it, i) => {
    errs.push(checkRequired(it.productName, `第 ${i + 1} 行品名`));
    errs.push(checkNumeric(it.quantity, `第 ${i + 1} 行数量`, { required: true, min: 0 }));
    errs.push(checkNumeric(it.unitPrice, `第 ${i + 1} 行单价`, { required: true, min: 0 }));
  });
  const err = firstError(...errs);
  if (err) { error.value = err; return; }
  saving.value = true;
  try {
    const input = { ...header.value, items: items.value };
    if (editingId) await quotationsApi.update(editingId, input);
    else await quotationsApi.create(input);
    router.push('/quotations');
  } catch (e) { error.value = e instanceof ApiError ? e.message : '保存失败'; }
  finally { saving.value = false; }
}

function rowAmount(item: QuotationItemInput): number {
  return (item.unitPrice ?? 0) * (item.quantity ?? 0);
}
const total = () => items.value.reduce((s, i) => s + rowAmount(i), 0).toFixed(2);
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ editingId ? '编辑报价单' : '新建报价单' }}</h1>
      <button class="btn" @click="router.push('/quotations')">返回</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <h3>表头信息</h3>
      <div class="row">
        <div class="field"><label>客户（TO）</label>
          <select v-model.number="header.customerId" @change="onCustomerChange">
            <option :value="undefined">请选择</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="field"><label>日期</label><input type="date" v-model="header.quoteDate" /></div>
        <div class="field"><label>币制</label><input v-model="header.currency" /></div>
      </div>
      <div class="row">
        <div class="field"><label>ATTN（收件人）</label><input v-model="header.attn" /></div>
        <div class="field"><label>FROM（发货方）</label><input v-model="header.sender" /></div>
        <div class="field"><label>FAX</label><input v-model="header.fax" /></div>
      </div>
      <div class="row">
        <div class="field"><label>有效期至</label><input type="date" v-model="header.validUntil" /></div>
        <div class="field"><label>结算及付款方式</label><input v-model="header.paymentTerms" /></div>
        <div class="field"><label>运输方式</label><input v-model="header.shippingTerms" /></div>
      </div>
      <div class="field">
        <label>备注 / 报价条款（由你自行填写，会显示在打印单据上）</label>
        <textarea v-model="header.remarks" placeholder="如：报价有效期、结算约定、回签要求等，留空则单据不显示备注" />
      </div>
    </div>

    <div class="card">
      <div class="page-header" style="margin-bottom:12px">
        <h3 style="margin:0">明细行</h3>
        <button class="btn btn-sm" @click="addItem">+ 添加一行</button>
      </div>
      <p class="muted" style="font-size:12px; margin:0 0 10px">
        每行按自己货品所属品类填规格：点「规格」展开该品类的字段，一张单可混装不同品类。
      </p>
      <div style="overflow-x:auto">
        <table class="data">
          <thead><tr>
            <th style="width:32px">序</th>
            <th style="min-width:120px">关联货品</th>
            <th style="min-width:100px">品名</th>
            <th style="min-width:160px">规格</th>
            <th>单位</th><th>单价</th><th>数量</th><th>金额</th><th>交货日期</th><th>备注</th><th></th>
          </tr></thead>
          <tbody>
            <template v-for="(item, i) in items" :key="i">
              <tr>
                <td>{{ i + 1 }}</td>
                <td>
                  <select :value="item.productId ?? ''" @change="item.productId = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null; onProductChange(item)" style="min-width:110px">
                    <option value="">不关联</option>
                    <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}（{{ p.categoryName }}）</option>
                  </select>
                </td>
                <td><input v-model="item.productName" /></td>
                <td>
                  <button class="btn btn-sm" @click="expandedSpecRow = expandedSpecRow === i ? null : i">
                    {{ specText(item) || '填规格' }} ▾
                  </button>
                </td>
                <td><input v-model="item.unit" style="min-width:48px" /></td>
                <td><input type="number" v-numeric v-model.number="item.unitPrice" style="min-width:65px" /></td>
                <td><input type="number" v-numeric v-model.number="item.quantity" style="min-width:65px" /></td>
                <td>{{ rowAmount(item).toFixed(2) }}</td>
                <td><input type="date" v-model="item.deliveryDate" /></td>
                <td><input v-model="item.remark" /></td>
                <td><button class="btn btn-sm btn-danger" @click="removeItem(i)">删</button></td>
              </tr>
              <tr v-if="expandedSpecRow === i">
                <td colspan="11" style="background:#f9fafb; padding:12px">
                  <div v-if="fieldsFor(item).length" style="display:flex; flex-wrap:wrap; gap:12px">
                    <div v-for="f in fieldsFor(item)" :key="f.key" style="min-width:130px">
                      <label style="display:block; font-size:12px; color:#6b7280; margin-bottom:4px">{{ f.label }}<template v-if="f.unit">({{ f.unit }})</template></label>
                      <input
                        v-numeric
                        :type="f.type === 'number' ? 'number' : 'text'"
                        :value="item.specs?.[f.key] ?? ''"
                        @input="setSpec(item, f.key, f.type === 'number' ? Number(($event.target as HTMLInputElement).value) : ($event.target as HTMLInputElement).value)"
                      />
                    </div>
                  </div>
                  <div v-else class="muted" style="font-size:12px">该货品品类暂无规格字段，请先选关联货品。</div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div style="text-align:right; margin-top:12px; font-size:16px">合计：<strong>{{ total() }}</strong></div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存草稿' }}</button>
      <p class="muted" style="font-size:12px; margin:0; align-self:center">保存后为草稿状态。报价单不涉及库存，实际出货请在送货单中确认扣库。</p>
    </div>
  </div>
</template>
