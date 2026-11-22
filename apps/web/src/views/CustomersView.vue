<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { customersApi, ApiError } from '../api';
import type { Customer } from '../types';
import { checkRequired } from '../validation';

const customers = ref<Customer[]>([]);
const error = ref('');
const showForm = ref(false);
const editingId = ref<number | null>(null);
const form = ref({ name: '', contact: '', phone: '', address: '' });

async function load() {
  try { customers.value = await customersApi.list(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
}
onMounted(load);

function openCreate() {
  editingId.value = null;
  form.value = { name: '', contact: '', phone: '', address: '' };
  showForm.value = true;
}
function openEdit(c: Customer) {
  editingId.value = c.id;
  form.value = { name: c.name, contact: c.contact ?? '', phone: c.phone ?? '', address: c.address ?? '' };
  showForm.value = true;
}
async function save() {
  error.value = '';
  const err = checkRequired(form.value.name, '客户名称');
  if (err) { error.value = err; return; }
  try {
    if (editingId.value) await customersApi.update(editingId.value, form.value);
    else await customersApi.create(form.value);
    showForm.value = false;
    await load();
  } catch (e) { error.value = e instanceof ApiError ? e.message : '保存失败'; }
}
async function remove(c: Customer) {
  if (!confirm(`确定删除客户「${c.name}」？`)) return;
  try { await customersApi.remove(c.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '删除失败'; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">客户</h1>
      <button class="btn btn-primary" @click="openCreate">+ 新增客户</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="showForm" class="card">
      <h3>{{ editingId ? '编辑客户' : '新增客户' }}</h3>
      <div class="row"><div class="field"><label>名称</label><input v-model="form.name" /></div>
        <div class="field"><label>联系人</label><input v-model="form.contact" /></div></div>
      <div class="row"><div class="field"><label>电话</label><input v-model="form.phone" /></div>
        <div class="field"><label>地址</label><input v-model="form.address" /></div></div>
      <div class="actions"><button class="btn btn-primary" @click="save">保存</button>
        <button class="btn" @click="showForm = false">取消</button></div>
    </div>

    <div class="card">
      <table class="data">
        <thead><tr><th>名称</th><th>联系人</th><th>电话</th><th>地址</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="c in customers" :key="c.id">
            <td>{{ c.name }}</td><td>{{ c.contact || '-' }}</td><td>{{ c.phone || '-' }}</td>
            <td>{{ c.address || '-' }}</td>
            <td class="actions">
              <button class="btn btn-sm" @click="openEdit(c)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="remove(c)">删除</button>
            </td>
          </tr>
          <tr v-if="!customers.length"><td colspan="5" class="muted">暂无客户</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
