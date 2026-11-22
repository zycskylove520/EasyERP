<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { inventoryApi, ApiError } from '../api';
import type { Stock } from '../types';

const stock = ref<Stock[]>([]);
const error = ref('');

async function load() {
  try { stock.value = await inventoryApi.stock(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
}
onMounted(load);
</script>

<template>
  <div>
    <div class="page-header"><h1 class="page-title">当前库存</h1></div>
    <div v-if="error" class="error">{{ error }}</div>
    <div class="card">
      <table class="data">
        <thead><tr><th>货品</th><th>品类</th><th>当前数量</th><th>单位</th></tr></thead>
        <tbody>
          <tr v-for="s in stock" :key="s.productId">
            <td>{{ s.productName }}</td><td>{{ s.categoryName }}</td>
            <td><strong :style="s.quantity < 0 ? { color: '#dc2626' } : undefined">{{ s.quantity }}</strong></td><td>{{ s.unit }}</td>
          </tr>
          <tr v-if="!stock.length"><td colspan="4" class="muted">暂无货品</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
