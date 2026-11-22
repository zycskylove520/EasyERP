<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { inventoryApi, productsApi, ApiError } from '../api';
import type { LedgerEntry, Product, LedgerReason } from '../types';

const ledger = ref<LedgerEntry[]>([]);
const products = ref<Product[]>([]);
const error = ref('');
const filterProduct = ref<number | undefined>(undefined);
const filterReason = ref<LedgerReason | undefined>(undefined);

const reasonLabel: Record<LedgerReason, string> = {
  INITIAL: '期初', QUOTATION_CONSUME: '报价扣减(历史)', QUOTATION_REVERSE: '报价冲销(历史)',
  MANUAL_ADJUST: '手工调整',
  DELIVERY_CONSUME: '送货扣减', DELIVERY_REVERSE: '送货冲销',
  PO_RECEIVE: '订购入库', PO_REVERSE: '订购冲销',
};

async function load() {
  try { ledger.value = await inventoryApi.ledger(filterProduct.value, filterReason.value); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
}
onMounted(async () => {
  await load();
  try { products.value = await productsApi.list(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载货品失败'; }
});
</script>

<template>
  <div>
    <div class="page-header"><h1 class="page-title">库存流水</h1></div>
    <div v-if="error" class="error">{{ error }}</div>

    <div class="card">
      <div class="row" style="align-items:flex-end; max-width:520px">
        <div class="field" style="margin-bottom:0"><label>货品</label>
          <select v-model.number="filterProduct" @change="load">
            <option :value="undefined">全部货品</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}（{{ p.categoryName }}）</option>
          </select></div>
        <div class="field" style="margin-bottom:0"><label>原因</label>
          <select v-model="filterReason" @change="load">
            <option :value="undefined">全部原因</option>
            <option v-for="(label, key) in reasonLabel" :key="key" :value="key">{{ label }}</option>
          </select></div>
        <div class="field" style="margin-bottom:0; flex:0 0 auto">
          <button class="btn btn-primary" @click="load">筛选</button>
        </div>
      </div>
    </div>

    <div class="card">
      <table class="data">
        <thead><tr><th>时间</th><th>货品</th><th>变动</th><th>原因</th><th>备注</th></tr></thead>
        <tbody>
          <tr v-for="l in ledger" :key="l.id">
            <td>{{ l.createdAt }}</td><td>{{ l.productName }}</td>
            <td :style="l.delta >= 0 ? 'color:#16a34a' : 'color:#dc2626'">{{ l.delta > 0 ? '+' : '' }}{{ l.delta }}</td>
            <td>{{ reasonLabel[l.reason] }}</td><td>{{ l.note || '-' }}</td>
          </tr>
          <tr v-if="!ledger.length"><td colspan="5" class="muted">暂无流水</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
