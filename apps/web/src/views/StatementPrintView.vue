<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { statementsApi, ApiError } from '../api';
import { exportPdf } from '../pdf';

const route = useRoute();
const router = useRouter();
const id = Number(route.params.id);
/** 打印数据（与后端 getPrintData 返回结构一致）。 */
const data = ref<Record<string, any> | null>(null);
const error = ref('');

onMounted(async () => {
  try { data.value = await statementsApi.print(id); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
});

/** 调浏览器打印，用户可选「另存为 PDF」。 */
function print() { window.print(); }

/** 导出 PDF（Electron 下真正生成 PDF 文件）。 */
async function doExportPdf() {
  error.value = '';
  try {
    const res = await exportPdf(`${data.value?.statementNo ?? `对帐单-${id}`}`);
    if (!res.ok) error.value = res.message ?? '导出 PDF 失败';
  } catch (e) { error.value = e instanceof ApiError ? e.message : '导出 PDF 失败'; }
}

/** 导出 Word（纯单据内容，不含界面元素）。 */
async function exportWord() {
  error.value = '';
  try {
    const name = `${data.value?.statementNo ?? `对帐单-${id}`}.docx`;
    await statementsApi.downloadDocx(id, name);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '导出失败'; }
}
</script>

<template>
  <div>
    <div class="page-header no-print">
      <h1 class="page-title">对帐单打印预览</h1>
      <div class="actions">
        <button class="btn" @click="router.push('/statements')">返回</button>
        <button class="btn" @click="exportWord">导出 Word</button>
        <button class="btn" @click="doExportPdf">导出 PDF</button>
        <button class="btn btn-primary" @click="print">打印</button>
      </div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="data" class="paper">
      <div class="paper-company">{{ data.company.name }}</div>
      <div class="paper-title">{{ data.title }}</div>
      <div class="paper-meta">
        <span>TO：{{ data.customerName || '——' }}</span>
        <span>ATTN：{{ data.attn || '——' }}</span>
        <span>DATE：{{ data.statementDate }}</span>
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
            <td>{{ item.itemDate || '' }}</td>
            <td>{{ item.deliveryNo || '' }}</td>
            <td>{{ item.productName }}</td>
            <td>{{ item.unit || '' }}</td>
            <td>{{ item.quantity }}</td>
            <td>{{ item.unitPrice }}</td>
            <td>{{ item.amount }}</td>
            <td>{{ item.remark || '' }}</td>
          </tr>
          <tr v-for="n in Math.max(0, 6 - data.items.length)" :key="`e${n}`">
            <td v-for="k in data.columns.length" :key="k">&nbsp;</td>
          </tr>
        </tbody>
      </table>
      <div v-if="data.remarks" class="paper-remarks" style="white-space:pre-wrap; font-size:12px; line-height:1.9; margin:8px 0">{{ data.remarks }}</div>
      <div class="paper-terms">
        <div>合计　<strong>人民币大写金额：{{ data.totalChinese }}</strong></div>
      </div>
      <div class="paper-sign">
        <div>客户回签（盖章）：____________</div>
        <div>审核：____________　作成：____________</div>
      </div>
      <div class="paper-footer">核对后烦请回签，TKS！！</div>
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
.paper-sign { display: flex; justify-content: space-between; margin-top: 30px; font-size: 13px; }
.paper-footer { margin-top: 16px; font-size: 12px; }
</style>
