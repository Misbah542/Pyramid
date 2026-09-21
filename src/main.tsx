import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { useSettingsStore } from '@/store/useSettingsStore';
import { applyTheme } from '@/lib/theme';

// Apply the persisted theme before first paint so the scene reads the right tokens.
applyTheme(useSettingsStore.getState().theme);

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
