import { createApp } from 'vue'
import App from './App.vue'

// PrimeVue and PrimeFlex
import PrimeVue from 'primevue/config';
import "primevue/resources/themes/lara-light-blue/theme.css";
import 'primeflex/primeflex.css'
import 'primeicons/primeicons.css'

// PrimeVue Components
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import TabPanel from 'primevue/tabpanel';
import TabView from 'primevue/tabview';
import Card from 'primevue/card';
import InputText from 'primevue/inputtext';
import ProgressBar from 'primevue/progressbar';

const app = createApp(App);

app.use(PrimeVue).mount('#app')
app.component('Button', Button)
app.component('Skeleton', Skeleton)
app.component('TabPanel', TabPanel)
app.component('TabView', TabView)
app.component('Card', Card)
app.component('InputText', InputText)
app.component('ProgressBar', ProgressBar)
