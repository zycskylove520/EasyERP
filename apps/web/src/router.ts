import { createRouter, createWebHashHistory } from 'vue-router';

/** 应用路由：按业务模块分组。file:// 下只能用 hash 模式，history 模式会跳到不存在的路径。 */
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/overview' },
    {
      path: '/overview',
      name: 'overview',
      component: () => import('./views/OverviewView.vue'),
      meta: { title: '概览', group: '概览' },
    },
    // 财务管理
    { path: '/finance', name: 'finance', component: () => import('./views/FinanceOverviewView.vue'), meta: { title: '财务概览', group: '财务管理' } },
    { path: '/finance/receivables', name: 'finance-receivables', component: () => import('./views/FinanceReceivableView.vue'), meta: { title: '收款管理', group: '财务管理' } },
    { path: '/finance/payables', name: 'finance-payables', component: () => import('./views/FinancePayableView.vue'), meta: { title: '付款管理', group: '财务管理' } },
    {
      path: '/company-info',
      name: 'company-info',
      component: () => import('./views/CompanyInfoView.vue'),
      meta: { title: '公司基础信息', group: '基础数据' },
    },
    {
      path: '/categories',
      name: 'categories',
      component: () => import('./views/CategoriesView.vue'),
      meta: { title: '产品品类', group: '基础数据' },
    },
    {
      path: '/categories/:biz',
      name: 'categories-biz',
      component: () => import('./views/CategoriesView.vue'),
      meta: { title: '产品品类', group: '基础数据' },
    },
    {
      path: '/products',
      name: 'products',
      component: () => import('./views/ProductsView.vue'),
      meta: { title: '货品管理', group: '基础数据' },
    },
    {
      path: '/products/:biz',
      name: 'products-biz',
      component: () => import('./views/ProductsView.vue'),
      meta: { title: '货品管理', group: '基础数据' },
    },
    {
      path: '/suppliers',
      name: 'suppliers',
      component: () => import('./views/SuppliersView.vue'),
      meta: { title: '供货商', group: '基础数据' },
    },
    {
      path: '/customers',
      name: 'customers',
      component: () => import('./views/CustomersView.vue'),
      meta: { title: '客户', group: '基础数据' },
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('./views/InventoryView.vue'),
      meta: { title: '当前库存', group: '库存' },
    },
    {
      path: '/inventory/adjust',
      name: 'inventory-adjust',
      component: () => import('./views/InventoryAdjustView.vue'),
      meta: { title: '库存调整', group: '库存' },
    },
    {
      path: '/inventory/ledger',
      name: 'inventory-ledger',
      component: () => import('./views/InventoryLedgerView.vue'),
      meta: { title: '库存流水', group: '库存' },
    },
    {
      path: '/quotations',
      name: 'quotations',
      component: () => import('./views/QuotationsView.vue'),
      meta: { title: '报价单', group: '业务单据' },
    },
    {
      path: '/quotations/new',
      name: 'quotation-new',
      component: () => import('./views/QuotationFormView.vue'),
      meta: { title: '新建报价单', group: '业务单据' },
    },
    {
      path: '/quotations/rejected',
      name: 'quotations-rejected',
      component: () => import('./views/RejectedQuotationsView.vue'),
      meta: { title: '打回单据', group: '业务单据' },
    },
    {
      path: '/quotations/:id/edit',
      name: 'quotation-edit',
      component: () => import('./views/QuotationFormView.vue'),
      meta: { title: '编辑报价单', group: '业务单据' },
    },
    {
      path: '/quotations/:id/print',
      name: 'quotation-print',
      component: () => import('./views/QuotationPrintView.vue'),
      meta: { title: '报价单打印', group: '业务单据' },
    },

    // 订购单
    { path: '/purchase-orders', name: 'purchase-orders', component: () => import('./views/PurchaseOrdersView.vue'), meta: { title: '订购单', group: '业务单据' } },
    { path: '/purchase-orders/rejected', name: 'purchase-orders-rejected', component: () => import('./views/RejectedDocsView.vue'), meta: { title: '订购单打回', group: '业务单据' } },
    { path: '/purchase-orders/new', name: 'purchase-order-new', component: () => import('./views/PurchaseOrderFormView.vue'), meta: { title: '新建订购单', group: '业务单据' } },
    { path: '/purchase-orders/:id/edit', name: 'purchase-order-edit', component: () => import('./views/PurchaseOrderFormView.vue'), meta: { title: '编辑订购单', group: '业务单据' } },
    { path: '/purchase-orders/:id/print', name: 'purchase-order-print', component: () => import('./views/PurchaseOrderPrintView.vue'), meta: { title: '订购单打印', group: '业务单据' } },

    // 送货单
    { path: '/delivery-notes', name: 'delivery-notes', component: () => import('./views/DeliveryNotesView.vue'), meta: { title: '送货单', group: '业务单据' } },
    { path: '/delivery-notes/rejected', name: 'delivery-notes-rejected', component: () => import('./views/RejectedDocsView.vue'), meta: { title: '送货单打回', group: '业务单据' } },
    { path: '/delivery-notes/new', name: 'delivery-note-new', component: () => import('./views/DeliveryNoteFormView.vue'), meta: { title: '新建送货单', group: '业务单据' } },
    { path: '/delivery-notes/:id/edit', name: 'delivery-note-edit', component: () => import('./views/DeliveryNoteFormView.vue'), meta: { title: '编辑送货单', group: '业务单据' } },
    { path: '/delivery-notes/:id/print', name: 'delivery-note-print', component: () => import('./views/DeliveryNotePrintView.vue'), meta: { title: '送货单打印', group: '业务单据' } },

    // 对帐单
    { path: '/statements', name: 'statements', component: () => import('./views/StatementsView.vue'), meta: { title: '对帐单', group: '业务单据' } },
    { path: '/statements/rejected', name: 'statements-rejected', component: () => import('./views/RejectedDocsView.vue'), meta: { title: '对帐单打回', group: '业务单据' } },
    { path: '/statements/new', name: 'statement-new', component: () => import('./views/StatementFormView.vue'), meta: { title: '新建对帐单', group: '业务单据' } },
    { path: '/statements/:id/edit', name: 'statement-edit', component: () => import('./views/StatementFormView.vue'), meta: { title: '编辑对帐单', group: '业务单据' } },
    { path: '/statements/:id/print', name: 'statement-print', component: () => import('./views/StatementPrintView.vue'), meta: { title: '对帐单打印', group: '业务单据' } },
  ],
});
