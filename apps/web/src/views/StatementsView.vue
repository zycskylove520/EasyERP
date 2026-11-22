<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { statementsApi, customersApi, ApiError } from '../api';
import type { Statement, DocStatus, Customer } from '../types';

const router = useRouter();
const statements = ref<Statement[]>([]);
const customers = ref<Customer[]>([]);
const error = ref('');
const filter = ref({ statementNo: '', customerId: undefined as number | undefined, dateFrom: '', dateTo: '' });

const statusLabel: Record<DocStatus, string> = {
  DRAFT: '草稿', CONFIRMED: '已确认', REJECTED: '已打回',
};
const amountOf = (s: Statement) => s.items.reduce((sum, i) => sum + i.amount, 0).toFixed(2);

async function load() {
  try {
    statements.value = await statementsApi.list({
      statementNo: filter.value.statementNo || undefined,
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

async function act(s: Statement, action: 'confirm' | 'reject') {
  error.value = '';
  const label = { confirm: '确认', reject: '打回' }[action];
  if (!confirm(`确定${label}？单号 ${s.statementNo}`)) return;
  try { await statementsApi[action](s.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '操作失败'; }
}
async function remove(s: Statement) {
  if (!confirm(`确定删除草稿「${s.statementNo}」？`)) return;
  try { await statementsApi.remove(s.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '删除失败'; }
}
async function duplicate(s: Statement) {
  error.value = '';
  try {
    const copy = await statementsApi.duplicate(s.id);
    router.push(`/statements/${copy.id}/edit`);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '复制失败'; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">对帐单</h1>
      <div class="actions">
        <button class="btn" @click="router.push('/statements/rejected')">打回单据</button>
        <button class="btn btn-primary" @click="router.push('/statements/new')">+ 新建对帐单</button>
      </div>
    </div>
    <div class="card">
      <div class="row" style="align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>单号</label>
          <input v-model="filter.statementNo" placeholder="输入单号搜索" @keyup.enter="load" /></div>
        <div class="field" style="margin-bottom:0"><label>客户</label>
          <select v-model.number="filter.customerId" @change="load">
            <option :value="undefined">全部客户</option>
            <option v-for="c in customers" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select></div>
        <div class="field" style="margin-bottom:0"><label>日期从</label><input type="date" v-model="filter.dateFrom" @change="load" /></div>
        <div class="field" style="margin-bottom:0"><label>日期到</label><input type="date" v-model="filter.dateTo" @change="load" /></div>
        <div class="field" style="margin-bottom:0; flex:0 0 auto">
          <button class="btn btn-primary" @click="load">筛选</button>
          <button class="btn" style="margin-left:6px" @click="filter = { statementNo: '', customerId: undefined, dateFrom: '', dateTo: '' }; load()">重置</button>
        </div>
      </div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div class="card">
      <table class="data">
        <thead><tr><th>单号</th><th>客户</th><th>日期</th><th>金额</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="s in statements" :key="s.id">
            <td>{{ s.statementNo }}</td>
            <td>{{ s.customerName || '-' }}</td>
            <td>{{ s.statementDate }}</td>
            <td>{{ amountOf(s) }}</td>
            <td><span class="badge" :class="`badge-${s.status}`">{{ statusLabel[s.status] }}</span></td>
            <td class="actions">
              <button class="btn btn-sm" @click="router.push(`/statements/${s.id}/print`)">打印</button>
              <button class="btn btn-sm" @click="duplicate(s)">复制</button>
              <template v-if="s.status === 'DRAFT'">
                <button class="btn btn-sm" @click="router.push(`/statements/${s.id}/edit`)">编辑</button>
                <button class="btn btn-sm btn-primary" @click="act(s, 'confirm')">确认</button>
                <button class="btn btn-sm btn-danger" @click="remove(s)">删除</button>
              </template>
              <template v-else-if="s.status === 'CONFIRMED'">
                <button class="btn btn-sm btn-danger" @click="act(s, 'reject')">打回</button>
              </template>
            </td>
          </tr>
          <tr v-if="!statements.length"><td colspan="6" class="muted">暂无对帐单</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
