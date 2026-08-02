import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ✅ Silencia logs de debug em PRODUÇÃO. O código tem ~153 console.log
// espalhados (inclusive com dados de perfil/venda) que vazavam no DevTools
// de qualquer visitante. Em vez de editar 153 lugares, desativamos no build
// de produção. console.error/warn são mantidos para erros reais.
// Em desenvolvimento (import.meta.env.DEV) nada muda.
if (!import.meta.env.DEV) {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)