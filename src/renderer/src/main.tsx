import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import { setupMockApi } from './mockApi'

setupMockApi()

// Setup frontend error logging and UI thread hang detection
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

  // ─── UI Thread Hang Watchdog ──────────────────────────────────────────
  setupHangWatcher()
}

/**
 * Monitors the Renderer UI thread.
 * If JavaScript execution freezes/hangs for > 2.5s, it records the freeze
 * duration, DOM complexity, and memory metrics to app-errors.log.
 */
function setupHangWatcher() {
  if (!window.photoVault || !window.photoVault.logError) return

  let lastTick = Date.now()
  const INTERVAL = 1000
  const HANG_THRESHOLD = 2500

  setInterval(() => {
    const now = Date.now()
    const freezeDuration = now - lastTick - INTERVAL
    if (freezeDuration > HANG_THRESHOLD) {
      const memory = (performance as any)?.memory
        ? `Heap: ${Math.round((performance as any).memory.usedJSHeapSize / 1048576)}MB / ${Math.round((performance as any).memory.totalJSHeapSize / 1048576)}MB`
        : 'N/A'
      const domCount = document.querySelectorAll('*').length
      window.photoVault.logError(
        'UI_THREAD_HANG',
        `Renderer UI thread froze/hung for ${freezeDuration}ms.\nDOM Nodes: ${domCount}\nMemory: ${memory}`
      )
    }
    lastTick = now
  }, INTERVAL)

  // Long-task performance observer (>2.5s)
  if (typeof PerformanceObserver !== 'undefined') {
    try {
      const observer = new PerformanceObserver((entryList) => {
        for (const entry of entryList.getEntries()) {
          if (entry.duration > 2500) {
            window.photoVault.logError(
              'UI_LONG_TASK',
              `Blocking task detected on UI thread lasting ${Math.round(entry.duration)}ms.\nTask name: ${entry.name}`
            )
          }
        }
      })
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      // Ignore if longtask is unsupported in environment
    }
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
