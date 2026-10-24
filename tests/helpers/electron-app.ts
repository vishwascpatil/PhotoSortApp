import { _electron as electron, ElectronApplication, Page } from 'playwright'
import path from 'path'
import fs from 'fs'

export interface TestAppContext {
  electronApp: ElectronApplication
  page: Page
  errors: string[]
  userDataDir: string
  close: () => Promise<void>
}

export async function launchTestApp(options: { cleanUserData?: boolean; customId?: string; env?: Record<string, string> } = {}): Promise<TestAppContext> {
  const id = options.customId || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const userDataDir = path.join(process.cwd(), 'test-fixtures', `userData-${id}`)

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }

  // Pre-seed native WIC thumbnailer binary for fast HEIC testing if present
  const globalWic = path.join(process.env.APPDATA || '', 'PhotoSort', 'bin', 'WicThumbnailer.exe')
  const testBinDir = path.join(userDataDir, 'bin')
  if (fs.existsSync(globalWic) && !fs.existsSync(path.join(testBinDir, 'WicThumbnailer.exe'))) {
    fs.mkdirSync(testBinDir, { recursive: true })
    try {
      fs.copyFileSync(globalWic, path.join(testBinDir, 'WicThumbnailer.exe'))
    } catch {}
  }

  const errors: string[] = []

  // Launch Electron application
  const electronApp = await electron.launch({
    args: ['.', `--user-data-dir=${userDataDir}`, '--js-flags=--expose-gc'],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PHOTOSORT_USER_DATA: userDataDir,
      PHOTOSORT_TEST_MODE: '1',
      ...(options.env || {})
    }
  })

  const page = await electronApp.firstWindow()

  // Track console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Filter out non-fatal or harmless logs if necessary
      if (!text.includes('Download the React DevTools') && !text.includes('Failed to load resource: net::ERR_FILE_NOT_FOUND')) {
        errors.push(`[CONSOLE_ERROR] ${text}`)
      }
    }
  })

  // Track unhandled exceptions in renderer
  page.on('pageerror', (err) => {
    errors.push(`[PAGE_ERROR] ${err.message}\n${err.stack}`)
  })

  // Wait for React to mount root
  await page.waitForSelector('#root', { timeout: 15000 })

  // If WelcomePage is displayed on fresh launch, ensure we enter the main UI
  await ensureMainApp(page)

  return {
    electronApp,
    page,
    errors,
    userDataDir,
    close: async () => {
      try {
        const proc = electronApp.process()
        await Promise.race([
          electronApp.close(),
          new Promise((resolve) => setTimeout(resolve, 3000))
        ])
        if (proc && !proc.killed) {
          try {
            if (process.platform === 'win32') {
              require('child_process').execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' })
            } else {
              proc.kill('SIGKILL')
            }
          } catch {}
        }
      } catch (e) {
        console.warn('Error closing Electron app:', e)
      }
    }
  }
}

export async function ensureMainApp(page: Page): Promise<void> {
  const sidebar = page.locator('aside.sidebar')
  const startTime = Date.now()

  while (Date.now() - startTime < 15000) {
    if (await sidebar.isVisible().catch(() => false)) {
      return
    }

    const getStartedBtn = page.locator('button.welcome-btn-primary, button:has-text("Get Started")').first()
    if (await getStartedBtn.isVisible().catch(() => false)) {
      await getStartedBtn.click({ force: true }).catch(() => {})
    }

    await page.waitForTimeout(400)
  }

  try {
    await sidebar.waitFor({ state: 'visible', timeout: 5000 })
  } catch (err) {
    const html = await page.content().catch(() => '')
    console.error('ensureMainApp timeout. Active HTML:', html.slice(0, 1000))
    throw err
  }
}
