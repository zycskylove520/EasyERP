<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { deliveryNotesApi, customersApi, ApiError } from '../api';
import type { DeliveryNote, DocStatus, Customer, LowStockItem } from '../types';

const router = useRouter();
const notes = ref<DeliveryNote[]>([]);
const customers = ref<Customer[]>([]);
const error = ref('');
const filter = ref({ deliveryNo: '', customerId: undefined as number | undefined, dateFrom: '', dateTo: '' });
const lowStockAlert = ref<LowStockItem[]>([]);

const statusLabel: Record<DocStatus, string> = {
  DRAFT: '草稿', CONFIRMED: '已确认', REJECTED: '已打回',
};
const amountOf = (n: DeliveryNote) => n.items.reduce((s, i) => s + i.amount, 0).toFixed(2);

async function load() {
  try {
    notes.value = await deliveryNotesApi.list({
      deliveryNo: filter.value.deliveryNo || undefined,
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
  catch { /* 客户下拉失败不影响主列表 */ }
});

async function act(n: DeliveryNote, action: 'confirm' | 'reject') {
  error.value = '';
  const label = { confirm: '确认（将扣减库存）', reject: '打回（将还回库存）' }[action];
  if (!confirm(`确定${label}？单号 ${n.deliveryNo}`)) return;
  try {
    const result = await deliveryNotesApi[action](n.id);
    if (action === 'confirm' && 'lowStock' in result) lowStockAlert.value = result.lowStock;
    await load();
  } catch (e) { error.value = e instanceof ApiError ? e.message : '操作失败'; }
}
async function remove(n: DeliveryNote) {
  if (!confirm(`确定删除草稿「${n.deliveryNo}」？`)) return;
  try { await deliveryNotesApi.remove(n.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '删除失败'; }
}
async function duplicate(n: DeliveryNote) {
  error.value = '';
  try {
    const copy = await deliveryNotesApi.duplicate(n.id);
    router.push(`/delivery-notes/${copy.id}/edit`);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '复制失败'; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">送货单</h1>
      <div class="actions">
        <button class="btn" @click="router.push('/delivery-notes/rejected')">打回单据</button>
        <button class="btn btn-primary" @click="router.push('/delivery-notes/new')">+ 新建送货单</button>
      </div>
    </div>
    <div class="card">
      <div class="row" style="align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>单号</label>
          <input v-model="filter.deliveryNo" placeholder="输入单号搜索" @keyup.enter="load" /></div>
        <div class="field" style="margin-bottom:0"><label>客户</label>
          <select v-model.number="filter.customerId" @change="load">
            <option :value="undefined">全部客户</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select></div>
        <div class="field" style="margin-bottom:0"><label>日期从</label><input type="date" v-model="filter.dateFrom" @change="load" /></div>
        <div class="field" style="margin-bottom:0"><label>日期到</label><input type="date" v-model="filter.dateTo" @change="load" /></div>
        <div class="field" style="margin-bottom:0; flex:0 0 auto">
          <button class="btn btn-primary" @click="load">筛选</button>
          <button class="btn" style="margin-left:6px" @click="filter = { deliveryNo: '', customerId: undefined, dateFrom: '', dateTo: '' }; load()">重置</button>
        </div>
      </div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="lowStockAlert.length" class="card" style="border-left:4px solid #dc2626">
      <div class="page-header" style="margin-bottom:8px">
        <h3 style="margin:0; color:#dc2626">⚠ 库存不足提醒 · 请及时补货</h3>
        <button class="btn btn-sm" @click="lowStockAlert = []">关闭</button>
      </div>
      <p class="muted" style="margin:0 0 8px">以下货品扣减后库存为负：</p>
      <table class="data">
        <thead><tr><th>货品</th><th>当前余量</th></tr></thead>
        <tbody>
          <tr v-for="item in lowStockAlert" :key="item.productId">
            <td>{{ item.productName }}</td>
            <td style="color:#dc2626">{{ item.remaining }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="card">
      <table class="data">
        <thead><tr><th>单号</th><th>客户</th><th>出货日期</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="n in notes" :key="n.id">
            <td>{{ n.deliveryNo }}</td>
            <td>{{ n.customerName || '-' }}</td>
            <td>{{ n.deliveryDate }}</td>
            <td>{{ amountOf(n) }}</td>
            <td><span class="badge" :class="`badge-${n.status}`">{{ statusLabel[n.status] }}</span></td>
            <td class="actions">
              <button class="btn btn-sm" @click="router.push(`/delivery-notes/${n.id}/print`)">打印</button>
              <button class="btn btn-sm" @click="duplicate(n)">复制</button>
              <template v-if="n.status === 'DRAFT'">
                <button class="btn btn-sm" @click="router.push(`/delivery-notes/${n.id}/edit`)">编辑</button>
                <button class="btn btn-sm btn-primary" @click="act(n, 'confirm')">确认</button>
                <button class="btn btn-sm btn-danger" @click="remove(n)">删除</button>
              </template>
              <template v-else-if="n.status === 'CONFIRMED'">
                <button class="btn btn-sm btn-danger" @click="act(n, 'reject')">打回</button>
              </template>
            </td>
          </tr>
          <tr v-if="!notes.length"><td colspan="6" class="muted">暂无送货单</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
