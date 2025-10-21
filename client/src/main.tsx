import React from 'react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import './styles/theme.css';
import App from './App';
import { SimpleApp } from './SimpleApp';

// Use SimpleApp by default, App for debug mode (?debug=1)
const isDebugMode = new URLSearchParams(window.location.search).get('debug') === '1';
const AppComponent = isDebugMode ? App : SimpleApp;

// Ensure dark theme is applied globally
if (!document.documentElement.classList.contains('theme-dark')) {
  document.documentElement.classList.add('theme-dark');
}

const root = createRoot(document.getElementById('root')!);
root.render(<StrictMode><AppComponent /></StrictMode>);
