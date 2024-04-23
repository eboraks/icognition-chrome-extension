import { createApp } from 'vue'
import Sidepanel from './components/Sidepanel.vue'
import PrimeVue from 'primevue/config';
import 'primeflex/primeflex.css'
import "primevue/resources/themes/lara-light-blue/theme.css";
import 'primeicons/primeicons.css'


//createApp(Sidepanel).mount('#app')
createApp(Sidepanel).use(PrimeVue).mount('#app')