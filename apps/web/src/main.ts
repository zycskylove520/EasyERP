import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import { numeric } from './validation';
import './style.css';

createApp(App).use(router).directive('numeric', numeric).mount('#app');
