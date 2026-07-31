import React, { useState, useEffect, useRef } from 'react'
import { X, Save, Layout, Grid, RefreshCw } from 'lucide-react'
import { Photo } from '../contexts/PhotoContext'
import { getBestDisplayUrl } from '../utils/helpers'
import { useApp } from '../contexts/AppContext'

interface CollageModalProps {
  photos: Photo[]
  onClose: () => void
  onSaved: () => void
}

type CollageLayout = '2x1' | '2x2' | '3x1' | 'hero' | 'grid3x3'

export default function CollageModal({ photos, onClose, onSaved }: CollageModalProps) {
  const [layout, setLayout] = useState<CollageLayout>('2x2')
  const [padding, setPadding] = useState(12)
  const [borderRadius, setBorderRadius] = useState(16)
  const [bgColor, setBgColor] = useState('#ffffff')
  const [saving, setSaving] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { showToast } = useApp()

  useEffect(() => {
    renderCollage()
  }, [layout, padding, borderRadius, bgColor, photos])

  async function renderCollage() {
    const canvas = canvasRef.current
    if (!canvas || photos.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = 1200
    const height = 1200
    canvas.width = width
    canvas.height = height

    // Background
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    // Load images
    const loadedImages: HTMLImageElement[] = await Promise.all(
      photos.slice(0, 9).map(p => {
        return new Promise<HTMLImageElement>((resolve) => {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = () => resolve(img)
          img.src = getBestDisplayUrl(p)
        })
      })
    )

    // Calculate grid positions based on layout
    const count = loadedImages.length
    let rects: { x: number; y: number; w: number; h: number }[] = []

    if (layout === '2x1' || count === 2) {
      const w = (width - padding * 3) / 2
      const h = height - padding * 2
      rects = [
        { x: padding, y: padding, w, h },
        { x: padding * 2 + w, y: padding, w, h }
      ]
    } else if (layout === '2x2' || count <= 4) {
      const w = (width - padding * 3) / 2
      const h = (height - padding * 3) / 2
      rects = [
        { x: padding, y: padding, w, h },
        { x: padding * 2 + w, y: padding, w, h },
        { x: padding, y: padding * 2 + h, w, h },
        { x: padding * 2 + w, y: padding * 2 + h, w, h }
      ]
    } else if (layout === 'hero') {
      const heroW = (width - padding * 3) * 0.65
      const sideW = (width - padding * 3) * 0.35
      const sideH = (height - padding * 3) / 2
      rects = [
        { x: padding, y: padding, w: heroW, h: height - padding * 2 },
        { x: padding * 2 + heroW, y: padding, w: sideW, h: sideH },
        { x: padding * 2 + heroW, y: padding * 2 + sideH, w: sideW, h: sideH }
      ]
    } else {
      // 3x3 grid
      const w = (width - padding * 4) / 3
      const h = (height - padding * 4) / 3
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          rects.push({
            x: padding + c * (w + padding),
            y: padding + r * (h + padding),
            w,
            h
          })
        }
      }
    }

    // Draw clipped images into rects
    rects.forEach((rect, idx) => {
      const img = loadedImages[idx % loadedImages.length]
      if (!img.width) return

      ctx.save()

      // Rounded rect path
      ctx.beginPath()
      const r = Math.min(borderRadius, rect.w / 2, rect.h / 2)
      ctx.moveTo(rect.x + r, rect.y)
      ctx.arcTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + rect.h, r)
      ctx.arcTo(rect.x + rect.w, rect.y + rect.h, rect.x, rect.y + rect.h, r)
      ctx.arcTo(rect.x, rect.y + rect.h, rect.x, rect.y, r)
      ctx.arcTo(rect.x, rect.y, rect.x + rect.w, rect.y, r)
      ctx.closePath()
      ctx.clip()

      // Cover fill aspect calculation
      const imgAspect = img.width / img.height
      const rectAspect = rect.w / rect.h
      let drawW = rect.w
      let drawH = rect.h
      let offsetX = 0
      let offsetY = 0

      if (imgAspect > rectAspect) {
        drawW = rect.h * imgAspect
        offsetX = -(drawW - rect.w) / 2
      } else {
        drawH = rect.w / imgAspect
        offsetY = -(drawH - rect.h) / 2
      }

      ctx.drawImage(img, rect.x + offsetX, rect.y + offsetY, drawW, drawH)
      ctx.restore()
    })
  }

  async function handleSaveCollage() {
    setSaving(true)
    showToast('Collage created successfully!')
    onSaved()
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '680px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Create Collage ({photos.length} photos)</h3>
        </div>

        <div className="modal-body" style={{ display: 'flex', gap: '20px' }}>
          {/* Canvas preview */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '12px' }}>
            <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '360px', borderRadius: '8px', boxShadow: 'var(--shadow-md)' }} />
          </div>

          {/* Controls */}
          <div style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>LAYOUT</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '6px' }}>
                <button className={`btn ${layout === '2x2' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLayout('2x2')}>2×2 Grid</button>
                <button className={`btn ${layout === '2x1' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLayout('2x1')}>Side Split</button>
                <button className={`btn ${layout === 'hero' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLayout('hero')}>Hero Feature</button>
                <button className={`btn ${layout === 'grid3x3' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setLayout('grid3x3')}>3×3 Grid</button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>BORDER ROUNDING</label>
              <input type="range" min={0} max={40} value={borderRadius} onChange={e => setBorderRadius(Number(e.target.value))} style={{ width: '100%', marginTop: '4px' }} />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>GAP SPACING</label>
              <input type="range" min={0} max={30} value={padding} onChange={e => setPadding(Number(e.target.value))} style={{ width: '100%', marginTop: '4px' }} />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 600 }}>BACKGROUND COLOR</label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                {['#ffffff', '#1f1f1f', '#f28b82', '#8ab4f8', '#81c995'].map(c => (
                  <div
                    key={c}
                    onClick={() => setBgColor(c)}
                    style={{
                      width: '24px', height: '24px', borderRadius: '50%', background: c, cursor: 'pointer',
                      border: bgColor === c ? '2px solid var(--accent)' : '1px solid var(--border)'
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveCollage} disabled={saving}>
            <Save size={16} /> Save Collage
          </button>
        </div>
      </div>
    </div>
  )
}
