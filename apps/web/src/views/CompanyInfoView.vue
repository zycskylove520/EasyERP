<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { companyInfoApi, ApiError } from '../api';
import type { CompanyInfo } from '../types';
import { checkRequired } from '../validation';

const form = ref<CompanyInfo>({
  id: 1, name: '', address: '', phone: '', fax: '', mobile: '',
  maker: '', businessScope: '', deliveryNoPrefix: null, currency: 'RMB',
});
const error = ref('');
const message = ref('');
const saving = ref(false);

onMounted(async () => {
  try { form.value = await companyInfoApi.get(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
});

async function save() {
  error.value = ''; message.value = '';
  const err = checkRequired(form.value.name, '公司名称');
  if (err) { error.value = err; return; }
  saving.value = true;
  try {
    form.value = await companyInfoApi.update(form.value);
    message.value = '已保存。各单据的抬头、电话、制单人等将自动使用这里的信息。';
  } catch (e) { error.value = e instanceof ApiError ? e.message : '保存失败'; }
  finally { saving.value = false; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">公司基础信息</h1>
    </div>
    <div class="card">
      <p class="muted" style="margin:0 0 16px">
        填写你自己的公司信息，报价单、订购单、送货单、对帐单的抬头与落款将自动使用这里的内容，无需逐单填写。
      </p>
      <div class="row">
        <div class="field"><label>公司名称（单据抬头/落款）</label><input v-model="form.name" /></div>
        <div class="field"><label>默认币制</label><input v-model="form.currency" /></div>
      </div>
      <div class="field"><label>地址</label><input v-model="form.address" /></div>
      <div class="row">
        <div class="field"><label>电话</label><input v-model="form.phone" /></div>
        <div class="field"><label>传真</label><input v-model="form.fax" /></div>
        <div class="field"><label>手机</label><input v-model="form.mobile" /></div>
      </div>
      <div class="field"><label>制单人（FM / FROM 默认值）</label><input v-model="form.maker" /></div>
      <div class="field"><label>经营范围（送货单显示）</label><input v-model="form.businessScope" /></div>
      <div class="field"><label>送货单号前缀（如填 YLD 则以 YLD 开头，留空用 DN）</label><input v-model="form.deliveryNoPrefix" placeholder="留空默认 DN" /></div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="message" class="card" style="border-left:4px solid #16a34a; color:#16a34a">{{ message }}</div>
    <div class="actions">
      <button class="btn btn-primary" :disabled="saving" @click="save">{{ saving ? '保存中…' : '保存' }}</button>
    </div>
  </div>
</template>
