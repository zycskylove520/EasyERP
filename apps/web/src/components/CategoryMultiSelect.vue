<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Category } from '../types';

/** 品类多选下拉：支持输入文字搜索，已选项显示为可删除标签。 */
const props = defineProps<{
  categories: Category[];
  modelValue: number[];
}>();
const emit = defineEmits<{ 'update:modelValue': [value: number[]] }>();

const keyword = ref('');
const open = ref(false);

/** 按关键字过滤，排除已选的。 */
const options = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  const selected = new Set(props.modelValue);
  return props.categories.filter(
    (c) => !selected.has(c.id) && (!kw || c.name.toLowerCase().includes(kw)),
  );
});

function labelOf(id: number): string {
  return props.categories.find((c) => c.id === id)?.name ?? String(id);
}
function select(id: number) {
  emit('update:modelValue', [...props.modelValue, id]);
  keyword.value = '';
  open.value = false;
}
function remove(id: number) {
  emit('update:modelValue', props.modelValue.filter((v) => v !== id));
}
/** 失焦时延迟关闭，给点击下拉项的时间。 */
function closeDelayed() {
  window.setTimeout(() => (open.value = false), 150);
}
</script>

<template>
  <div class="ms">
    <div class="ms-tags">
      <span v-for="id in modelValue" :key="id" class="ms-tag">
        {{ labelOf(id) }}
        <button type="button" class="ms-x" @click="remove(id)" title="移除">×</button>
      </span>
      <span v-if="!modelValue.length" class="muted" style="font-size:12px">未选择</span>
    </div>
    <input
      v-model="keyword"
      class="ms-input"
      placeholder="输入文字搜索品类…"
      @focus="open = true"
      @input="open = true"
      @blur="closeDelayed"
    />
    <ul v-if="open && options.length" class="ms-list">
      <li v-for="c in options" :key="c.id" @mousedown.prevent="select(c.id)">
        {{ c.name }} <span class="muted" style="font-size:11px">{{ c.module }}</span>
      </li>
    </ul>
    <ul v-else-if="open" class="ms-list"><li class="muted">无匹配品类</li></ul>
  </div>
</template>

<style scoped>
.ms { position: relative; }
.ms-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; min-height: 22px; }
.ms-tag {
  display: inline-flex; align-items: center; gap: 4px;
  background: #dbeafe; color: #1d4ed8; border-radius: 4px;
  padding: 2px 6px; font-size: 12px;
}
.ms-x { border: none; background: none; cursor: pointer; color: #1d4ed8; font-size: 14px; line-height: 1; padding: 0; }
.ms-input { width: 100%; }
.ms-list {
  position: absolute; z-index: 20; top: 100%; left: 0; right: 0;
  margin: 2px 0 0; padding: 4px 0; list-style: none;
  background: #fff; border: 1px solid #d1d5db; border-radius: 6px;
  max-height: 200px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,.12);
}
.ms-list li { padding: 6px 10px; cursor: pointer; font-size: 13px; }
.ms-list li:hover { background: #f3f4f6; }
</style>
