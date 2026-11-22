<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { quotationsApi, companyInfoApi, ApiError } from '../api';
import { exportPdf } from '../pdf';

const route = useRoute();
const router = useRouter();
const quoteId = Number(route.params.id);
const data = ref<Record<string, any> | null>(null);
/** 公司抬头（从用户填写的公司信息档案读取，仓库不预置默认值）。 */
const companyName = ref('');
const error = ref('');

onMounted(async () => {
  try {
    const [printData, company] = await Promise.all([
      quotationsApi.print(quoteId), companyInfoApi.get(),
    ]);
    data.value = printData;
    companyName.value = company.name || '';
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
});

function print() { window.print(); }

/** 导出 PDF（Electron 下真正生成 PDF 文件）。 */
async function doExportPdf() {
  error.value = '';
  try {
    const res = await exportPdf(`${data.value?.quoteNo ?? `报价单-${quoteId}`}`);
    if (!res.ok) error.value = res.message ?? '导出 PDF 失败';
  } catch (e) { error.value = e instanceof ApiError ? e.message : '导出 PDF 失败'; }
}

/** 导出 Word（纯报价单内容，不含界面元素） */
async function exportWord() {
  error.value = '';
  try {
    const name = `${data.value?.quoteNo ?? `报价单-${quoteId}`}.docx`;
    await quotationsApi.downloadDocx(quoteId, name);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '导出失败'; }
}
</script>

<template>
  <div>
    <div class="page-header no-print">
      <h1 class="page-title">报价单打印预览</h1>
      <div class="actions">
        <button class="btn" @click="router.push('/quotations')">返回</button>
        <button class="btn" @click="exportWord">导出 Word</button>
        <button class="btn" @click="doExportPdf">导出 PDF</button>
        <button class="btn btn-primary" @click="print">打印</button>
      </div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="data" class="paper">
      <div class="paper-company">{{ companyName || '——' }}</div>
      <div class="paper-title">{{ data.title }}</div>
      <div class="paper-meta">
        <span>TO：{{ data.customer || '——' }}</span>
        <span>ATTN：{{ data.attn || '——' }}</span>
        <span>DATE：{{ data.date }}</span>
      </div>
      <div class="paper-meta">
        <span>FAX：{{ data.fax || '——' }}</span>
        <span>FROM：{{ data.from || '——' }}</span>
        <span>币制：{{ data.currency }}</span>
      </div>
      <table class="paper-table">
        <thead><tr><th v-for="(col, i) in data.columns" :key="i">{{ col }}</th></tr></thead>
        <tbody>
          <tr v-for="(item, i) in data.items" :key="i">
            <td>{{ i + 1 }}</td>
            <td>{{ item.productName }}</td>
            <td>{{ item.specText || '' }}</td>
            <td>{{ item.unit || '' }}</td>
            <td>{{ item.unitPrice }}</td>
            <td>{{ item.quantity }}</td>
            <td>{{ item.deliveryDate || '' }}</td>
            <td>{{ item.remark || '' }}</td>
          </tr>
          <tr v-for="n in Math.max(0, 6 - data.items.length)" :key="`e${n}`">
            <td v-for="k in data.columns.length" :key="k">&nbsp;</td>
          </tr>
        </tbody>
      </table>
      <div class="paper-terms" style="margin-bottom:8px">
        <div v-if="data.paymentTerms"><strong>结算及付款方式：</strong>{{ data.paymentTerms }}</div>
        <div v-if="data.shippingTerms"><strong>运输方式：</strong>{{ data.shippingTerms }}</div>
      </div>
      <div class="paper-terms">
        <div v-for="(term, i) in data.terms" :key="i">{{ i + 1 }}. {{ term }}</div>
        <div v-if="data.remarks" style="white-space:pre-wrap">{{ data.remarks }}</div>
      </div>
      <div class="paper-sign">
        <div>客户（盖章）：____________</div>
        <div>{{ companyName || '——' }}（盖章）：____________</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.paper { background: #fff; max-width: 800px; margin: 0 auto; padding: 40px; box-shadow: 0 1px 4px rgba(0,0,0,.15); }
.paper-company { text-align: center; font-size: 18px; font-weight: 700; }
.paper-title { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 6px; margin: 8px 0 20px; }
.paper-meta { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
.paper-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 12px; }
.paper-table th, .paper-table td { border: 1px solid #374151; padding: 6px 4px; text-align: center; }
.paper-table th { background: #f3f4f6; }
.paper-terms { font-size: 12px; line-height: 1.9; margin-top: 16px; }
.paper-sign { display: flex; justify-content: space-between; margin-top: 40px; font-size: 13px; }
</style>
