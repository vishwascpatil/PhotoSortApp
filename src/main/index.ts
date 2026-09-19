import { app, shell, BrowserWindow, Menu, dialog, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase, closeDatabase } from './database'
import { registerIpcHandlers } from './ipc-handlers'
import { setupLogger, logErrorToFile } from './logger'
import { ensureThumbnailDir, queueMissingVideoThumbnails, generateThumbnailBatch } from './thumbnails'
import { syncAllTrackedFolders } from './syncer'

// Explicitly enforce 'photosort' userData directory name
app.setName('photosort')

// Enable native Hardware HEVC / H.265 / 4K video playback for iPhone .MOV & MP4 files
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport,HardwareAcceleratedVideoDecode')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')

export { generateThumbnailBatch, ensureThumbnailDir }
export { getOrGenerateHighResPreview, prefetchHighResPreviews } from './highres'

let mainWindow: BrowserWindow | null = null

// Setup global error logging
setupLogger()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: process.platform === 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    titleBarOverlay: process.platform !== 'darwin' ? {
      color: '#1a1a2e',
      symbolColor: '#a0a0b8',
      height: 40
    } : undefined,
    backgroundColor: '#0f0f1a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:state-changed', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:state-changed', false)
  })

  // Detect when window becomes unresponsive (Chromium UI thread hang)
  mainWindow.on('unresponsive', () => {
    const mem = process.memoryUsage()
    const memInfo = `RSS: ${Math.round(mem.rss / 1048576)}MB, Heap: ${Math.round(mem.heapUsed / 1048576)}MB`
    logErrorToFile(
      'WINDOW_HANG_UNRESPONSIVE',
      `Application window stopped responding (Renderer UI thread hung).\nMemory: ${memInfo}`
    )
  })

  mainWindow.on('responsive', () => {
    logErrorToFile(
      'WINDOW_HANG_RECOVERED',
      'Application window recovered from unresponsive state and is responsive again.'
    )
  })

  // Detect if renderer process crashes or terminates
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logErrorToFile(
      'RENDER_PROCESS_GONE',
      `Renderer process terminated unexpectedly.\nReason: ${details.reason}, Exit Code: ${details.exitCode}`
    )
  })

  mainWindow.webContents.on('unresponsive', () => {
    logErrorToFile(
      'WEB_CONTENTS_UNRESPONSIVE',
      'WebContents became unresponsive (Chromium renderer stall).'
    )
  })

  mainWindow.webContents.on('responsive', () => {
    logErrorToFile(
      'WEB_CONTENTS_RESPONSIVE',
      'WebContents recovered from unresponsive state and is responsive again.'
    )
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Import Folder...',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            mainWindow?.webContents.send('menu:import-folder')
          }
        },
        {
          label: 'Import Files...',
          accelerator: 'CmdOrCtrl+I',
          click: () => {
            mainWindow?.webContents.send('menu:import-files')
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About PhotoVault',
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: 'About PhotoVault',
              message: 'PhotoVault v1.0.0',
              detail: 'An offline photo management app inspired by Google Photos.'
            })
          }
        }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// Single instance lock (only enforce in production)
if (!is.dev) {
  const gotTheLock = app.requestSingleInstanceLock()
  if (!gotTheLock) {
    app.quit()
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
    })
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.photovault.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize backend
  await initDatabase()
  ensureThumbnailDir()
  registerIpcHandlers()

  // Create window and menu
  createMenu()
  createWindow()

  // Trigger background startup disk sync worker
  setTimeout(() => {
    syncAllTrackedFolders(mainWindow || undefined).catch((err: unknown) => console.error('Startup sync error:', err))
    queueMissingVideoThumbnails()
  }, 3000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
