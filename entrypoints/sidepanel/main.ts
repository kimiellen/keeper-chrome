import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import App from './App.vue';

browser.runtime.connect({ name: 'sidepanel' });

browser.runtime.onMessage.addListener((message: { type: string }) => {
  if (message.type === 'CLOSE_SIDEPANEL') {
    window.close();
  }
});

const app = createApp(App);
app.use(createPinia());
app.use(ElementPlus);
app.mount('#app');
