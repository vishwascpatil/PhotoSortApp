import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let logFilePath = ''

export function setupLogger() {
  // Save the log file in the project root during dev, or userData in production
  logFilePath = app.isPackaged 
    ? path.join(app.getPath('userData'), 'app-errors.log')
    : path.join(process.cwd(), 'app-errors.log')

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
