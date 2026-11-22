<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import * as echarts from 'echarts';
import { overviewApi, ApiError } from '../api';
import type { OverviewData } from '../types';

const data = ref<OverviewData | null>(null);
const error = ref('');
const loading = ref(false);
const months = ref(12);

/** 各图表容器 DOM 引用 */
const pieRef = ref<HTMLDivElement | null>(null);
const deliveryRef = ref<HTMLDivElement | null>(null);
const docStatusRef = ref<HTMLDivElement | null>(null);
const customerRankRef = ref<HTMLDivElement | null>(null);
const ledgerRef = ref<HTMLDivElement | null>(null);
const topProductsRef = ref<HTMLDivElement | null>(null);

const charts: echarts.ECharts[] = [];
/** 统一颜色盘 */
const palette = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#0891b2', '#db2777', '#65a30d'];

async function load() {
  loading.value = true; error.value = '';
  try { data.value = await overviewApi.get(months.value); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
  finally { loading.value = false; }
}

/** 销毁旧图表实例，重新渲染全部图表。 */
function renderCharts() {
  charts.forEach((c) => c.dispose());
  charts.length = 0;
  const d = data.value;
  if (!d) return;

  const make = (el: HTMLDivElement | null, option: echarts.EChartsOption) => {
    if (!el) return;
    const chart = echarts.init(el);
    chart.setOption(option);
    charts.push(chart);
  };

  // 1. 库存按品类分布（饼图）
  make(pieRef.value, {
    color: palette,
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const item = d.stockByCategory.find((x) => x.name === p.name);
        const actual = item?.actual ?? 0;
        const flag = actual < 0 ? '（缺货/负库存）' : '';
        return `${p.name}<br/>实际库存：${actual}${flag}<br/>占比：${p.percent}%`;
      },
    },
    legend: { bottom: 0, type: 'scroll' },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: false },
      data: d.stockByCategory.map((x, i) => ({
        name: x.name,
        value: x.value,
        itemStyle: { color: x.actual < 0 ? '#ef4444' : palette[i % palette.length] },
      })),
    }],
  });

  // 2. 送货金额月度趋势（折线图）
  make(deliveryRef.value, {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 40 },
    xAxis: { type: 'category', data: d.deliveryTrend.map((x) => x.month), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', name: '金额' },
    series: [{
      name: '送货金额', type: 'line', smooth: true, showSymbol: false,
      areaStyle: { opacity: 0.15 }, lineStyle: { width: 2 },
      data: d.deliveryTrend.map((x) => x.amount),
    }],
  });

  // 3. 单据状态分布（堆叠柱状）
  const docLabels = ['报价单', '订购单', '送货单', '对帐单'];
  const statuses = [
    { name: '草稿', key: 'draft' as const, color: '#94a3b8' },
    { name: '已确认', key: 'confirmed' as const, color: '#16a34a' },
    { name: '已打回', key: 'rejected' as const, color: '#dc2626' },
  ];
  const docVals = [d.docStatus.quotations, d.docStatus.purchaseOrders, d.docStatus.deliveryNotes, d.docStatus.statements];
  make(docStatusRef.value, {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0 },
    grid: { left: 40, right: 20, top: 30, bottom: 45 },
    xAxis: { type: 'category', data: docLabels },
    yAxis: { type: 'value' },
    series: statuses.map((s) => ({
      name: s.name, type: 'bar', stack: 'total', barWidth: 36,
      itemStyle: { color: s.color },
      data: docVals.map((v) => v[s.key]),
    })),
  });

  // 4. 客户对帐金额排行（横向柱状）
  make(customerRankRef.value, {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'value', name: '金额' },
    yAxis: { type: 'category', data: d.customerStatementRank.map((x) => x.name).reverse() },
    series: [{
      type: 'bar', barWidth: 16,
      itemStyle: { color: '#2563eb', borderRadius: [0, 4, 4, 0] },
      data: d.customerStatementRank.map((x) => x.amount).reverse(),
    }],
  });

  // 5. 库存流水出入库趋势（按 reason 多系列柱状）
  const reasons = Array.from(new Set(d.ledgerTrend.map((x) => x.reason)));
  const reasonColor: Record<string, string> = {
    INITIAL: '#94a3b8', MANUAL_ADJUST: '#f59e0b',
    PO_RECEIVE: '#16a34a', PO_REVERSE: '#86efac',
    DELIVERY_CONSUME: '#dc2626', DELIVERY_REVERSE: '#fca5a5',
    QUOTATION_CONSUME: '#fb7185', QUOTATION_REVERSE: '#fda4af',
  };
  const months = Array.from(new Set(d.ledgerTrend.map((x) => x.month))).sort();
  make(ledgerRef.value, {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, type: 'scroll' },
    grid: { left: 50, right: 20, top: 30, bottom: 55 },
    xAxis: { type: 'category', data: months },
    yAxis: { type: 'value', name: '数量' },
    series: reasons.map((r) => ({
      name: r, type: 'bar', stack: 'flow',
      itemStyle: { color: reasonColor[r] ?? '#64748b' },
      data: months.map((m) => d.ledgerTrend.find((x) => x.month === m && x.reason === r)?.delta ?? 0),
    })),
  });

  // 6. 畅出货品 TOP10（横向柱状）
  make(topProductsRef.value, {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 30, top: 20, bottom: 30 },
    xAxis: { type: 'value', name: '数量' },
    yAxis: { type: 'category', data: d.topProducts.map((x) => x.name).reverse() },
    series: [{
      type: 'bar', barWidth: 16,
      itemStyle: { color: '#0891b2', borderRadius: [0, 4, 4, 0] },
      data: d.topProducts.map((x) => x.quantity).reverse(),
    }],
  });
}

