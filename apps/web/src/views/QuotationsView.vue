<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { quotationsApi, customersApi, ApiError } from '../api';
import type { Quotation, QuotationStatus, Customer } from '../types';

const router = useRouter();
const quotes = ref<Quotation[]>([]);
const customers = ref<Customer[]>([]);
const error = ref('');
const filter = ref({ quoteNo: '', customerId: undefined as number | undefined, dateFrom: '', dateTo: '' });

async function load() {
  try {
    quotes.value = await quotationsApi.list({
      quoteNo: filter.value.quoteNo || undefined,
      customerId: filter.value.customerId,
      dateFrom: filter.value.dateFrom || undefined,
      dateTo: filter.value.dateTo || undefined,
      group: 'active',
    });
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
}
onMounted(async () => {
  await load();
  try { customers.value = await customersApi.list(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载客户失败'; }
});

const statusLabel: Record<QuotationStatus, string> = {
  DRAFT: '草稿', CONFIRMED: '已确认', REJECTED: '已打回',
};

/** 报价单无确认环节、不涉及库存；草稿/已确认都可直接打回。 */
async function act(q: Quotation, action: 'reject') {
  error.value = '';
  const label = { reject: '打回' }[action];
  if (!confirm(`确定${label}？单号 ${q.quoteNo}`)) return;
  try {
    await quotationsApi[action](q.id);
    await load();
  } catch (e) { error.value = e instanceof ApiError ? e.message : '操作失败'; }
}
async function remove(q: Quotation) {
  if (!confirm(`确定删除草稿「${q.quoteNo}」？`)) return;
  try { await quotationsApi.remove(q.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '删除失败'; }
}
/** 复制为新草稿单，并跳到编辑页继续修改 */
async function duplicate(q: Quotation) {
  error.value = '';
  try {
    const copy = await quotationsApi.duplicate(q.id);
    router.push(`/quotations/${copy.id}/edit`);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '复制失败'; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">报价单</h1>
      <div class="actions">
        <button class="btn" @click="router.push('/quotations/rejected')">打回单据</button>
        <button class="btn btn-primary" @click="router.push('/quotations/new')">+ 新建报价单</button>
      </div>
    </div>
    <div class="card">
      <div class="row" style="align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>单号</label>
          <input v-model="filter.quoteNo" placeholder="输入单号搜索" @keyup.enter="load" /></div>
        <div class="field" style="margin-bottom:0"><label>客户</label>
          <select v-model.number="filter.customerId" @change="load">
            <option :value="undefined">全部客户</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select></div>
        <div class="field" style="margin-bottom:0"><label>日期从</label><input type="date" v-model="filter.dateFrom" @change="load" /></div>
        <div class="field" style="margin-bottom:0"><label>日期到</label><input type="date" v-model="filter.dateTo" @change="load" /></div>
        <div class="field" style="margin-bottom:0; flex:0 0 auto">
          <button class="btn btn-primary" @click="load">筛选</button>
          <button class="btn" style="margin-left:6px" @click="filter = { quoteNo: '', customerId: undefined, dateFrom: '', dateTo: '' }; load()">重置</button>
        </div>
      </div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <table class="data">
        <thead><tr><th>单号</th><th>客户</th><th>日期</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="q in quotes" :key="q.id">
            <td>{{ q.quoteNo }}</td>
            <td>{{ q.customerName || '-' }}</td>
            <td>{{ q.quoteDate }}</td>
            <td>{{ q.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0).toFixed(2) }}</td>
            <td><span class="badge" :class="`badge-${q.status}`">{{ statusLabel[q.status] }}</span></td>
            <td class="actions">
              <button class="btn btn-sm" @click="router.push(`/quotations/${q.id}/print`)">打印</button>
              <button class="btn btn-sm" @click="duplicate(q)">复制</button>
              <template v-if="q.status === 'DRAFT'">
                <button class="btn btn-sm" @click="router.push(`/quotations/${q.id}/edit`)">编辑</button>
                <button class="btn btn-sm btn-danger" @click="act(q, 'reject')">打回</button>
                <button class="btn btn-sm btn-danger" @click="remove(q)">删除</button>
              </template>
              <template v-else-if="q.status === 'CONFIRMED'">
                <button class="btn btn-sm btn-danger" @click="act(q, 'reject')">打回</button>
              </template>
            </td>
          </tr>
          <tr v-if="!quotes.length"><td colspan="6" class="muted">暂无报价单</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
