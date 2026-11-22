<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { productsApi, categoriesApi, ApiError } from '../api';
import type { BizType, Product, Category, SpecField } from '../types';
import { checkNumeric, checkRequired, firstError } from '../validation';

const route = useRoute();
/** 当前业务域：/products/supply → SUPPLY，其它 → SALE（与原 /products 路由兼容）。 */
const bizType = computed<BizType>(() => route.params.biz === 'supply' ? 'SUPPLY' : 'SALE');
const title = computed(() => bizType.value === 'SUPPLY' ? '供货货品' : '销售货品');

const products = ref<Product[]>([]);
const categories = ref<Category[]>([]);
const error = ref('');
const filterCategory = ref<number | undefined>(undefined);
const showForm = ref(false);
const editingId = ref<number | null>(null);
const form = ref({ categoryId: 0, name: '', unit: '个', specs: {} as Record<string, unknown> });

const selectedCategory = computed(() => categories.value.find(c => c.id === form.value.categoryId));
const visibleFields = computed(() => selectedCategory.value?.specSchema.filter(f => !f.reserved) ?? []);

async function load() {
  try {
    [products.value, categories.value] = await Promise.all([
      productsApi.list(filterCategory.value, bizType.value),
      categoriesApi.list({ bizType: bizType.value }),
    ]);
  } catch (e) { error.value = e instanceof ApiError ? e.message : '加载失败'; }
}
onMounted(load);
watch(filterCategory, load);
watch(() => route.params.biz, load);

function openCreate() {
  editingId.value = null;
  form.value = { categoryId: categories.value[0]?.id ?? 0, name: '', unit: '个', specs: {} };
  showForm.value = true;
}
function openEdit(p: Product) {
  editingId.value = p.id;
  form.value = { categoryId: p.categoryId, name: p.name, unit: p.unit, specs: { ...p.specs } };
  showForm.value = true;
}
// 注意：不要用 watch 监听 categoryId 来清 specs —— openEdit 里编程式赋值 categoryId
// 会误触发 watch，把刚载入的原规格清空（曾导致「规格被清空」的 bug）。
// 用户主动切换品类时，由下拉框的 @change 显式调用 onCategoryChange 清理。
function onCategoryChange() {
  form.value.specs = {};
}
/** 显式写入规格值，保证响应式生效。 */
function setSpec(key: string, value: unknown) {
  form.value.specs[key] = value;
}

async function save() {
  error.value = '';
  const errs: Array<string | null> = [
    checkRequired(form.value.categoryId, '品类'),
    checkRequired(form.value.name, '品名'),
  ];
  // 数字类规格字段校验
  for (const f of visibleFields.value) {
    if (f.type === 'number') {
      errs.push(checkNumeric(form.value.specs[f.key], `${f.label}`, { min: 0 }));
    }
  }
  const err = firstError(...errs);
  if (err) { error.value = err; return; }
  try {
    const input = { categoryId: form.value.categoryId, name: form.value.name, unit: form.value.unit, specs: form.value.specs, bizType: bizType.value };
    if (editingId.value) await productsApi.update(editingId.value, input);
    else await productsApi.create(input);
    showForm.value = false;
    await load();
  } catch (e) { error.value = e instanceof ApiError ? e.message : '保存失败'; }
}
async function remove(p: Product) {
  if (!confirm(`确定删除货品「${p.name}」？`)) return;
  try { await productsApi.remove(p.id); await load(); }
  catch (e) { error.value = e instanceof ApiError ? e.message : '删除失败'; }
}
/** 按品类分组：每组只展示该品类自己的规格字段，避免做成全局并集产生大量空列。
 *  分组顺序跟随品类列表（sortOrder），组内货品保持后端返回顺序。 */
interface ProductGroup {
  category: Category;
  fields: SpecField[];
  items: Product[];
}
const groupedProducts = computed<ProductGroup[]>(() => {
  const groups: ProductGroup[] = [];
  for (const cat of categories.value) {
    const items = products.value.filter((p) => p.categoryId === cat.id);
    if (!items.length) continue;
    const fields = cat.specSchema.filter((f) => !f.reserved);
    groups.push({ category: cat, fields, items });
  }
  return groups;
});
function specValue(p: Product, key: string): string {
  const v = p.specs?.[key];
  return v === undefined || v === null ? '-' : String(v);
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">{{ title }}</h1>
      <button class="btn btn-primary" @click="openCreate">+ 新增货品</button>
    </div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="showForm" class="card">
      <h3>{{ editingId ? '编辑货品' : '新增货品' }}</h3>
      <div class="row">
        <div class="field"><label>品类</label>
          <select v-model.number="form.categoryId" @change="onCategoryChange">
            <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="field"><label>品名</label><input v-model="form.name" /></div>
        <div class="field"><label>单位</label><input v-model="form.unit" /></div>
      </div>
      <div class="field" v-if="visibleFields.length">
        <label>规格参数（按品类动态生成）</label>
        <div style="display:flex; flex-direction:column; gap:10px; max-width:420px">
          <div v-for="f in visibleFields" :key="f.key">
            <label style="display:block; margin-bottom:4px">{{ f.label }}<template v-if="f.unit"> ({{ f.unit }})</template></label>
            <input
              v-numeric
              :type="f.type === 'number' ? 'number' : 'text'"
              :value="form.specs[f.key] ?? ''"
              @input="setSpec(f.key, f.type === 'number' ? Number(($event.target as HTMLInputElement).value) : ($event.target as HTMLInputElement).value)"
            />
          </div>
        </div>
      </div>
      <div class="actions"><button class="btn btn-primary" @click="save">保存</button>
        <button class="btn" @click="showForm = false">取消</button></div>
    </div>

    <div class="card">
      <div class="field" style="max-width:240px">
        <label>按品类筛选</label>
        <select v-model.number="filterCategory">
          <option :value="undefined">全部</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <div v-if="!products.length" class="card" style="text-align:center; color:#9ca3af">暂无货品</div>
      <div v-for="group in groupedProducts" :key="group.category.id" class="card" style="margin-bottom:16px">
        <h3 style="margin:0 0 10px; font-size:15px">
          {{ group.category.name }}
          <span class="muted" style="font-size:12px; font-weight:normal">（{{ group.items.length }} 个货品）</span>
        </h3>
        <div style="overflow-x:auto">
          <table class="data">
            <thead><tr>
              <th>品名</th>
              <th v-for="f in group.fields" :key="f.key">
                {{ f.label }}<template v-if="f.unit">({{ f.unit }})</template>
              </th>
              <th>单位</th><th>操作</th>
            </tr></thead>
            <tbody>
              <tr v-for="p in group.items" :key="p.id">
                <td>{{ p.name }}</td>
                <td v-for="f in group.fields" :key="f.key">{{ specValue(p, f.key) }}</td>
                <td>{{ p.unit }}</td>
                <td class="actions">
                  <button class="btn btn-sm" @click="openEdit(p)">编辑</button>
                  <button class="btn btn-sm btn-danger" @click="remove(p)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
