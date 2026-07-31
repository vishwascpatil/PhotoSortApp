import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { setupMockApi } from './mockApi'

setupMockApi()

// Setup frontend error logging
if (window.photoVault && window.photoVault.logError) {
  const originalConsoleError = console.error
  console.error = (...args) => {
    window.photoVault.logError('RENDERER_CONSOLE_ERROR', args.join(' '))
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
    <App />
  </React.StrictMode>
)
