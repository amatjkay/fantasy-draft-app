import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/modern.css';
import App from './App';

// Ensure dark theme is applied globally
if (!document.documentElement.classList.contains('theme-dark')) {
  document.documentElement.classList.add('theme-dark');
}

const root = createRoot(document.getElementById('root')!);
root.render(<StrictMode><App /></StrictMode>);
