import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import { setupMockApi } from './mockApi'

setupMockApi()

// Setup frontend error logging
if (window.photoVault && window.photoVault.logError) {
  const originalConsoleError = console.error
  console.error = (...args) => {
    const formatted = args
      .map(a => (a instanceof Error ? a.stack || a.message : typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ')
    window.photoVault.logError('RENDERER_CONSOLE_ERROR', formatted)
    originalConsoleError.apply(console, args)
  }

  window.addEventListener('error', (event) => {
    window.photoVault.logError('RENDERER_WINDOW_ERROR', event.error?.stack || event.message)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.stack || reason.message : String(reason)
    window.photoVault.logError('RENDERER_UNHANDLED_REJECTION', message)
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
