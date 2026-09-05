import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs'
import { spawn, execFileSync, ChildProcess } from 'child_process'
import { cpus, tmpdir } from 'os'

const CSHARP_SOURCE = `using System;
using System.IO;
using System.Windows.Media.Imaging;

class WicThumbnailer
{
    static void Main(string[] args)
    {
        string line;
        while ((line = Console.ReadLine()) != null)
        {
            if (string.IsNullOrEmpty(line)) continue;
            string[] parts = line.Split('\\t');
            if (parts.Length < 2) continue;

            string inPath = parts[0];
            string outPath = parts[1];

            try
            {
                Uri uri = new Uri(inPath);
                BitmapDecoder dec = BitmapDecoder.Create(uri, BitmapCreateOptions.DelayCreation, BitmapCacheOption.None);
                BitmapSource frame = dec.Frames[0].Thumbnail;
                if (frame == null) frame = dec.Frames[0];

                JpegBitmapEncoder encoder = new JpegBitmapEncoder();
                encoder.QualityLevel = 75;
                encoder.Frames.Add(BitmapFrame.Create(frame));

                using (FileStream fs = File.OpenWrite(outPath))
                {
                    encoder.Save(fs);
                }
                Console.WriteLine("OK\\t" + outPath);
            }
            catch (Exception ex)
            {
                Console.WriteLine("ERR\\t" + ex.Message);
            }
        }
    }
}
`

interface WicTask {
  inPath: string
  outPath: string
  resolve: (res: { success: boolean; thumbnailPath: string }) => void
}

interface WorkerSlot {
  proc: ChildProcess
  busy: boolean
  currentTask: WicTask | null
  buffer: string
  timer: NodeJS.Timeout | null
}

export class WicHeicExtractor {
  private isAvailable: boolean = false
  private exePath: string = ''
  private workers: WorkerSlot[] = []
  private queue: WicTask[] = []
  private numWorkers: number = 4

  constructor() {
    this.init()
  }

  private init(): void {
    if (process.platform !== 'win32') {
      this.isAvailable = false
      return
    }

    try {
      let baseDir = ''
      try {
        baseDir = app?.getPath ? app.getPath('userData') : join(process.env.APPDATA || tmpdir(), 'PhotoSort')
      } catch {
        baseDir = join(process.env.APPDATA || tmpdir(), 'PhotoSort')
      }

      const binDir = join(baseDir, 'bin')
      if (!existsSync(binDir)) {
        mkdirSync(binDir, { recursive: true })
      }

      this.exePath = join(binDir, 'WicThumbnailer.exe')

      if (!existsSync(this.exePath)) {
        this.compileBinary(binDir)
      }

      if (existsSync(this.exePath)) {
        this.isAvailable = true
        const coreCount = cpus().length
        this.numWorkers = Math.max(2, Math.min(8, Math.floor(coreCount / 2)))
        for (let i = 0; i < this.numWorkers; i++) {
          this.spawnWorker()
        }
      }
    } catch (err) {
      console.warn('WIC HEIC Extractor initialization failed, falling back to heic-convert:', err)
      this.isAvailable = false
    }
  }

  private compileBinary(binDir: string): void {
    const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe'
    const wpfDir = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\WPF'

    if (!existsSync(cscPath) || !existsSync(join(wpfDir, 'PresentationCore.dll'))) {
      return
    }

    const csPath = join(binDir, 'WicThumbnailer.cs')
    writeFileSync(csPath, CSHARP_SOURCE, 'utf8')

    try {
      execFileSync(
        cscPath,
        [
          '/optimize+',
          '/target:exe',
          '/r:System.Xaml.dll',
          `/r:${join(wpfDir, 'PresentationCore.dll')}`,
          `/r:${join(wpfDir, 'WindowsBase.dll')}`,
          `/out:${this.exePath}`,
          csPath
        ],
        { windowsHide: true, stdio: 'ignore' }
      )
    } finally {
      try {
        if (existsSync(csPath)) unlinkSync(csPath)
      } catch {}
    }
  }

  private spawnWorker(): void {
    if (!this.isAvailable || !this.exePath || !existsSync(this.exePath)) return

    try {
      const proc = spawn(this.exePath, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore']
      })

      const slot: WorkerSlot = {
        proc,
        busy: false,
        currentTask: null,
        buffer: '',
        timer: null
      }

      proc.stdout?.on('data', (chunk) => {
        slot.buffer += chunk.toString()
        const lines = slot.buffer.split('\n')
        slot.buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue

          if (slot.timer) {
            clearTimeout(slot.timer)
            slot.timer = null
          }

          const [status, outPath] = trimmed.split('\t')
          const task = slot.currentTask
          slot.busy = false
          slot.currentTask = null

          if (task) {
            if (status === 'OK' && outPath && existsSync(outPath)) {
              task.resolve({ success: true, thumbnailPath: outPath })
            } else {
              task.resolve({ success: false, thumbnailPath: '' })
            }
          }

          this.processQueue()
        }
      })

      const handleExit = () => {
        if (slot.timer) {
          clearTimeout(slot.timer)
          slot.timer = null
        }
        if (slot.currentTask) {
          slot.currentTask.resolve({ success: false, thumbnailPath: '' })
          slot.currentTask = null
        }
        const idx = this.workers.indexOf(slot)
        if (idx !== -1) {
          this.workers.splice(idx, 1)
        }
        if (this.isAvailable) {
          this.spawnWorker()
        }
      }

      proc.on('close', handleExit)
      proc.on('error', handleExit)

      this.workers.push(slot)
    } catch {
      // Worker spawn failed
    }
  }

  public extract(inPath: string, outPath: string): Promise<{ success: boolean; thumbnailPath: string }> {
    return new Promise((resolve) => {
      if (!this.isAvailable || this.workers.length === 0) {
        resolve({ success: false, thumbnailPath: '' })
        return
      }

      this.queue.push({ inPath, outPath, resolve })
      this.processQueue()
    })
  }

  private processQueue(): void {
    if (this.queue.length === 0) return

    const freeSlot = this.workers.find((w) => !w.busy)
    if (!freeSlot || !freeSlot.proc.stdin) return

    const task = this.queue.shift()!
    freeSlot.busy = true
    freeSlot.currentTask = task

    freeSlot.timer = setTimeout(() => {
      try {
        freeSlot.proc.kill()
      } catch {}
    }, 4000)

    try {
      freeSlot.proc.stdin.write(`${task.inPath}\t${task.outPath}\n`)
    } catch {
      freeSlot.busy = false
      freeSlot.currentTask = null
      task.resolve({ success: false, thumbnailPath: '' })
      this.processQueue()
    }
  }

  public destroy(): void {
    for (const slot of this.workers) {
      if (slot.timer) clearTimeout(slot.timer)
      try {
        slot.proc.kill()
      } catch {}
    }
    this.workers = []
  }
}

export const wicHeicExtractor = new WicHeicExtractor()
