<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { productsApi, inventoryApi, ApiError } from '../api';
import type { Product } from '../types';
import { checkNumeric, checkRequired, firstError } from '../validation';

const products = ref<Product[]>([]);
const error = ref('');
const msg = ref('');
const mode = ref<'initial' | 'adjust'>('initial');
const formProduct = ref<number | undefined>(undefined);
const formQuantity = ref<number>(0);
const formNote = ref('');

onMounted(async () => {
  try { products.value = await productsApi.list(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载货品失败'; }
});

async function submit() {
  error.value = ''; msg.value = '';
  const err = firstError(
    checkRequired(formProduct.value, '货品'),
    checkNumeric(formQuantity.value, '数量', { required: true, allowNegative: true }),
  );
  if (err) { error.value = err; return; }
  try {
    if (mode.value === 'initial') {
      await inventoryApi.setInitial(formProduct.value!, formQuantity.value, formNote.value || undefined);
      msg.value = '期初已设置';
    } else {
      await inventoryApi.adjust(formProduct.value!, formQuantity.value, formNote.value || undefined);
      msg.value = '库存调整已记录';
    }
    formNote.value = ''; formQuantity.value = 0;
  } catch (e) { error.value = e instanceof ApiError ? e.message : '操作失败'; }
}
</script>

<template>
  <div>
    <div class="page-header"><h1 class="page-title">库存调整</h1></div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="msg" class="card" style="color:#16a34a">{{ msg }}</div>

    <div class="card">
      <div class="row">
        <div class="field" style="max-width:160px"><label>操作</label>
          <select v-model="mode"><option value="initial">设置期初</option><option value="adjust">手工调整</option></select>
        </div>
        <div class="field"><label>货品</label>
          <select v-model.number="formProduct">
            <option :value="undefined">请选择</option>
            <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}（{{ p.categoryName }}）</option>
          </select>
        </div>
        <div class="field"><label>{{ mode === 'initial' ? '期初数量' : '增减数量（填负数表示扣减库存）' }}</label>
          <input type="number" step="any" v-numeric="{ allowNegative: true }" v-model.number="formQuantity" /></div>
        <div class="field"><label>备注</label><input v-model="formNote" /></div>
      </div>
      <button class="btn btn-primary" @click="submit">提交</button>
      <p class="muted" style="font-size:12px; margin-top:8px">
        期初每个货品只能设置一次；手工调整填增减数量（负数=扣减），每次调整都会记入库存流水。
      </p>
    </div>
  </div>
</template>
