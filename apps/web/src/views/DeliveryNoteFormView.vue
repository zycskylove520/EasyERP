<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { deliveryNotesApi, quotationsApi, customersApi, productsApi, categoriesApi, ApiError } from '../api';
import type { Customer, Product, Category, Quotation, SpecField, DeliveryNoteItemInput, DeliveryFromQuotation } from '../types';
import { formatSpecSummary } from '../spec-summary';
import { checkNumeric, checkRequired, firstError } from '../validation';

const router = useRouter();
const route = useRoute();
const editingId = route.params.id ? Number(route.params.id) : null;

const customers = ref<Customer[]>([]);
const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const quotations = ref<Quotation[]>([]);
const selectedQuoteId = ref<number | undefined>(undefined);
const error = ref('');
const saving = ref(false);

const header = ref({
  customerId: undefined as number | undefined,
  customerName: '',
  shipAddress: '',
  deliveryDate: new Date().toISOString().slice(0, 10),
  orderNo: '',
  sourceQuotationId: undefined as number | undefined,
  remarks: '',
});

function newItem(): DeliveryNoteItemInput {
  return { productId: null, productName: '', specs: {}, specLabels: {}, unit: '个', quantity: 0, unitPrice: 0, remark: '' };
}
const items = ref<DeliveryNoteItemInput[]>([newItem()]);

/** 某明细行关联货品所属品类的规格字段（去掉预留）。 */
function fieldsFor(item: DeliveryNoteItemInput): SpecField[] {
  const p = products.value.find((p) => p.id === item.productId);
  if (!p) return [];
  const cat = categories.value.find((c) => c.id === p.categoryId);
  return cat?.specSchema.filter((f) => !f.reserved) ?? [];
}

/** 当前展开规格编辑的行索引。 */
const expandedSpecRow = ref<number | null>(null);

/** 规格摘要。 */
function specText(item: DeliveryNoteItemInput): string {
  const p = products.value.find(p => p.id === item.productId);
  return formatSpecSummary(item.specs, item.specLabels, categories.value, p?.categoryId);
}

