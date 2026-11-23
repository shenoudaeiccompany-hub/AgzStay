import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { migrateLegacyStorageKeys } from '@/services/agzstayRepository';
import { registerServiceWorker } from '@/utils/swRegistration';
import { App } from './App';
import './index.css';

migrateLegacyStorageKeys();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
