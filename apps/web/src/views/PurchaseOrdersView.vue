<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { purchaseOrdersApi, suppliersApi, ApiError } from '../api';
import type { PurchaseOrder, DocStatus, Supplier } from '../types';

const router = useRouter();
const orders = ref<PurchaseOrder[]>([]);
const suppliers = ref<Supplier[]>([]);
const error = ref('');
const filter = ref({ orderNo: '', supplierId: undefined as number | undefined, dateFrom: '', dateTo: '' });

const statusLabel: Record<DocStatus, string> = {
  DRAFT: '草稿', CONFIRMED: '已确认', REJECTED: '已打回',
};

async function load() {
  try {
    orders.value = await purchaseOrdersApi.list({
      orderNo: filter.value.orderNo || undefined,
      supplierId: filter.value.supplierId,
      dateFrom: filter.value.dateFrom || undefined,
      dateTo: filter.value.dateTo || undefined,
      group: 'active',
    });
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
}
onMounted(async () => {
  await load();
  try { suppliers.value = await suppliersApi.list(); }
  catch { /* 供应商下拉失败不影响主列表 */ }
});

async function act(o: PurchaseOrder, action: 'confirm' | 'reject') {
  error.value = '';
  const label = { confirm: '确认（将按关联货品增加库存）', reject: '打回（将减回库存）' }[action];
  if (!confirm(`确定${label}？单号 ${o.orderNo}`)) return;
  try { await purchaseOrdersApi[action](o.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '操作失败'; }
}
async function remove(o: PurchaseOrder) {
  if (!confirm(`确定删除草稿「${o.orderNo}」？`)) return;
  try { await purchaseOrdersApi.remove(o.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '删除失败'; }
}
async function duplicate(o: PurchaseOrder) {
  error.value = '';
  try {
    const copy = await purchaseOrdersApi.duplicate(o.id);
    router.push(`/purchase-orders/${copy.id}/edit`);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '复制失败'; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">订购单</h1>
      <div class="actions">
        <button class="btn" @click="router.push('/purchase-orders/rejected')">打回单据</button>
        <button class="btn btn-primary" @click="router.push('/purchase-orders/new')">+ 新建订购单</button>
      </div>
    </div>
    <div class="card">
      <div class="row" style="align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>单号</label>
          <input v-model="filter.orderNo" placeholder="输入单号搜索" @keyup.enter="load" /></div>
        <div class="field" style="margin-bottom:0"><label>供应商</label>
          <select v-model.number="filter.supplierId" @change="load">
            <option :value="undefined">全部供应商</option>
            <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select></div>
        <div class="field" style="margin-bottom:0"><label>日期从</label><input type="date" v-model="filter.dateFrom" @change="load" /></div>
        <div class="field" style="margin-bottom:0"><label>日期到</label><input type="date" v-model="filter.dateTo" @change="load" /></div>
        <div class="field" style="margin-bottom:0; flex:0 0 auto">
          <button class="btn btn-primary" @click="load">筛选</button>
          <button class="btn" style="margin-left:6px" @click="filter = { orderNo: '', supplierId: undefined, dateFrom: '', dateTo: '' }; load()">重置</button>
        </div>
      </div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div class="card">
      <table class="data">
        <thead><tr><th>单号</th><th>供应商</th><th>日期</th><th>明细数</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="o in orders" :key="o.id">
            <td>{{ o.orderNo }}</td>
            <td>{{ o.supplierName || '-' }}</td>
            <td>{{ o.orderDate }}</td>
            <td>{{ o.items.length }}</td>
            <td><span class="badge" :class="`badge-${o.status}`">{{ statusLabel[o.status] }}</span></td>
            <td class="actions">
              <button class="btn btn-sm" @click="router.push(`/purchase-orders/${o.id}/print`)">打印</button>
              <button class="btn btn-sm" @click="duplicate(o)">复制</button>
              <template v-if="o.status === 'DRAFT'">
                <button class="btn btn-sm" @click="router.push(`/purchase-orders/${o.id}/edit`)">编辑</button>
                <button class="btn btn-sm btn-primary" @click="act(o, 'confirm')">确认</button>
                <button class="btn btn-sm btn-danger" @click="remove(o)">删除</button>
              </template>
              <template v-else-if="o.status === 'CONFIRMED'">
                <button class="btn btn-sm btn-danger" @click="act(o, 'reject')">打回</button>
              </template>
            </td>
          </tr>
          <tr v-if="!orders.length"><td colspan="6" class="muted">暂无订购单</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
