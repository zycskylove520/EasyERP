<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import * as echarts from 'echarts';
import { financeApi, ApiError } from '../api';
import type { FinanceSummary } from '../types';

const data = ref<FinanceSummary | null>(null);
const error = ref('');
const loading = ref(false);
const trendRef = ref<HTMLDivElement | null>(null);
let chart: echarts.ECharts | null = null;

async function load() {
  loading.value = true; error.value = '';
  try { data.value = await financeApi.summary(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
  finally { loading.value = false; }
}

function renderChart() {
  if (!trendRef.value || !data.value) return;
  chart?.dispose();
  chart = echarts.init(trendRef.value);
  const d = data.value;
  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0 },
    grid: { left: 50, right: 20, top: 30, bottom: 50 },
    xAxis: { type: 'category', data: d.trend.map((x) => x.month), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', name: '金额' },
    series: [
      { name: '收款', type: 'bar', itemStyle: { color: '#16a34a' }, data: d.trend.map((x) => x.received) },
      { name: '付款', type: 'bar', itemStyle: { color: '#dc2626' }, data: d.trend.map((x) => x.paid) },
    ],
  });
}
function onResize() { chart?.resize(); }

onMounted(async () => {
  await load();
  await nextTick();
  renderChart();
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  chart?.dispose();
});
</script>

<template>
  <div>
    <div class="page-header"><h1 class="page-title">财务概览</h1></div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading" class="card muted">加载中…</div>

    <template v-if="data && !loading">
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">应收账款（未收）</div>
          <div class="kpi-value" :class="{ 'kpi-danger': data.receivableTotal < 0 }">{{ data.receivableTotal.toFixed(2) }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">应付账款（未付）</div>
          <div class="kpi-value" :class="{ 'kpi-warn': data.payableTotal > 0 }">{{ data.payableTotal.toFixed(2) }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">净额（应收 − 应付）</div>
          <div class="kpi-value" :class="{ 'kpi-danger': data.net < 0 }">{{ data.net.toFixed(2) }}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">本月已收 / 已付</div>
          <div class="kpi-value" style="font-size:20px">{{ data.monthReceived.toFixed(0) }} / {{ data.monthPaid.toFixed(0) }}</div>
        </div>
      </div>

      <div class="card">
        <h3>收付款趋势（近 12 个月）</h3>
        <div ref="trendRef" class="chart"></div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 16px; }
.kpi-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
.kpi-label { font-size: 12px; color: #6b7280; }
.kpi-value { font-size: 26px; font-weight: 700; margin-top: 6px; color: #111827; }
.kpi-value.kpi-danger { color: #dc2626; }
.kpi-value.kpi-warn { color: #f59e0b; }
.chart { width: 100%; height: 320px; }
</style>
