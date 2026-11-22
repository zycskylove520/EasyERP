import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

/** Vite 配置：启用 Vue 插件，开发时把 /api 代理到 NestJS 后端。 */
export default defineConfig({
  // Electron 用 file:// 加载，资源必须走相对路径，否则 /assets/... 会指到磁盘根目录导致白屏
  base: './',
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
