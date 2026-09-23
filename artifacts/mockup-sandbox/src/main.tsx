import React from 'react';
import { createRoot } from 'react-dom/client';
import './mockup.css';
import { Current } from './components/mockups/account-summary/Current';
import { Ledger } from './components/mockups/account-summary/Ledger';
import { Scorecard } from './components/mockups/account-summary/Scorecard';

const previews = { Current, Ledger, Scorecard } as const;
type PreviewName = keyof typeof previews;

function App() {
  const requestedName = window.location.pathname.split('/').filter(Boolean).pop() as PreviewName | undefined;
  const Preview = requestedName && requestedName in previews ? previews[requestedName] : Current;

  return <Preview />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);