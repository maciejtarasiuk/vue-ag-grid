import { createApp } from 'vue'
import App from './App.vue'
import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css'; 


// Register all Community features
ModuleRegistry.registerModules([AllCommunityModule]);

createApp(App).mount('#app')
