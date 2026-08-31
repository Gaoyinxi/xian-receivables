import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthGate } from './auth-gate';
import '../../../app/globals.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate />
  </React.StrictMode>,
);