function onResize() { charts.forEach((c) => c.resize()); }

onMounted(async () => {
  await load();
  await nextTick();
  renderCharts();
  window.addEventListener('resize', onResize);
});
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  charts.forEach((c) => c.dispose());
  charts.length = 0;
});
// 时间范围切换：重新拉数据并重绘
watch(months, async () => {
  await load();
  await nextTick();
  renderCharts();
});

const kpiCards = () => {
  const k = data.value?.kpi;
  if (!k) return [];
  return [
    { label: '货品总数', value: k.productCount, sub: `品类 ${k.categoryCount}` },
    { label: '客户 / 供货商', value: `${k.customerCount} / ${k.supplierCount}`, sub: '' },
    { label: '当前库存总量', value: k.stockTotal.toFixed(0), sub: k.negativeStockCount ? `⚠ ${k.negativeStockCount} 项为负` : '无负库存', danger: k.stockTotal < 0 },
    { label: '本月报价 / 送货 / 对帐', value: `${k.monthQuotations} / ${k.monthDeliveries} / ${k.monthStatements}`, sub: '' },
  ];
};
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">概览</h1>
      <div class="actions">
        <select v-model.number="months" class="period-select">
          <option :value="6">近 6 个月</option>
          <option :value="12">近 12 个月</option>
          <option :value="24">近 24 个月</option>
        </select>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading" class="card muted">加载中…</div>

    <template v-if="data && !loading">
      <!-- KPI 卡片 -->
      <div class="kpi-grid">
        <div v-for="c in kpiCards()" :key="c.label" class="kpi-card">
          <div class="kpi-label">{{ c.label }}</div>
          <div class="kpi-value" :class="{ 'kpi-danger': c.danger }">{{ c.value }}</div>
          <div v-if="c.sub" class="kpi-sub">{{ c.sub }}</div>
        </div>
      </div>

      <!-- 图表网格 -->
      <div class="chart-grid">
        <div class="card chart-card">
          <h3>库存按品类分布</h3>
          <div ref="pieRef" class="chart"></div>
        </div>
        <div class="card chart-card">
          <h3>送货金额月度趋势</h3>
          <div ref="deliveryRef" class="chart"></div>
        </div>
        <div class="card chart-card">
          <h3>单据状态分布（本月）</h3>
          <div ref="docStatusRef" class="chart"></div>
        </div>
        <div class="card chart-card">
          <h3>客户对帐金额排行</h3>
          <div ref="customerRankRef" class="chart"></div>
        </div>
        <div class="card chart-card">
          <h3>库存流水出入库趋势</h3>
          <div ref="ledgerRef" class="chart"></div>
        </div>
        <div class="card chart-card">
          <h3>畅出货品 TOP10</h3>
          <div ref="topProductsRef" class="chart"></div>
        </div>
      </div>

      <!-- 负库存预警 -->
      <div class="card">
        <h3>负库存预警</h3>
        <table class="data" v-if="data.negativeStock.length">
          <thead><tr><th>货品</th><th>品类</th><th>当前库存</th></tr></thead>
          <tbody>
            <tr v-for="n in data.negativeStock" :key="n.productName">
              <td>{{ n.productName }}</td><td>{{ n.categoryName }}</td>
              <td style="color:#dc2626; font-weight:700">{{ n.quantity }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted" style="margin:0">暂无负库存，一切正常。</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.period-select { padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 16px; }
.kpi-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
.kpi-label { font-size: 12px; color: #6b7280; }
.kpi-value { font-size: 26px; font-weight: 700; margin: 6px 0 2px; color: #111827; }
.kpi-value.kpi-danger { color: #dc2626; }
.kpi-sub { font-size: 12px; color: #9ca3af; }
.chart-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 16px; margin-bottom: 16px; }
.chart-card h3 { margin: 0 0 12px; font-size: 15px; }
.chart { width: 100%; height: 300px; }
</style>
