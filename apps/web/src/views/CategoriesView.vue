<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { categoriesApi, ApiError } from '../api';
import type { BizType, Category, CategoryInput, SpecField } from '../types';
import { checkRequired, firstError } from '../validation';

const route = useRoute();
/** 当前业务域：/categories/supply → SUPPLY，其它 → SALE（与原 /categories 路由兼容）。 */
const bizType = computed<BizType>(() => route.params.biz === 'supply' ? 'SUPPLY' : 'SALE');
const title = computed(() => bizType.value === 'SUPPLY' ? '供货品类' : '销售品类');

const categories = ref<Category[]>([]);
/** 全部品类（不受筛选影响），供模块下拉建议 */
const allCategories = ref<Category[]>([]);
/** 已有模块（去重），供表单下拉建议；仍允许输入新模块。 */
const existingModules = computed(() => [...new Set(allCategories.value.map((c) => c.module))].filter(Boolean));
const error = ref('');
const showForm = ref(false);
const editingId = ref<number | null>(null);
const form = ref<CategoryInput>({ name: '', module: '', sortOrder: 0, specSchema: [] });
const filter = ref({ name: '', module: '' });

async function load() {
  try {
    [categories.value, allCategories.value] = await Promise.all([
      categoriesApi.list({ name: filter.value.name || undefined, module: filter.value.module || undefined, bizType: bizType.value }),
      categoriesApi.list({ bizType: bizType.value }),
    ]);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
}
onMounted(load);
watch(() => route.params.biz, load);

function newField(): SpecField {
  return { key: '', label: '', type: 'text', unit: '', reserved: false };
}
function openCreate() {
  editingId.value = null;
  form.value = { name: '', module: '', bizType: bizType.value, sortOrder: categories.value.length, specSchema: [newField()] };
  showForm.value = true;
}
function openEdit(c: Category) {
  editingId.value = c.id;
  form.value = {
    name: c.name, module: c.module, bizType: c.bizType, sortOrder: c.sortOrder,
    specSchema: c.specSchema.map((f) => ({ ...f })),
  };
  showForm.value = true;
}
function addField() { form.value.specSchema!.push(newField()); }
function removeField(i: number) { form.value.specSchema!.splice(i, 1); }

async function save() {
  error.value = '';
  // 必填校验：品类名称、模块；规格字段若填了 key 则 label 必填（清掉完全空行）
  const errs: Array<string | null> = [
    checkRequired(form.value.name, '品类名称'),
    checkRequired(form.value.module, '模块'),
  ];
  form.value.specSchema!.forEach((f, i) => {
    if ((f.key ?? '').trim() && !(f.label ?? '').trim()) {
      errs.push(`第 ${i + 1} 个规格字段的显示名不能为空`);
    }
  });
  const err = firstError(...errs);
  if (err) { error.value = err; return; }
  // 清掉完全空的字段行
  form.value.specSchema = form.value.specSchema!.filter((f) => f.key.trim() && f.label.trim());
  try {
    if (editingId.value) await categoriesApi.update(editingId.value, form.value);
    else await categoriesApi.create(form.value);
    showForm.value = false;
    await load();
  } catch (e) { error.value = e instanceof ApiError ? e.message : '保存失败'; }
}
async function remove(c: Category) {
  if (!confirm(`确定删除品类「${c.name}」？`)) return;
  error.value = '';
  try { await categoriesApi.remove(c.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '删除失败'; }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ title }}</h1>
      <button class="btn btn-primary" @click="openCreate">+ 新增品类</button>
    </div>
    <div class="card">
      <div class="row" style="align-items:flex-end">
        <div class="field" style="margin-bottom:0"><label>品类</label>
          <input v-model="filter.name" placeholder="输入品类名称搜索" @keyup.enter="load" /></div>
        <div class="field" style="margin-bottom:0"><label>模块</label>
          <input v-model="filter.module" placeholder="输入模块搜索" @keyup.enter="load" /></div>
        <div class="field" style="margin-bottom:0; flex:0 0 auto">
          <button class="btn btn-primary" @click="load">筛选</button>
          <button class="btn" style="margin-left:6px" @click="filter = { name: '', module: '' }; load()">重置</button>
        </div>
      </div>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="showForm" class="card">
      <h3>{{ editingId ? '编辑品类' : '新增品类' }}</h3>
      <div class="row">
        <div class="field"><label>品类名称</label><input v-model="form.name" /></div>
        <div class="field">
          <label>模块（选已有或输入新的）</label>
          <input v-model="form.module" list="module-options" />
          <datalist id="module-options">
            <option v-for="m in existingModules" :key="m" :value="m"></option>
          </datalist>
        </div>
        <div class="field" style="max-width:140px">
          <label>序号（自动）</label>
          <input :value="editingId ? form.sortOrder : '新增时自动'" disabled style="background:#f3f4f6" />
        </div>
      </div>

      <div class="field">
        <label>规格字段（可自定义增删；已被货品使用的字段不能删除或改标识）</label>
        <p class="muted" style="font-size:12px; margin:0 0 8px">
          「预留」= 暂时不启用的字段：先建好、前端不显示，以后要用时勾选取消预留即可，无需改表。
        </p>
        <table class="data">
          <thead><tr><th>标识(key)</th><th>显示名</th><th>类型</th><th>单位</th><th>预留</th><th></th></tr></thead>
          <tbody>
            <tr v-for="(f, i) in form.specSchema" :key="i">
              <td><input v-model="f.key" placeholder="如 diameter" /></td>
              <td><input v-model="f.label" placeholder="如 直径" /></td>
              <td><select v-model="f.type"><option value="text">文本</option><option value="number">数字</option></select></td>
              <td><input v-model="f.unit" placeholder="MM" /></td>
              <td><input type="checkbox" v-model="f.reserved" style="width:auto" /></td>
              <td><button class="btn btn-sm btn-danger" @click="removeField(i)">删</button></td>
            </tr>
            <tr v-if="!form.specSchema!.length"><td colspan="6" class="muted">暂无规格字段，点下方添加</td></tr>
          </tbody>
        </table>
        <button class="btn btn-sm" style="margin-top:8px" @click="addField">+ 添加规格字段</button>
      </div>

      <div class="actions">
        <button class="btn btn-primary" @click="save">保存</button>
        <button class="btn" @click="showForm = false">取消</button>
      </div>
    </div>

    <div class="card">
      <table class="data">
        <thead><tr><th>序号</th><th>品类</th><th>模块</th><th>规格字段</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="c in categories" :key="c.id">
            <td>{{ c.sortOrder }}</td>
            <td>{{ c.name }}</td>
            <td>{{ c.module }}</td>
            <td>
              <span v-for="f in c.specSchema.filter(f => !f.reserved)" :key="f.key" class="badge badge-DRAFT" style="margin-right:6px">
                {{ f.label }}<template v-if="f.unit"> ({{ f.unit }})</template>
              </span>
              <span v-if="c.specSchema.some(f => f.reserved)" class="muted" style="font-size:12px">
                +{{ c.specSchema.filter(f => f.reserved).length }} 预留
              </span>
            </td>
            <td class="actions">
              <button class="btn btn-sm" @click="openEdit(c)">编辑</button>
              <button class="btn btn-sm btn-danger" @click="remove(c)">删除</button>
            </td>
          </tr>
          <tr v-if="!categories.length"><td colspan="5" class="muted">暂无品类</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
