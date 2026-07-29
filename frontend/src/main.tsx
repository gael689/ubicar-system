import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import { queryClient } from './lib/queryClient';
import './index.css';

// `clerk init` dejó el provider sin la key: sin esto el arranque explota con
// un error que no explica nada. Se falla acá, con un mensaje que dice qué
// hacer, en vez de dejar que reviente adentro de la librería.
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error(
    'Falta VITE_CLERK_PUBLISHABLE_KEY. Corré `clerk env pull` dentro de frontend/.',
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster richColors position="top-right" />
      </QueryClientProvider>
    </ClerkProvider>
  </React.StrictMode>
);
