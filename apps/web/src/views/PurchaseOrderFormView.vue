<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { purchaseOrdersApi, suppliersApi, productsApi, categoriesApi, companyInfoApi, ApiError } from '../api';
import type { Supplier, Product, Category, SpecField, PurchaseOrderItemInput } from '../types';
import { formatSpecSummary } from '../spec-summary';
import { checkNumeric, checkRequired, firstError } from '../validation';

const router = useRouter();
const route = useRoute();
const editingId = route.params.id ? Number(route.params.id) : null;

const suppliers = ref<Supplier[]>([]);
const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const error = ref('');
const saving = ref(false);

const header = ref({
  supplierId: undefined as number | undefined,
  supplierName: '',
  orderDate: new Date().toISOString().slice(0, 10),
  deliveryDate: '',
  attn: '', fax: '', currency: 'RMB', fm: '',
  terms: '', footnote: '',
});

function newItem(): PurchaseOrderItemInput {
  return { productId: null, productName: '', specs: {}, specLabels: {}, unit: '个', quantity: 0, unitPrice: 0, remark: '' };
}
const items = ref<PurchaseOrderItemInput[]>([newItem()]);

/** 某明细行关联货品所属品类的规格字段（去掉预留；材质是其中一个普通字段） */
function fieldsFor(item: PurchaseOrderItemInput): SpecField[] {
  const p = products.value.find((p) => p.id === item.productId);
  if (!p) return [];
  const cat = categories.value.find((c) => c.id === p.categoryId);
  return cat?.specSchema.filter((f) => !f.reserved) ?? [];
}

/** 当前展开规格编辑的行索引。 */
const expandedSpecRow = ref<number | null>(null);

/** 规格摘要。 */
function specText(item: PurchaseOrderItemInput): string {
  const p = products.value.find(p => p.id === item.productId);
  return formatSpecSummary(item.specs, item.specLabels, categories.value, p?.categoryId);
}

