import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App.jsx';

document.documentElement.classList.add('dark');

createRoot(document.querySelector('#app')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
