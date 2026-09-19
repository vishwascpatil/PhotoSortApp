import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let logFilePath = path.join(process.cwd(), 'app-errors.log')
let mainWatchdogTimer: NodeJS.Timeout | null = null

export function setupLogger() {
  // Save the log file in the project root during dev, or userData in production
  if (app?.isPackaged) {
    logFilePath = path.join(app.getPath('userData'), 'app-errors.log')
  } else {
    logFilePath = path.join(process.cwd(), 'app-errors.log')
  }

  const originalConsoleError = console.error
  console.error = (...args) => {
    logErrorToFile('CONSOLE_ERROR', args.join(' '))
    originalConsoleError.apply(console, args)
  }

  process.on('uncaughtException', (error) => {
    logErrorToFile('UNCAUGHT_EXCEPTION', error.stack || error.message)
  })

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.stack || reason.message : String(reason)
    logErrorToFile('UNHANDLED_REJECTION', message)
  })

  // Start Node.js Main Process Event Loop Watchdog
  startMainProcessWatchdog()
}

export function logErrorToFile(type: string, message: string) {
  if (!logFilePath) return
  const timestamp = new Date().toISOString()
  const logEntry = `[${timestamp}] [${type}]\n${message}\n\n`
  try {
    fs.appendFileSync(logFilePath, logEntry)
  } catch (err) {
    // Silently fail if we can't write to the log file to avoid infinite loops
  }
}

/**
 * Monitors the Node.js main process event loop.
 * If the event loop gets blocked by synchronous I/O or CPU spikes for > 2.5s,
 * it records a MAIN_PROCESS_HANG error into app-errors.log.
 */
function startMainProcessWatchdog() {
  if (mainWatchdogTimer) return
  let lastTick = Date.now()
  const CHECK_INTERVAL = 1000
  const HANG_THRESHOLD = 2500

  mainWatchdogTimer = setInterval(() => {
    const now = Date.now()
    const lag = now - lastTick - CHECK_INTERVAL
    if (lag > HANG_THRESHOLD) {
      const mem = process.memoryUsage()
      const memInfo = `RSS: ${Math.round(mem.rss / 1048576)}MB, HeapUsed: ${Math.round(mem.heapUsed / 1048576)}MB / ${Math.round(mem.heapTotal / 1048576)}MB`
      logErrorToFile(
        'MAIN_PROCESS_HANG',
        `Main process event loop was blocked/frozen for ${lag}ms.\nMemory: ${memInfo}`
      )
    }
    lastTick = now
  }, CHECK_INTERVAL)

  if (mainWatchdogTimer.unref) {
    mainWatchdogTimer.unref()
  }
}