onMounted(async () => {
  try {
    const [sup, prod, cats, company] = await Promise.all([
      suppliersApi.list(), productsApi.list(undefined, 'SUPPLY'), categoriesApi.list({ bizType: 'SUPPLY' }), companyInfoApi.get(),
    ]);
    suppliers.value = sup; products.value = prod; categories.value = cats;
    if (!editingId) {
      if (company.maker) header.value.fm = company.maker;
      if (company.currency) header.value.currency = company.currency;
    }
    if (editingId) {
      const o = await purchaseOrdersApi.get(editingId);
      header.value = {
        supplierId: o.supplierId ?? undefined,
        supplierName: o.supplierName ?? '',
        orderDate: o.orderDate,
        deliveryDate: o.deliveryDate ?? '',
        attn: o.attn ?? '', fax: o.fax ?? '', currency: o.currency, fm: o.fm ?? '',
        terms: o.terms ?? '', footnote: o.footnote ?? '',
      };
      items.value = o.items.map((i) => ({
        productId: i.productId, productName: i.productName,
        specs: { ...(i.specs ?? {}) },
        specLabels: { ...(i.specLabels ?? {}) },
        unit: i.unit ?? '', quantity: i.quantity, unitPrice: i.unitPrice ?? 0, remark: i.remark ?? '',
      }));
    }
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
});

function onSupplierChange() {
  const s = suppliers.value.find((s) => s.id === header.value.supplierId);
  if (s) header.value.supplierName = s.name;
}
function onProductChange(item: PurchaseOrderItemInput) {
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
function setSpec(item: PurchaseOrderItemInput, key: string, value: unknown) {
  item.specs = { ...(item.specs ?? {}), [key]: value };
  if (!item.specLabels?.[key]) {
    const field = fieldsFor(item).find((f) => f.key === key);
    item.specLabels = { ...(item.specLabels ?? {}), [key]: field?.label ?? key };
  }
}
function addItem() { items.value.push(newItem()); }
function removeItem(i: number) { items.value.splice(i, 1); }

async function save() {
  error.value = '';
  const errs: Array<string | null> = [checkRequired(header.value.supplierId, '供应商')];
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
    if (editingId) await purchaseOrdersApi.update(editingId, input);
    else await purchaseOrdersApi.create(input);
    router.push('/purchase-orders');
  } catch (e) { error.value = e instanceof ApiError ? e.message : '保存失败'; }
  finally { saving.value = false; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ editingId ? '编辑订购单' : '新建订购单' }}</h1>
      <button class="btn" @click="router.push('/purchase-orders')">返回</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <h3>表头信息</h3>
      <div class="row">
        <div class="field"><label>供应商（TO）</label>
          <select :value="header.supplierId ?? ''" @change="header.supplierId = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : undefined; onSupplierChange()">
            <option value="">请选择</option>
            <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>
        <div class="field"><label>供应商名称（快照，可改）</label><input v-model="header.supplierName" /></div>
        <div class="field"><label>订购日期</label><input type="date" v-model="header.orderDate" /></div>
      </div>
      <div class="row">
        <div class="field"><label>交货期（表头，整单统一）</label><input type="date" v-model="header.deliveryDate" /></div>
        <div class="field"><label>ATTN（收件人）</label><input v-model="header.attn" /></div>
        <div class="field"><label>FAX</label><input v-model="header.fax" /></div>
      </div>
      <div class="row">
        <div class="field"><label>币制</label><input v-model="header.currency" /></div>
        <div class="field"><label>FM（制单）</label><input v-model="header.fm" /></div>
      </div>
    </div>

    <div class="card">
      <h3>备注（打印/导出时显示，留空则用默认样本）</h3>
      <div class="field">
        <label>备注条款（每行一条，打印时自动编号 1．2．3．…）</label>
        <textarea v-model="header.terms" rows="6" placeholder="例如：&#10;含税13%，次月15日前开发票。&#10;质量要绝对保证……"></textarea>
      </div>
      <div class="field">
        <label>表尾备注</label>
        <textarea v-model="header.footnote" rows="2" placeholder="例如：本单货品请送本公司厂区，请保证质量。"></textarea>
      </div>
    </div>

    <div class="card">
      <div class="page-header" style="margin-bottom:12px">
        <h3 style="margin:0">明细行</h3>
        <button class="btn btn-sm" @click="addItem">+ 添加一行</button>
      </div>
      <p class="muted" style="font-size:12px; margin:0 0 10px">
        每行按自己货品所属品类填规格：点「规格」展开该品类字段，一张单可混装不同品类。确认此单会按关联货品增加库存。
      </p>
      <div style="overflow-x:auto">
        <table class="data">
          <thead><tr>
            <th style="width:32px">序</th>
            <th style="min-width:110px">关联货品</th>
            <th style="min-width:100px">品名</th>
            <th style="min-width:160px">规格</th>
            <th>单位</th><th>数量</th><th>单价</th><th>金额</th><th>备注</th><th></th>
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
                <td><button class="btn btn-sm" @click="expandedSpecRow = expandedSpecRow === i ? null : i">{{ specText(item) || '填规格' }} ▾</button></td>
                <td><input v-model="item.unit" style="min-width:48px" /></td>
                <td><input type="number" v-numeric v-model.number="item.quantity" style="min-width:60px" /></td>
                <td><input type="number" step="0.01" v-numeric v-model.number="item.unitPrice" style="min-width:70px" /></td>
                <td>{{ ((item.quantity ?? 0) * (item.unitPrice ?? 0)).toFixed(2) }}</td>
                <td><input v-model="item.remark" /></td>
                <td><button class="btn btn-sm btn-danger" @click="removeItem(i)">删</button></td>
              </tr>
              <tr v-if="expandedSpecRow === i">
                <td colspan="10" style="background:#f9fafb; padding:12px">
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
    </div>

    <div class="actions">
      <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存草稿' }}</button>
      <p class="muted" style="font-size:12px; margin:0; align-self:center">保存后为草稿，在列表点「确认」才会增加库存。</p>
    </div>
  </div>
</template>