onMounted(async () => {
  try {
    [customers.value, products.value, categories.value, quotations.value] = await Promise.all([
      customersApi.list(), productsApi.list(undefined, 'SALE'), categoriesApi.list({ bizType: 'SALE' }), quotationsApi.list({ group: 'active' }),
    ]);
    if (editingId) {
      const n = await deliveryNotesApi.get(editingId);
      header.value = {
        customerId: n.customerId ?? undefined, customerName: n.customerName ?? '',
        shipAddress: n.shipAddress ?? '', deliveryDate: n.deliveryDate,
        orderNo: n.orderNo ?? '', sourceQuotationId: n.sourceQuotationId ?? undefined,
        remarks: n.remarks ?? '',
      };
      items.value = n.items.map((i) => ({
        productId: i.productId, productName: i.productName,
        specs: { ...(i.specs ?? {}) }, specLabels: { ...(i.specLabels ?? {}) },
        unit: i.unit ?? '', quantity: i.quantity,
        unitPrice: i.unitPrice, remark: i.remark ?? '',
      }));
      selectedQuoteId.value = n.sourceQuotationId ?? undefined;
    }
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
});

function onCustomerChange() {
  const c = customers.value.find((c) => c.id === header.value.customerId);
  if (c) {
    header.value.customerName = c.name;
    if (!header.value.shipAddress && c.address) header.value.shipAddress = c.address;
  }
}
function onProductChange(item: DeliveryNoteItemInput) {
  const p = products.value.find((p) => p.id === item.productId);
  if (p) {
    item.productName = p.name;
    item.unit = p.unit;
    item.specs = { ...(p.specs ?? {}) };
    const labels: Record<string, string> = {};
    for (const f of fieldsFor(item)) labels[f.key] = f.label;
    for (const key of Object.keys(item.specs)) if (!labels[key]) labels[key] = key;
    item.specLabels = labels;
  }
}
function setSpec(item: DeliveryNoteItemInput, key: string, value: unknown) {
  item.specs = { ...(item.specs ?? {}), [key]: value };
  if (!item.specLabels?.[key]) {
    const field = fieldsFor(item).find((f) => f.key === key);
    item.specLabels = { ...(item.specLabels ?? {}), [key]: field?.label ?? key };
  }
}

/** 从选中的报价单带入表头与明细（带入后仍可自由修改）。 */
async function applyQuotation() {
  if (!selectedQuoteId.value) return;
  error.value = '';
  try {
    const data: DeliveryFromQuotation = await deliveryNotesApi.fromQuotation(selectedQuoteId.value);
    header.value.customerId = data.customerId ?? undefined;
    header.value.customerName = data.customerName ?? '';
    header.value.orderNo = data.orderNo;
    header.value.sourceQuotationId = data.sourceQuotationId;
    items.value = data.items.length
      ? data.items.map((i) => ({ ...i }))
      : [newItem()];
  } catch (e) { error.value = e instanceof ApiError ? e.message : '带入失败'; }
}

function addItem() { items.value.push(newItem()); }
function removeItem(i: number) { items.value.splice(i, 1); }
const rowAmount = (item: DeliveryNoteItemInput) => (item.quantity ?? 0) * (item.unitPrice ?? 0);
const total = () => items.value.reduce((s, i) => s + rowAmount(i), 0).toFixed(2);

async function save() {
  error.value = '';
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
    if (editingId) await deliveryNotesApi.update(editingId, input);
    else await deliveryNotesApi.create(input);
    router.push('/delivery-notes');
  } catch (e) { error.value = e instanceof ApiError ? e.message : '保存失败'; }
  finally { saving.value = false; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ editingId ? '编辑送货单' : '新建送货单' }}</h1>
      <button class="btn" @click="router.push('/delivery-notes')">返回</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <h3>可选带入</h3>
      <div class="row" style="align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>从报价单带入</label>
          <select v-model.number="selectedQuoteId">
            <option :value="undefined">不带入，手工填写</option>
            <option v-for="q in quotations" :key="q.id" :value="q.id">{{ q.quoteNo }} · {{ q.customerName || '-' }}</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:0; flex:0 0 auto">
          <button class="btn" :disabled="!selectedQuoteId" @click="applyQuotation">带入明细</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>表头信息</h3>
      <div class="row">
        <div class="field"><label>客户</label>
          <select :value="header.customerId ?? ''" @change="header.customerId = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : undefined; onCustomerChange()">
            <option value="">请选择</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="field"><label>客户名称（快照，可改）</label><input v-model="header.customerName" /></div>
        <div class="field"><label>出货日期</label><input type="date" v-model="header.deliveryDate" /></div>
      </div>
      <div class="row">
        <div class="field"><label>收货地址</label><input v-model="header.shipAddress" /></div>
        <div class="field"><label>订单号码</label><input v-model="header.orderNo" /></div>
      </div>
    </div>

    <div class="card">
      <div class="field" style="margin-bottom:0">
        <label>整单备注（打印/导出时在明细表下方显示，每行一条）</label>
        <textarea v-model="header.remarks" rows="3" placeholder="如：随货附送货单、请签收后回传等，留空则不显示"></textarea>
      </div>
    </div>

    <div class="card">
      <div class="page-header" style="margin-bottom:12px">
        <h3 style="margin:0">明细行</h3>
        <button class="btn btn-sm" @click="addItem">+ 添加一行</button>
      </div>
      <p class="muted" style="font-size:12px; margin:0 0 10px">每行按自己货品所属品类填规格：点「规格」展开该品类字段，一张单可混装不同品类；确认此单会按关联货品扣减库存。</p>
      <div style="overflow-x:auto">
        <table class="data">
          <thead><tr>
            <th style="width:32px">序</th><th>订单号码</th>
            <th style="min-width:110px">关联货品</th><th style="min-width:100px">品名</th>
            <th style="min-width:160px">规格</th>
            <th>单位</th>
            <th>数量</th><th>单价</th><th>金额</th><th>备注</th><th></th>
          </tr></thead>
          <tbody>
            <template v-for="(item, i) in items" :key="i">
              <tr>
                <td>{{ i + 1 }}</td>
                <td><input v-model="header.orderNo" disabled style="min-width:90px" /></td>
                <td>
                  <select :value="item.productId ?? ''" @change="item.productId = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null; onProductChange(item)" style="min-width:110px">
                    <option value="">不关联</option>
                    <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}（{{ p.categoryName }}）</option>
                  </select>
                </td>
                <td><input v-model="item.productName" /></td>
                <td><button class="btn btn-sm" @click="expandedSpecRow = expandedSpecRow === i ? null : i">{{ specText(item) || '填规格' }} ▾</button></td>
                <td><input v-model="item.unit" style="min-width:48px" /></td>
                <td><input type="number" v-numeric v-model.number="item.quantity" style="min-width:60px" /></td>
                <td><input type="number" v-numeric v-model.number="item.unitPrice" style="min-width:65px" /></td>
                <td>{{ rowAmount(item).toFixed(2) }}</td>
                <td><input v-model="item.remark" /></td>
                <td><button class="btn btn-sm btn-danger" @click="removeItem(i)">删</button></td>
              </tr>
              <tr v-if="expandedSpecRow === i">
                <td colspan="11" style="background:#f9fafb; padding:12px">
                  <div v-if="fieldsFor(item).length" style="display:flex; flex-wrap:wrap; gap:12px">
                    <div v-for="f in fieldsFor(item)" :key="f.key" style="min-width:130px">
                      <label style="display:block; font-size:12px; color:#6b7280; margin-bottom:4px">{{ f.label }}<template v-if="f.unit">({{ f.unit }})</template></label>
                      <input v-numeric :type="f.type === 'number' ? 'number' : 'text'" :value="item.specs?.[f.key] ?? ''"
                        @input="setSpec(item, f.key, f.type === 'number' ? Number(($event.target as HTMLInputElement).value) : ($event.target as HTMLInputElement).value)" />
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
      <p class="muted" style="font-size:12px; margin:0; align-self:center">保存后为草稿，在列表点「确认」才会扣减库存。</p>
    </div>
  </div>
</template>
