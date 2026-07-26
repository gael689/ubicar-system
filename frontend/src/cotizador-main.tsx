import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { CotizadorPage } from '@/pages/cotizador/CotizadorPage';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <CotizadorPage />
    </div>
    <Toaster richColors position="top-right" />
  </React.StrictMode>
);
