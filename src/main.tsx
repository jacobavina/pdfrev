import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './store/testHooks';
import { applyTheme, readStoredTheme } from './store/useUiStore';

// Aplicar el tema antes del primer render para evitar un parpadeo de colores
applyTheme(readStoredTheme());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
