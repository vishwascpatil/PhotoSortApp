import React, { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Save, RotateCw, Undo, Check } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { getBestDisplayUrl, getThumbnailUrl } from '../utils/helpers'

const FILTERS = [
  { id: 'none', name: 'Original' },
  { id: 'vivid', name: 'Vivid' },
  { id: 'warm', name: 'Warm' },
  { id: 'cool', name: 'Cool' },
  { id: 'bw', name: 'B&W' },
  { id: 'sepia', name: 'Sepia' },
  { id: 'dramatic', name: 'Dramatic' },
]

interface Adjustments {
  brightness: number
  contrast: number
  saturation: number
  warmth: number
  rotate: number
  filter: string
}

const defaultAdjustments: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  rotate: 0,
  filter: 'none'
}

export default function PhotoEditor() {
  const { state, dispatch, refreshPhotos } = usePhotos()
  const { showToast } = useApp()
  const [tab, setTab] = useState<'filters' | 'adjust'>('filters')
  const [adjustments, setAdjustments] = useState<Adjustments>({ ...defaultAdjustments })
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const photo = state.photos.find(p => p.id === state.editingPhotoId)

  useEffect(() => {
    if (!photo) return
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgRef.current = img
      renderCanvas()
    }
    img.src = getBestDisplayUrl(photo)
  }, [photo])

  useEffect(() => {
    renderCanvas()
  }, [adjustments])

  function renderCanvas() {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Handle rotation
    const isRotated = adjustments.rotate % 180 !== 0
    canvas.width = isRotated ? img.height : img.width
    canvas.height = isRotated ? img.width : img.height

    ctx.save()
    ctx.translate(canvas.width / 2, canvas.height / 2)
    ctx.rotate((adjustments.rotate * Math.PI) / 180)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
    ctx.restore()

    // Apply CSS filters for preview
    const brightness = 100 + adjustments.brightness
    const contrast = 100 + adjustments.contrast
    const saturate = 100 + adjustments.saturation

    let filterStr = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`

    if (adjustments.warmth !== 0) {
      const hue = adjustments.warmth > 0 ? adjustments.warmth * 0.3 : adjustments.warmth * 0.3
      filterStr += ` hue-rotate(${hue}deg)`
    }

    if (adjustments.filter === 'bw') {
      filterStr += ' grayscale(100%)'
    } else if (adjustments.filter === 'sepia') {
      filterStr += ' sepia(80%)'
    } else if (adjustments.filter === 'vivid') {
      filterStr += ' saturate(150%) contrast(110%)'
    } else if (adjustments.filter === 'warm') {
      filterStr += ' sepia(20%) saturate(120%)'
    } else if (adjustments.filter === 'cool') {
      filterStr += ' hue-rotate(20deg) saturate(90%)'
    } else if (adjustments.filter === 'dramatic') {
      filterStr += ' contrast(130%) saturate(80%)'
    }

    canvas.style.filter = filterStr
  }

  function handleRotate() {
    setAdjustments(prev => ({
      ...prev,
      rotate: (prev.rotate + 90) % 360
    }))
  }

  function handleReset() {
    setAdjustments({ ...defaultAdjustments })
  }

  async function handleSave() {
    if (!photo) return
    setSaving(true)
    try {
      const edits: Record<string, unknown> = {}
      if (adjustments.rotate !== 0) edits.rotate = adjustments.rotate
      if (adjustments.brightness !== 0) edits.brightness = adjustments.brightness
      if (adjustments.saturation !== 0) edits.saturation = adjustments.saturation
      if (adjustments.filter !== 'none') edits.filter = adjustments.filter

      const result = await window.photoVault.editPhoto(photo.id, edits)
      if (result.success) {
        showToast('Photo saved successfully')
        refreshPhotos()
        dispatch({ type: 'SET_EDITING', payload: null })
      } else {
        showToast('Failed to save: ' + (result.error || 'Unknown error'))
      }
    } catch (err) {
      showToast('Failed to save photo')
    }
    setSaving(false)
  }

  function handleClose() {
    dispatch({ type: 'SET_EDITING', payload: null })
  }

  if (!photo) return null

  return (
    <div className="photo-editor">
      {/* Toolbar */}
      <div className="photo-editor-toolbar">
        <button className="viewer-btn" onClick={handleClose}>
          <ArrowLeft size={20} />
        </button>
        <span className="photo-editor-toolbar-title">Edit Photo</span>

        <button className="btn btn-ghost" onClick={handleReset}>
          <Undo size={16} /> Reset
        </button>
        <button className="btn btn-ghost" onClick={handleRotate}>
          <RotateCw size={16} /> Rotate
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          <Save size={16} /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Canvas */}
      <div className="photo-editor-canvas">
        <canvas
          ref={canvasRef}
          style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
        />
      </div>

      {/* Controls */}
      <div className="photo-editor-controls">
        <div className="photo-editor-tabs">
          <button
            className={`photo-editor-tab ${tab === 'filters' ? 'active' : ''}`}
            onClick={() => setTab('filters')}
          >
            Filters
          </button>
          <button
            className={`photo-editor-tab ${tab === 'adjust' ? 'active' : ''}`}
            onClick={() => setTab('adjust')}
          >
            Adjust
          </button>
        </div>

        {tab === 'filters' && (
          <div className="photo-editor-filters">
            {FILTERS.map(filter => (
              <button
                key={filter.id}
                className={`photo-editor-filter ${adjustments.filter === filter.id ? 'active' : ''}`}
                onClick={() => setAdjustments(prev => ({ ...prev, filter: filter.id }))}
              >
                <div className="photo-editor-filter-preview">
                  {photo.thumbnail_path && (
                    <img
                      src={getThumbnailUrl(photo.thumbnail_path)}
                      alt={filter.name}
                      style={{
                        filter: filter.id === 'bw' ? 'grayscale(100%)' :
                               filter.id === 'sepia' ? 'sepia(80%)' :
                               filter.id === 'vivid' ? 'saturate(150%) contrast(110%)' :
                               filter.id === 'warm' ? 'sepia(20%) saturate(120%)' :
                               filter.id === 'cool' ? 'hue-rotate(20deg) saturate(90%)' :
                               filter.id === 'dramatic' ? 'contrast(130%) saturate(80%)' : 'none'
                      }}
                    />
                  )}
                </div>
                <span className="photo-editor-filter-name">{filter.name}</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'adjust' && (
          <div className="photo-editor-sliders">
            {[
              { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
              { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
              { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
              { key: 'warmth', label: 'Warmth', min: -100, max: 100 },
            ].map(slider => (
              <div key={slider.key} className="photo-editor-slider">
                <span className="photo-editor-slider-label">{slider.label}</span>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  value={adjustments[slider.key as keyof Adjustments] as number}
                  onChange={(e) => setAdjustments(prev => ({
                    ...prev,
                    [slider.key]: parseInt(e.target.value)
                  }))}
                />
                <span className="photo-editor-slider-value">
                  {adjustments[slider.key as keyof Adjustments]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
