<script setup lang="ts">
import { ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();

/**
 * 可展开父节点：默认全部折叠，只展开当前路由所属的模块。
 * 刷新页面时用户能看到自己所在位置，其余子模块保持收起，侧边栏不杂乱。
 */
const expanded = ref<Record<string, boolean>>({});
function expandKeyOfPath(path: string): string | null {
  if (path.startsWith('/inventory')) return 'inventory';
  if (path.startsWith('/quotations')) return 'quotations';
  if (path.startsWith('/purchase-orders')) return 'purchase-orders';
  if (path.startsWith('/delivery-notes')) return 'delivery-notes';
  if (path.startsWith('/statements')) return 'statements';
  return null;
}
const activeExpandKey = expandKeyOfPath(route.path);
if (activeExpandKey) expanded.value[activeExpandKey] = true;
// 切换路由进入某模块时自动展开它（不影响用户手动折叠其它模块）
watch(() => route.path, (path) => {
  const key = expandKeyOfPath(path);
  if (key) expanded.value[key] = true;
});

interface NavLink { path: string; label: string; }
interface NavParent { label: string; expandKey: string; children: NavLink[]; }
type NavItem = NavLink | NavParent;
interface NavGroup { title: string; items: NavItem[]; }

const navGroups: NavGroup[] = [
  { title: '概览', items: [
    { path: '/overview', label: '数据概览' },
  ] },
  { title: '供货资料', items: [
    { path: '/categories/supply', label: '供货品类' },
    { path: '/products/supply', label: '供货货品' },
  ]},
  { title: '销售资料', items: [
    { path: '/categories/sale', label: '销售品类' },
    { path: '/products/sale', label: '销售货品' },
  ]},
  { title: '基础资料', items: [
    { path: '/suppliers', label: '供货商' },
    { path: '/customers', label: '客户' },
  ]},
  { title: '采购业务', items: [
    {
      label: '订购单',
      expandKey: 'purchase-orders',
      children: [
        { path: '/purchase-orders', label: '单据列表' },
        { path: '/purchase-orders/new', label: '新建订购单' },
        { path: '/purchase-orders/rejected', label: '打回单据' },
      ],
    },
  ] },
  { title: '销售业务', items: [
    {
      label: '报价单',
      expandKey: 'quotations',
      children: [
        { path: '/quotations', label: '单据列表' },
        { path: '/quotations/new', label: '新建报价单' },
        { path: '/quotations/rejected', label: '打回单据' },
      ],
    },
    {
      label: '送货单',
      expandKey: 'delivery-notes',
      children: [
        { path: '/delivery-notes', label: '单据列表' },
        { path: '/delivery-notes/new', label: '新建送货单' },
        { path: '/delivery-notes/rejected', label: '打回单据' },
      ],
    },
    {
      label: '对帐单',
      expandKey: 'statements',
      children: [
        { path: '/statements', label: '单据列表' },
        { path: '/statements/new', label: '新建对帐单' },
        { path: '/statements/rejected', label: '打回单据' },
      ],
    },
  ] },
  { title: '库存管理', items: [
    {
      label: '库存台账',
      expandKey: 'inventory',
      children: [
        { path: '/inventory', label: '当前库存' },
        { path: '/inventory/adjust', label: '库存调整' },
        { path: '/inventory/ledger', label: '库存流水' },
      ],
    },
  ] },
  { title: '财务管理', items: [
    { path: '/finance', label: '财务概览' },
    { path: '/finance/receivables', label: '收款管理' },
    { path: '/finance/payables', label: '付款管理' },
  ] },
  { title: '系统设置', items: [
    { path: '/company-info', label: '公司信息' },
  ] },
];

function isParent(item: NavItem): item is NavParent {
  return 'children' in item;
}
function itemKey(item: NavItem): string {
  return isParent(item) ? item.expandKey : item.path;
}

function isActive(path: string): boolean {
  // 「单据列表」覆盖各单据主流程（编辑/打印），但排除 /new 与 /rejected 子路由——
  // 它们分别由「新建XX单」「打回单据」独立高亮，做到互斥。
  const docBases = ['/quotations', '/purchase-orders', '/delivery-notes', '/statements'];
  if (docBases.includes(path)) {
    return route.path === path ||
      (route.path.startsWith(`${path}/`) && !route.path.startsWith(`${path}/rejected`) && !route.path.startsWith(`${path}/new`));
  }
  // 其余导航项（含 /xxx/new、/xxx/rejected、库存子项、基础数据）一律精确匹配，避免父子同时高亮
  return route.path === path;
}
function toggle(key: string) {
  expanded.value[key] = !expanded.value[key];
}
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">EasyERP</div>
      <div v-for="group in navGroups" :key="group.title" class="nav-group">
        <div class="nav-group-title">{{ group.title }}</div>
        <template v-for="item in group.items" :key="itemKey(item)">
          <!-- 可展开父节点 -->
          <div v-if="isParent(item)" class="nav-parent">
            <div class="nav-item nav-parent-btn" @click="toggle(item.expandKey)">
              <span>{{ item.label }}</span>
              <span class="nav-caret">{{ expanded[item.expandKey] ? '▾' : '▸' }}</span>
            </div>
            <div v-if="expanded[item.expandKey]" class="nav-children">
              <RouterLink
                v-for="child in item.children"
                :key="child.path"
                :to="child.path"
                class="nav-item nav-child"
                :class="{ active: isActive(child.path) }"
              >{{ child.label }}</RouterLink>
            </div>
          </div>
          <!-- 普通链接 -->
          <RouterLink
            v-else
            :to="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path) }"
          >{{ item.label }}</RouterLink>
        </template>
      </div>
    </aside>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>
