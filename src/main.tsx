/* Main entry point for the application - renders the root React component */
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './main.css'

// Registro do Service Worker para suporte a PWA (App instalável)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        if (import.meta.env.DEV) {
          console.debug('[PWA] Service Worker registrado com escopo:', reg.scope)
        }
      })
      .catch((err) => {
        console.warn('[PWA] Falha ao registrar Service Worker:', err)
      })
  })
}

// @skip-protected: Do not remove. Required for React rendering.
createRoot(document.getElementById('root')!).render(<App />)
