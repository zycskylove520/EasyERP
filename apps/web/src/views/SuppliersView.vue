<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { suppliersApi, categoriesApi, ApiError } from '../api';
import type { Supplier, Category } from '../types';
import { checkRequired } from '../validation';

const suppliers = ref<Supplier[]>([]);
/** 供货品类，供经营品种标签快捷选择 */
const supplyCategories = ref<Category[]>([]);
const error = ref('');
const showForm = ref(false);
const editingId = ref<number | null>(null);
const form = ref({ name: '', contact: '', phone: '', address: '', businessTypes: '' });
const tagInput = ref('');

const SEP = '、';
/** 拆分标签字符串（兼容逗号/顿号/分号分隔的旧数据） */
function splitTags(v: string | null | undefined): string[] {
  return (v ?? '').split(/[,，、;；]+/).map((s) => s.trim()).filter(Boolean);
}
/** 当前表单的标签数组 */
function formTags(): string[] { return splitTags(form.value.businessTypes); }
function addTag(raw: string) {
  const tag = raw.trim();
  if (!tag) return;
  const tags = formTags();
  if (!tags.includes(tag)) tags.push(tag);
  form.value.businessTypes = tags.join(SEP);
  tagInput.value = '';
}
function removeTag(tag: string) {
  form.value.businessTypes = formTags().filter((t) => t !== tag).join(SEP);
}
/** 从供货品类下拉选中后加入标签 */
function onCategoryPick(e: Event) {
  const sel = e.target as HTMLSelectElement;
  const cat = supplyCategories.value.find((c) => c.id === Number(sel.value));
  if (cat) addTag(cat.name);
  sel.value = '';
}
/** 列表里把标签字符串拆成 chips 显示 */
function tagsOf(v: string | null | undefined): string[] { return splitTags(v); }

async function load() {
  error.value = '';
  try {
    const [list, cats] = await Promise.all([
      suppliersApi.list(),
      categoriesApi.list({ bizType: 'SUPPLY' }),
    ]);
    suppliers.value = list;
    supplyCategories.value = cats;
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
}
onMounted(load);

function openCreate() {
  editingId.value = null;
  form.value = { name: '', contact: '', phone: '', address: '', businessTypes: '' };
  tagInput.value = '';
  showForm.value = true;
}
function openEdit(s: Supplier) {
  editingId.value = s.id;
  form.value = { name: s.name, contact: s.contact ?? '', phone: s.phone ?? '', address: s.address ?? '', businessTypes: s.businessTypes ?? '' };
  tagInput.value = '';
  showForm.value = true;
}
async function save() {
  error.value = '';
  const err = checkRequired(form.value.name, '供货商名称');
  if (err) { error.value = err; return; }
  try {
    if (editingId.value) await suppliersApi.update(editingId.value, form.value);
    else await suppliersApi.create(form.value);
    showForm.value = false;
    await load();
  } catch (e) { error.value = e instanceof ApiError ? e.message : '保存失败'; }
}
async function remove(s: Supplier) {
  if (!confirm(`确定删除供货商「${s.name}」？`)) return;
  try { await suppliersApi.remove(s.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '删除失败'; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">供货商</h1>
      <button class="btn btn-primary" @click="openCreate">+ 新增供货商</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="showForm" class="card">
      <h3>{{ editingId ? '编辑供货商' : '新增供货商' }}</h3>
      <div class="row"><div class="field"><label>名称</label><input v-model="form.name" /></div>
        <div class="field"><label>联系人</label><input v-model="form.contact" /></div></div>
      <div class="row"><div class="field"><label>电话</label><input v-model="form.phone" /></div>
        <div class="field"><label>地址</label><input v-model="form.address" /></div></div>
      <div class="field">
        <label>经营品种（可从供货品类选，也可自由填写，支持多个）</label>
        <div class="tag-box">
          <span v-for="t in formTags()" :key="t" class="tag-chip">
            {{ t }}
            <button type="button" class="tag-x" @click="removeTag(t)" title="移除">×</button>
          </span>
          <input
            v-model="tagInput"
            class="tag-input"
            placeholder="输入后回车添加"
            @keydown.enter.prevent="addTag(tagInput)"
            @blur="addTag(tagInput)"
          />
        </div>
        <div class="row" style="margin-top:8px; align-items:center">
          <div class="field" style="margin-bottom:0">
            <select @change="onCategoryPick">
              <option value="">＋ 从供货品类选择…</option>
              <option v-for="c in supplyCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </div>
        </div>
      </div>
      <div class="actions"><button class="btn btn-primary" @click="save">保存</button>
        <button class="btn" @click="showForm = false">取消</button></div>
    </div>

    <div class="card">
      <table class="data">
        <thead><tr><th>名称</th><th>联系人</th><th>电话</th><th>经营品种</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="s in suppliers" :key="s.id">
            <td>{{ s.name }}</td><td>{{ s.contact || '-' }}</td><td>{{ s.phone || '-' }}</td>
            <td>
              <span v-for="t in tagsOf(s.businessTypes)" :key="t" class="tag-chip" style="margin-right:4px">{{ t }}</span>
              <span v-if="!tagsOf(s.businessTypes).length" class="muted">-</span>
            </td>
            <td class="actions">
              <button class="btn btn-sm" @click="openEdit(s)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="remove(s)">删除</button>
            </td>
          </tr>
          <tr v-if="!suppliers.length"><td colspan="5" class="muted">暂无供货商</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.tag-box {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  border: 1px solid #d1d5db; border-radius: 6px; padding: 6px 8px; min-height: 38px;
}
.tag-box:focus-within { border-color: #2563eb; }
.tag-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: #dbeafe; color: #1d4ed8; border-radius: 4px;
  padding: 3px 7px; font-size: 12px;
}
.tag-x { border: none; background: none; cursor: pointer; color: #1d4ed8; font-size: 14px; line-height: 1; padding: 0; }
.tag-input { border: none; outline: none; flex: 1; min-width: 120px; padding: 4px; width: auto; }
</style>
