import { Worker } from 'worker_threads'
import { cpus } from 'os'
import { join } from 'path'

interface HeicTask {
  id: number
  filePath: string
  thumbnailPath: string
  size: number
  quality: number
  resolve: (res: { success: boolean; thumbnailPath: string }) => void
}

class HeicWorkerPool {
  private workers: Worker[] = []
  private freeWorkers: Worker[] = []
  private queue: HeicTask[] = []
  private workerPath: string

  constructor() {
    const numWorkers = Math.max(16, cpus().length * 2)
    this.workerPath = join(__dirname, 'heic-worker.js')

    for (let i = 0; i < numWorkers; i++) {
      this.createWorker()
    }
  }

  private createWorker(): void {
    try {
      const worker = new Worker(this.workerPath)
      this.workers.push(worker)
      this.freeWorkers.push(worker)
    } catch (err) {
      console.error('Failed to create HEIC worker thread:', err)
    }
  }

  public convert(id: number, filePath: string, thumbnailPath: string, size = 400, quality = 0.65): Promise<{ success: boolean; thumbnailPath: string }> {
    return new Promise((resolve) => {
      let settled = false
      const safeResolve = (res: { success: boolean; thumbnailPath: string }) => {
        if (!settled) {
          settled = true
          resolve(res)
        }
      }

      const timer = setTimeout(() => {
        safeResolve({ success: false, thumbnailPath: '' })
      }, 10000)

      const task: HeicTask = {
        id,
        filePath,
        thumbnailPath,
        size,
        quality,
        resolve: (res) => {
          clearTimeout(timer)
          safeResolve(res)
        }
      }

      this.queue.push(task)
      this.processQueue()
    })
  }

  private processQueue(): void {
    if (this.queue.length === 0 || this.freeWorkers.length === 0) return

    const worker = this.freeWorkers.pop()!
    const task = this.queue.shift()!

    const messageHandler = (msg: { id: number; success: boolean; thumbnailPath: string }) => {
      worker.off('message', messageHandler)
      worker.off('error', errorHandler)
      this.freeWorkers.push(worker)
      task.resolve({ success: msg.success, thumbnailPath: msg.success ? msg.thumbnailPath : '' })
      this.processQueue()
    }

    const errorHandler = () => {
      worker.off('message', messageHandler)
      worker.off('error', errorHandler)
      try { worker.terminate() } catch {}
      const idx = this.workers.indexOf(worker)
      if (idx !== -1) this.workers.splice(idx, 1)
      this.createWorker()
      task.resolve({ success: false, thumbnailPath: '' })
      this.processQueue()
    }

    worker.on('message', messageHandler)
    worker.on('error', errorHandler)
    worker.postMessage({ id: task.id, filePath: task.filePath, thumbnailPath: task.thumbnailPath, size: task.size, quality: task.quality })
  }
}

export const heicPool = new HeicWorkerPool()
