<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { statementsApi, customersApi, companyInfoApi, ApiError } from '../api';
import type { Customer, StatementItemInput, StatementFromCustomerMonth } from '../types';
import { checkNumeric, checkRequired, firstError } from '../validation';

const router = useRouter();
const route = useRoute();
const editingId = route.params.id ? Number(route.params.id) : null;

const customers = ref<Customer[]>([]);
/** 制单月份（YYYY-MM），默认当前月。 */
const selectedMonth = ref(new Date().toISOString().slice(0, 7));
const generating = ref(false);
const error = ref('');
const saving = ref(false);

const header = ref({
  customerId: undefined as number | undefined,
  customerName: '',
  statementDate: new Date().toISOString().slice(0, 10),
  attn: '', fax: '', from: '', currency: 'RMB', remarks: '',
});

function newItem(): StatementItemInput {
  return { itemDate: '', deliveryNo: '', productName: '', unit: '个', quantity: 0, unitPrice: 0, remark: '' };
}
const items = ref<StatementItemInput[]>([newItem()]);

onMounted(async () => {
  try {
    const [cust, company] = await Promise.all([
      customersApi.list(), companyInfoApi.get(),
    ]);
    customers.value = cust;
    if (!editingId) {
      if (company.maker) header.value.from = company.maker;
      if (company.currency) header.value.currency = company.currency;
    }
    if (editingId) {
      const s = await statementsApi.get(editingId);
      header.value = {
        customerId: s.customerId ?? undefined, customerName: s.customerName ?? '',
        statementDate: s.statementDate, attn: s.attn ?? '', fax: s.fax ?? '',
        from: s.from ?? '', currency: s.currency, remarks: s.remarks ?? '',
      };
      items.value = s.items.map((i) => ({
        itemDate: i.itemDate ?? '', deliveryNo: i.deliveryNo ?? '', productName: i.productName,
        unit: i.unit ?? '', quantity: i.quantity,
        unitPrice: i.unitPrice, remark: i.remark ?? '',
      }));
    }
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
});

function onCustomerChange() {
  const c = customers.value.find((c) => c.id === header.value.customerId);
  if (c) {
    header.value.customerName = c.name;
    header.value.attn = c.contact ?? '';
  }
}

/** 按所选客户+月份，汇总当月已确认送货单生成对帐单明细。 */
async function generate() {
  if (!header.value.customerId) { error.value = '请先选择客户'; return; }
  if (!selectedMonth.value) { error.value = '请选择制单月份'; return; }
  error.value = ''; generating.value = true;
  try {
    const data: StatementFromCustomerMonth = await statementsApi.fromCustomerMonth(header.value.customerId, selectedMonth.value);
    header.value = {
      customerId: data.customerId,
      customerName: data.customerName,
      statementDate: data.statementDate,
      attn: data.attn ?? '', fax: data.fax ?? '',
      from: data.from ?? '', currency: data.currency,
      remarks: header.value.remarks,
    };
    items.value = data.items.length ? data.items.map((i) => ({ ...i })) : [newItem()];
    if (!data.items.length) error.value = `该客户 ${data.month} 没有已确认的送货单`;
  } catch (e) { error.value = e instanceof ApiError ? e.message : '生成失败'; }
  finally { generating.value = false; }
}

function addItem() { items.value.push(newItem()); }
function removeItem(i: number) { items.value.splice(i, 1); }
const rowAmount = (item: StatementItemInput) => (item.quantity ?? 0) * (item.unitPrice ?? 0);
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
    if (editingId) await statementsApi.update(editingId, input);
    else await statementsApi.create(input);
    router.push('/statements');
  } catch (e) { error.value = e instanceof ApiError ? e.message : '保存失败'; }
  finally { saving.value = false; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ editingId ? '编辑对帐单' : '新建对帐单' }}</h1>
      <button class="btn" @click="router.push('/statements')">返回</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div class="card" v-if="!editingId">
      <h3>生成对帐单</h3>
      <p class="muted" style="font-size:12px; margin:0 0 10px">选择客户与制单月份，系统自动汇总该客户当月所有已确认的送货单明细。</p>
      <div class="row" style="align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>客户</label>
          <select :value="header.customerId ?? ''" @change="header.customerId = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : undefined; onCustomerChange()">
            <option value="">请选择</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:0"><label>制单月份</label><input type="month" v-model="selectedMonth" /></div>
        <div class="field" style="margin-bottom:0; flex:0 0 auto">
          <button class="btn btn-primary" :disabled="!header.customerId || !selectedMonth || generating" @click="generate">{{ generating ? '生成中…' : '生成明细' }}</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>表头信息</h3>
      <div class="row">
        <div class="field"><label>客户（TO）</label>
          <select :value="header.customerId ?? ''" @change="header.customerId = ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : undefined; onCustomerChange()">
            <option value="">请选择</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="field"><label>客户名称（快照，可改）</label><input v-model="header.customerName" /></div>
        <div class="field"><label>日期</label><input type="date" v-model="header.statementDate" /></div>
      </div>
      <div class="row">
        <div class="field"><label>ATTN</label><input v-model="header.attn" /></div>
        <div class="field"><label>FAX</label><input v-model="header.fax" /></div>
        <div class="field"><label>FROM</label><input v-model="header.from" /></div>
        <div class="field"><label>币制</label><input v-model="header.currency" /></div>
      </div>
    </div>

    <div class="card">
      <div class="field" style="margin-bottom:0">
        <label>整单备注（打印/导出时在明细表下方显示，每行一条）</label>
        <textarea v-model="header.remarks" rows="3" placeholder="如：请核对无误后回签等，留空则不显示"></textarea>
      </div>
    </div>

    <div class="card">
      <div class="page-header" style="margin-bottom:12px">
        <h3 style="margin:0">明细行</h3>
        <button class="btn btn-sm" @click="addItem">+ 添加一行</button>
      </div>
      <div style="overflow-x:auto">
        <table class="data">
          <thead><tr>
            <th style="width:32px">序</th><th>日期</th><th>送货单号</th>
            <th style="min-width:100px">品名</th><th>单位</th>
            <th>数量</th><th>单价</th><th>金额</th><th>备注</th><th></th>
          </tr></thead>
          <tbody>
            <tr v-for="(item, i) in items" :key="i">
              <td>{{ i + 1 }}</td>
              <td><input v-model="item.itemDate" style="min-width:80px" /></td>
              <td><input v-model="item.deliveryNo" /></td>
              <td><input v-model="item.productName" /></td>
              <td><input v-model="item.unit" style="min-width:48px" /></td>
              <td><input type="number" v-numeric v-model.number="item.quantity" style="min-width:60px" /></td>
              <td><input type="number" v-numeric v-model.number="item.unitPrice" style="min-width:65px" /></td>
              <td>{{ rowAmount(item).toFixed(2) }}</td>
              <td><input v-model="item.remark" /></td>
              <td><button class="btn btn-sm btn-danger" @click="removeItem(i)">删</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style="text-align:right; margin-top:12px; font-size:16px">合计：<strong>{{ total() }}</strong></div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存草稿' }}</button>
      <p class="muted" style="font-size:12px; margin:0; align-self:center">对帐单只作记录与导出，不涉及库存变动。</p>
    </div>
  </div>
</template>
