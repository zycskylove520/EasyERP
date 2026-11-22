<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { purchaseOrdersApi, deliveryNotesApi, statementsApi, ApiError } from '../api';
import type { DocStatus } from '../types';

const router = useRouter();
const route = useRoute();
const error = ref('');

/** 按当前路径前缀决定展示哪类单据的打回列表。 */
type Kind = 'purchase-orders' | 'delivery-notes' | 'statements';
const kind = computed<Kind>(() => {
  const p = route.path;
  if (p.startsWith('/purchase-orders')) return 'purchase-orders';
  if (p.startsWith('/delivery-notes')) return 'delivery-notes';
  return 'statements';
});
const config = computed(() => {
  switch (kind.value) {
    case 'purchase-orders': return { title: '订购单 · 打回单据', back: '/purchase-orders', backLabel: '返回订购单' };
    case 'delivery-notes': return { title: '送货单 · 打回单据', back: '/delivery-notes', backLabel: '返回送货单' };
    default: return { title: '对帐单 · 打回单据', back: '/statements', backLabel: '返回对帐单' };
  }
});

interface Row {
  id: number;
  no: string;
  party: string | null;
  date: string;
  amount: number;
  status: DocStatus;
}
const rows = ref<Row[]>([]);
const statusLabel: Record<DocStatus, string> = {
  DRAFT: '草稿', CONFIRMED: '已确认', REJECTED: '已打回',
};

async function load() {
  error.value = '';
  try {
    if (kind.value === 'purchase-orders') {
      const list = await purchaseOrdersApi.list({ group: 'rejected' });
      rows.value = list.map((o) => ({ id: o.id, no: o.orderNo, party: o.supplierName, date: o.orderDate, amount: 0, status: o.status }));
    } else if (kind.value === 'delivery-notes') {
      const list = await deliveryNotesApi.list({ group: 'rejected' });
      rows.value = list.map((n) => ({ id: n.id, no: n.deliveryNo, party: n.customerName, date: n.deliveryDate, amount: n.items.reduce((s, i) => s + i.amount, 0), status: n.status }));
    } else {
      const list = await statementsApi.list({ group: 'rejected' });
      rows.value = list.map((s) => ({ id: s.id, no: s.statementNo, party: s.customerName, date: s.statementDate, amount: s.items.reduce((sum, i) => sum + i.amount, 0), status: s.status }));
    }
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
}
onMounted(load);

async function duplicate(row: Row) {
  error.value = '';
  try {
    let copyId: number;
    if (kind.value === 'purchase-orders') copyId = (await purchaseOrdersApi.duplicate(row.id)).id;
    else if (kind.value === 'delivery-notes') copyId = (await deliveryNotesApi.duplicate(row.id)).id;
    else copyId = (await statementsApi.duplicate(row.id)).id;
    router.push(`/${kind.value}/${copyId}/edit`);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '复制失败'; }
}
function docx(row: Row) {
  const filename = `${row.no}.docx`;
  const task = kind.value === 'purchase-orders'
    ? purchaseOrdersApi.downloadDocx(row.id, filename)
    : kind.value === 'delivery-notes'
      ? deliveryNotesApi.downloadDocx(row.id, filename)
      : statementsApi.downloadDocx(row.id, filename);
  task.catch((e) => { error.value = e instanceof ApiError ? e.message : '导出失败'; });
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ config.title }}</h1>
      <div class="actions">
        <button class="btn" @click="router.push(config.back)">{{ config.backLabel }}</button>
      </div>
    </div>
    <div class="card">
      <p class="muted" style="margin:0 0 10px">这里存放已打回的历史单据。可预览、导出 Word/PDF，或复制出来修改再用。</p>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div class="card">
      <table class="data">
        <thead><tr><th>单号</th><th>供应商/客户</th><th>日期</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>{{ row.no }}</td>
            <td>{{ row.party || '-' }}</td>
            <td>{{ row.date }}</td>
            <td>{{ row.amount ? row.amount.toFixed(2) : '-' }}</td>
            <td><span class="badge" :class="`badge-${row.status}`">{{ statusLabel[row.status] }}</span></td>
            <td class="actions">
              <button class="btn btn-sm" @click="router.push(`/${kind}/${row.id}/print`)">预览</button>
              <button class="btn btn-sm" @click="docx(row)">导出Word</button>
              <button class="btn btn-sm" @click="duplicate(row)">复制</button>
            </td>
          </tr>
          <tr v-if="!rows.length"><td colspan="6" class="muted">暂无打回单据</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
