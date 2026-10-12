import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './store/testHooks';
import { applyTheme, readStoredTheme, followSystemTheme, useUiStore } from './store/useUiStore';

// Aplicar el tema antes del primer render para evitar un parpadeo de colores
applyTheme(readStoredTheme());
// Mientras el usuario no elija un tema, REA sigue al del sistema también si cambia con la app abierta
followSystemTheme((theme) => {
  applyTheme(theme);
  useUiStore.setState({ theme });
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
