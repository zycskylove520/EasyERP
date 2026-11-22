<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { financeApi, ApiError } from '../api';
import type { FinanceDueRow, FinanceRecord } from '../types';
import { checkNumeric, checkRequired, firstError } from '../validation';

const dues = ref<FinanceDueRow[]>([]);
const records = ref<FinanceRecord[]>([]);
const error = ref('');
const message = ref('');
const loading = ref(false);
/** 当前展开收款表单的单据 refId */
const editingRef = ref<number | null>(null);
const form = ref({
  amount: 0 as number | string, recordDate: new Date().toISOString().slice(0, 10), method: '转账',
  handler: '', invoiceNo: '', invoiceStatus: '未开票', remark: '',
});
const methods = ['现金', '转账', '微信', '支付宝', '银行', '其它'];
const invoiceStatuses = ['未开票', '已开票', '不需要'];

async function load() {
  loading.value = true; error.value = '';
  try {
    [dues.value, records.value] = await Promise.all([
      financeApi.receivables(), financeApi.records('RECEIVE'),
    ]);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
  finally { loading.value = false; }
}
onMounted(load);

function openForm(row: FinanceDueRow) {
  editingRef.value = row.refId;
  form.value = {
    amount: row.balance, recordDate: new Date().toISOString().slice(0, 10), method: '转账',
    handler: '', invoiceNo: '', invoiceStatus: '未开票', remark: '',
  };
}
function closeForm() { editingRef.value = null; }

async function submit(row: FinanceDueRow) {
  error.value = ''; message.value = '';
  const err = firstError(
    checkNumeric(form.value.amount, '收款金额', { required: true, min: 0.01 }),
    checkRequired(form.value.recordDate, '日期'),
  );
  if (err) { error.value = err; return; }
  try {
    await financeApi.create({
      type: 'RECEIVE', refType: 'STATEMENT', refId: row.refId,
      amount: Number(form.value.amount), recordDate: form.value.recordDate,
      method: form.value.method,
      handler: form.value.handler || null,
      invoiceNo: form.value.invoiceNo || null,
      invoiceStatus: form.value.invoiceStatus || null,
      remark: form.value.remark || null,
    });
    message.value = `已登记收款 ${form.value.amount} 元`;
    closeForm();
    await load();
  } catch (e) { error.value = e instanceof ApiError ? e.message : '登记失败'; }
}

async function removeRec(r: FinanceRecord) {
  if (!confirm(`确定删除这笔 ${r.amount} 元的收款记录？`)) return;
  try { await financeApi.remove(r.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '删除失败'; }
}
</script>

<template>
  <div>
    <div class="page-header"><h1 class="page-title">收款管理</h1></div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="message" class="card" style="border-left:4px solid #16a34a; color:#16a34a">{{ message }}</div>
    <div v-if="loading" class="card muted">加载中…</div>

    <div class="card">
      <h3>应收对帐单（已确认）</h3>
      <p class="muted" style="font-size:12px; margin:0 0 10px">只有已确认的对帐单会计入应收；打回的不计入。可部分收款、多次收款。</p>
      <div style="overflow-x:auto">
        <table class="data">
          <thead><tr>
            <th>对帐单号</th><th>客户</th><th>日期</th><th>应收金额</th><th>已收</th><th>未收</th><th>操作</th>
          </tr></thead>
          <tbody>
            <template v-for="row in dues" :key="row.refId">
              <tr>
                <td>{{ row.docNo }}</td><td>{{ row.partyName || '-' }}</td><td>{{ row.docDate }}</td>
                <td>{{ row.amount.toFixed(2) }}</td><td>{{ row.received.toFixed(2) }}</td>
                <td :style="row.balance > 0 ? 'color:#dc2626; font-weight:700' : 'color:#16a34a'">{{ row.balance.toFixed(2) }}</td>
                <td><button class="btn btn-sm btn-primary" :disabled="row.balance <= 0" @click="openForm(row)">登记收款</button></td>
              </tr>
              <tr v-if="editingRef === row.refId">
                <td colspan="7" style="background:#f9fafb; padding:12px">
                  <div class="row" style="align-items:flex-end">
                    <div class="field" style="margin-bottom:0"><label>收款金额</label><input type="number" step="0.01" v-numeric v-model.number="form.amount" /></div>
                    <div class="field" style="margin-bottom:0"><label>日期</label><input type="date" v-model="form.recordDate" /></div>
                    <div class="field" style="margin-bottom:0"><label>方式</label>
                      <select v-model="form.method"><option v-for="m in methods" :key="m" :value="m">{{ m }}</option></select>
                    </div>
                    <div class="field" style="margin-bottom:0"><label>备注</label><input v-model="form.remark" /></div>
                    <div class="field" style="margin-bottom:0; flex:0 0 auto">
                      <button class="btn btn-primary" @click="submit(row)">保存</button>
                      <button class="btn" style="margin-left:6px" @click="closeForm">取消</button>
                    </div>
                  </div>
                  <div class="row" style="align-items:flex-end; margin-top:10px">
                    <div class="field" style="margin-bottom:0"><label>经手人</label><input v-model="form.handler" /></div>
                    <div class="field" style="margin-bottom:0"><label>发票号</label><input v-model="form.invoiceNo" /></div>
                    <div class="field" style="margin-bottom:0"><label>开票状态</label>
                      <select v-model="form.invoiceStatus"><option v-for="s in invoiceStatuses" :key="s" :value="s">{{ s }}</option></select>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="!dues.length"><td colspan="7" class="muted">暂无已确认的对帐单</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card">
      <h3>收款记录</h3>
      <table class="data" v-if="records.length">
        <thead><tr><th>单号</th><th>日期</th><th>对帐单</th><th>客户</th><th>金额</th><th>方式</th><th>经手人</th><th>发票号</th><th>开票状态</th><th>备注</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in records" :key="r.id">
            <td>{{ r.recordNo || '-' }}</td><td>{{ r.recordDate }}</td><td>{{ r.refNo }}</td><td>{{ r.partyName || '-' }}</td>
            <td>{{ r.amount.toFixed(2) }}</td><td>{{ r.method || '-' }}</td>
            <td>{{ r.handler || '-' }}</td><td>{{ r.invoiceNo || '-' }}</td><td>{{ r.invoiceStatus || '-' }}</td>
            <td>{{ r.remark || '-' }}</td>
            <td><button class="btn btn-sm btn-danger" @click="removeRec(r)">删</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted" style="margin:0">暂无收款记录</p>
    </div>
  </div>
</template>
