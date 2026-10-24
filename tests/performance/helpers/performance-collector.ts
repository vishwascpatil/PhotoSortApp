import { Page, CDPSession } from 'playwright'

export interface MetricRecord {
  category: string
  name: string
  value: number
  unit: string
  target: number
  criticalThreshold: number
  status: 'PASS' | 'WARN' | 'FAIL'
  details: string
}

export class PerformanceCollector {
  private page: Page
  private cdpSession: CDPSession | null = null
  private records: MetricRecord[] = []

  constructor(page: Page) {
    this.page = page
  }

  async init(): Promise<void> {
    try {
      this.cdpSession = await this.page.context().newCDPSession(this.page)
      await this.cdpSession.send('Performance.enable')
    } catch (e) {
      console.warn('[PerformanceCollector] CDP session initialization warning:', e)
    }

    // Inject in-browser FPS & Long Tasks tracking
    await this.page.evaluate(() => {
      ;(window as any).__perfCollector = {
        active: true,
        startTime: performance.now(),
        frameTimes: [] as number[],
        longTasks: [] as { duration: number; startTime: number; name: string }[],
        rafId: 0
      }

      let lastRaf = performance.now()
      function onFrame(now: number) {
        const delta = now - lastRaf
        lastRaf = now
        const collector = (window as any).__perfCollector
        if (collector && collector.active) {
          collector.frameTimes.push(delta)
          if (collector.frameTimes.length > 500) {
            collector.frameTimes.shift()
          }
          collector.rafId = requestAnimationFrame(onFrame)
        }
      }
      ;(window as any).__perfCollector.rafId = requestAnimationFrame(onFrame)

      // Observe Long Tasks on Renderer Main Thread (> 50ms)
      try {
        if (typeof PerformanceObserver !== 'undefined') {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const collector = (window as any).__perfCollector
              if (collector && collector.active) {
                collector.longTasks.push({
                  duration: entry.duration,
                  startTime: entry.startTime,
                  name: entry.name
                })
              }
            }
          })
          observer.observe({ entryTypes: ['longtask'] })
        }
      } catch (err) {
        console.warn('LongTask observer not supported:', err)
      }
    })
  }

  async startFpsSampling(): Promise<void> {
    await this.page.evaluate(() => {
      const collector = (window as any).__perfCollector
      if (collector) {
        collector.frameTimes = []
        collector.active = true
      }
    })
  }

  async stopFpsSampling(): Promise<{ avgFps: number; droppedFrames: number; minFrameTimeMs: number; maxFrameTimeMs: number }> {
    const res = await this.page.evaluate(() => {
      const collector = (window as any).__perfCollector
      if (!collector || collector.frameTimes.length === 0) {
        return { avgFps: 60, droppedFrames: 0, minFrameTimeMs: 16.6, maxFrameTimeMs: 16.6 }
      }
      const times = collector.frameTimes as number[]
      const totalDelta = times.reduce((a, b) => a + b, 0)
      const avgDelta = totalDelta / times.length
      const avgFps = Math.min(60, Math.round(1000 / (avgDelta || 16.6)))
      // Dropped frames: frame took longer than 25ms (> 1.5 standard 60hz frame)
      const droppedFrames = times.filter((t) => t > 25).length
      const minFrameTimeMs = Math.round(Math.min(...times) * 10) / 10
      const maxFrameTimeMs = Math.round(Math.max(...times) * 10) / 10

      return { avgFps, droppedFrames, minFrameTimeMs, maxFrameTimeMs }
    })
    return res
  }

  async getLongTasks(): Promise<{ count: number; maxDurationMs: number; totalDurationMs: number; tasksOver100ms: number }> {
    const res = await this.page.evaluate(() => {
      const collector = (window as any).__perfCollector
      if (!collector || collector.longTasks.length === 0) {
        return { count: 0, maxDurationMs: 0, totalDurationMs: 0, tasksOver100ms: 0 }
      }
      const tasks = collector.longTasks as { duration: number; startTime: number; name: string }[]
      const maxDurationMs = Math.round(Math.max(...tasks.map((t) => t.duration)))
      const totalDurationMs = Math.round(tasks.reduce((sum, t) => sum + t.duration, 0))
      const tasksOver100ms = tasks.filter((t) => t.duration > 100).length

      return { count: tasks.length, maxDurationMs, totalDurationMs, tasksOver100ms }
    })
    return res
  }

  async getMemoryMetrics(): Promise<{ jsHeapUsedMB: number; jsHeapTotalMB: number }> {
    try {
      const mem = await this.page.evaluate(() => {
        const perf = window.performance as any
        if (perf && perf.memory) {
          return {
            jsHeapUsedMB: Math.round(perf.memory.usedJSHeapSize / (1024 * 1024)),
            jsHeapTotalMB: Math.round(perf.memory.totalJSHeapSize / (1024 * 1024))
          }
        }
        return { jsHeapUsedMB: 0, jsHeapTotalMB: 0 }
      })
      return mem
    } catch {
      return { jsHeapUsedMB: 0, jsHeapTotalMB: 0 }
    }
  }

  record(metric: {
    category: string
    name: string
    value: number
    unit: string
    target: number
    criticalThreshold: number
    higherIsBetter?: boolean
    details: string
  }): MetricRecord {
    const higherIsBetter = metric.higherIsBetter ?? false
    let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS'

    if (higherIsBetter) {
      if (metric.value < metric.criticalThreshold) {
        status = 'FAIL'
      } else if (metric.value < metric.target) {
        status = 'WARN'
      }
    } else {
      if (metric.value > metric.criticalThreshold) {
        status = 'FAIL'
      } else if (metric.value > metric.target) {
        status = 'WARN'
      }
    }

    const rec: MetricRecord = {
      category: metric.category,
      name: metric.name,
      value: Math.round(metric.value * 100) / 100,
      unit: metric.unit,
      target: metric.target,
      criticalThreshold: metric.criticalThreshold,
      status,
      details: metric.details
    }

    this.records.push(rec)
    return rec
  }

  getRecords(): MetricRecord[] {
    return this.records
  }

  generateSummaryMarkdown(): string {
    const lines: string[] = []
    lines.push('# PhotoSort Performance Benchmark Report')
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push('')
    lines.push('| Category | Metric Name | Measured Value | Target SLA | Critical Threshold | Status | Details |')
    lines.push('|---|---|---|---|---|:---:|---|')

    for (const r of this.records) {
      const badge = r.status === 'PASS' ? '✅ PASS' : r.status === 'WARN' ? '⚠️ WARN' : '❌ FAIL'
      lines.push(
        `| **${r.category}** | ${r.name} | **${r.value} ${r.unit}** | ${r.target} ${r.unit} | ${r.criticalThreshold} ${r.unit} | ${badge} | ${r.details} |`
      )
    }

    lines.push('')
    const passCount = this.records.filter((r) => r.status === 'PASS').length
    const warnCount = this.records.filter((r) => r.status === 'WARN').length
    const failCount = this.records.filter((r) => r.status === 'FAIL').length
    lines.push(`### Summary: ${passCount} Passed, ${warnCount} Warnings, ${failCount} Failed`)

    return lines.join('\n')
  }
}
