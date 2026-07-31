import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  ArrowLeft, Heart, Info, Trash2, Edit, ZoomIn, ZoomOut,
  ChevronLeft, ChevronRight, RotateCw, Download, FolderOpen,
  Calendar, Camera, Aperture, ImageIcon, HardDrive, MapPin, RotateCcw, Film
} from 'lucide-react'
import { Photo, usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { getThumbnailUrl, getOriginalUrl, formatDateFull, formatFileSize } from '../utils/helpers'

export default function PhotoViewer() {
  const { state, dispatch } = usePhotos()
  const { showToast } = useApp()
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [zoomScale, setZoomScale] = useState(1)
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const hasDragged = useRef(false)
  const [showInfo, setShowInfo] = useState(false)
  const [exifData, setExifData] = useState<any | null>(null)
  const [imgSrc, setImgSrc] = useState('')
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const activeThumbRef = useRef<HTMLButtonElement>(null)

  const isZoomed = zoomScale > 1

  useEffect(() => {
    if (activeThumbRef.current) {
      activeThumbRef.current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      })
    }
  }, [state.viewerPhotoId])

  // Reset zoom & drag offset when photo changes
  useEffect(() => {
    setOffset({ x: 0, y: 0 })
    setZoomScale(1)
    setIsDragging(false)
    hasDragged.current = false
  }, [state.viewerPhotoId])

  // Ctrl + Mouse Wheel zoom event listener
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || zoomScale > 1) {
        e.preventDefault()
        const delta = -e.deltaY
        const factor = delta > 0 ? 1.15 : 0.85
        setZoomScale(prev => {
          const next = Math.min(Math.max(prev * factor, 1), 5)
          if (next === 1) {
            setOffset({ x: 0, y: 0 })
          }
          return Number(next.toFixed(3))
        })
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [zoomScale])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isZoomed) return
    e.preventDefault()
    setIsDragging(true)
    hasDragged.current = false
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !dragStart.current) return
    const newX = e.clientX - dragStart.current.x
    const newY = e.clientY - dragStart.current.y

    if (Math.abs(newX - offset.x) > 2 || Math.abs(newY - offset.y) > 2) {
      hasDragged.current = true
    }

    setOffset({ x: newX, y: newY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    dragStart.current = null
  }

  const activePhotos = state.viewerPhotos || state.photos
  const currentIndex = activePhotos.findIndex(p => p.id === state.viewerPhotoId)
  const photo = currentIndex >= 0 ? activePhotos[currentIndex] : null

  useEffect(() => {
    if (!photo) return
    // Start with preview, then load original
    const previewUrl = getThumbnailUrl(photo.preview_path)
    const originalUrl = getOriginalUrl(photo.file_path)

    const isVideo = photo.mime_type?.startsWith('video')

    // For videos, use the original file directly; for images, start with preview then load original
    setImgSrc(isVideo ? originalUrl : (previewUrl || originalUrl))

    // Load full res after preview (skip for video)
    if (previewUrl && !isVideo) {
      const img = new Image()
      img.onload = () => setImgSrc(originalUrl)
      img.src = originalUrl
    }

    // Load EXIF
    window.photoVault.getPhotoById(photo.id).then(data => {
      if (data.exif) setExifData(data.exif)
      else setExifData(null)
    })
  }, [photo])

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      switch (e.key) {
        case 'Escape':
          dispatch({ type: 'SET_VIEWER', payload: null })
          break
        case 'ArrowLeft':
          navigate(-1)
          break
        case 'ArrowRight':
          navigate(1)
          break
        case 'f':
          if (photo) handleFavorite()
          break
        case 'i':
          setShowInfo(prev => !prev)
          break
        case 'Delete':
          if (photo) handleTrash()
          break
        case 'e':
          if (photo) dispatch({ type: 'SET_EDITING', payload: photo.id })
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentIndex, photo])

  function navigate(dir: number) {
    const newIdx = currentIndex + dir
    if (newIdx >= 0 && newIdx < activePhotos.length) {
      if (state.viewerPhotos) {
        dispatch({ type: 'SET_VIEWER_SCOPED', payload: { photoId: activePhotos[newIdx].id, photos: activePhotos } })
      } else {
        dispatch({ type: 'SET_VIEWER', payload: activePhotos[newIdx].id })
      }
      setZoomScale(1)
      setOffset({ x: 0, y: 0 })
    }
  }

  async function handleFavorite() {
    if (!photo) return
    const isFav = await window.photoVault.toggleFavorite(photo.id)
    dispatch({ type: 'UPDATE_PHOTO', payload: { ...photo, is_favorite: isFav ? 1 : 0 } })
    showToast(isFav ? 'Added to favorites' : 'Removed from favorites')
  }

  async function handleTrash() {
    if (!photo) return
    await window.photoVault.trash([photo.id])
    dispatch({ type: 'REMOVE_PHOTOS', payload: [photo.id] })
    dispatch({ type: 'SET_VIEWER', payload: null })
    showToast('Moved to trash', async () => {
      await window.photoVault.restore([photo.id])
    })
  }

  async function handleRestore() {
    if (!photo) return
    await window.photoVault.restore([photo.id])
    dispatch({ type: 'REMOVE_PHOTOS', payload: [photo.id] })
    dispatch({ type: 'SET_VIEWER', payload: null })
    showToast('Photo restored')
  }

  async function handleDeletePermanently() {
    if (!photo) return
    await window.photoVault.deletePermanently([photo.id])
    dispatch({ type: 'REMOVE_PHOTOS', payload: [photo.id] })
    dispatch({ type: 'SET_VIEWER', payload: null })
    showToast('Photo permanently deleted')
  }

  const handleZoomToggle = () => {
    // If the user was dragging the photo around, do NOT zoom out!
    if (hasDragged.current) {
      hasDragged.current = false
      return
    }

    setZoomScale(prev => {
      if (prev > 1) {
        setOffset({ x: 0, y: 0 })
        return 1
      }
      return 2
    })
  }

  function handleOpenInExplorer() {
    if (photo) window.photoVault.openInExplorer(photo.file_path)
  }

  if (!photo) return null

  return (
    <div className="photo-viewer">
      {/* Toolbar */}
      <div className="photo-viewer-toolbar">
        <button className="viewer-btn" onClick={() => dispatch({ type: 'SET_VIEWER', payload: null })} title="Back">
          <ArrowLeft size={22} />
        </button>

        <div className="photo-viewer-toolbar-right">
          {photo.is_trashed ? (
            <>
              <button className="viewer-btn" onClick={handleRestore} title="Restore">
                <RotateCcw size={20} />
              </button>
              <button className="viewer-btn" onClick={handleDeletePermanently} title="Delete permanently">
                <Trash2 size={20} />
              </button>
            </>
          ) : (
            <>
              <button
                className={`viewer-btn ${photo.is_favorite ? 'active' : ''}`}
                onClick={handleFavorite}
                title="Favorite"
              >
                <Heart size={20} fill={photo.is_favorite ? 'currentColor' : 'none'} />
              </button>
              <button className="viewer-btn" onClick={() => setShowInfo(prev => !prev)} title="Info">
                <Info size={20} />
              </button>
              <button className="viewer-btn" onClick={() => dispatch({ type: 'SET_EDITING', payload: photo.id })} title="Edit">
                <Edit size={20} />
              </button>
              <button className="viewer-btn" onClick={handleOpenInExplorer} title="Open in explorer">
                <FolderOpen size={20} />
              </button>
              <button className="viewer-btn" onClick={handleTrash} title="Delete">
                <Trash2 size={20} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Image / Video */}
      <div className="photo-viewer-content" ref={containerRef}>
        {currentIndex > 0 && (
          <button className="photo-viewer-nav prev" onClick={() => navigate(-1)}>
            <ChevronLeft size={28} />
          </button>
        )}

        {photo.mime_type?.startsWith('video') ? (
          <video
            src={imgSrc}
            controls
            autoPlay
            className="photo-viewer-image"
            style={{ maxWidth: '90%', maxHeight: '85%' }}
          />
        ) : (
            <img
              ref={imageRef}
              className={`photo-viewer-image ${isZoomed ? 'zoomed' : ''}`}
              src={imgSrc}
              alt={photo.filename}
              onClick={handleZoomToggle}
              draggable={false}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{
                transform: zoomScale > 1 ? `translate(${offset.x}px, ${offset.y}px) scale(${zoomScale})` : undefined,
                transition: isDragging ? 'none' : 'transform 150ms ease-out',
                cursor: zoomScale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
              }}
            />
        )}

        {currentIndex < state.photos.length - 1 && (
          <button className="photo-viewer-nav next" onClick={() => navigate(1)}>
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {/* Info Panel */}
      {showInfo && (
        <div className="photo-info-panel">
          <h3 className="photo-info-title">{photo.filename}</h3>

          <div style={{ marginBottom: '16px' }}>
            <input
              placeholder="Add a description / caption..."
              defaultValue={(photo as any).description || ''}
              onBlur={async (e) => {
                const val = e.target.value
                await window.photoVault.updateMetadata(photo.id, { description: val })
                showToast('Description updated')
              }}
              style={{
                width: '100%', padding: '8px 10px', background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-primary)',
                fontSize: '13px', outline: 'none'
              }}
            />
          </div>

          <div className="photo-info-section">
            <div className="photo-info-row">
              <Calendar size={18} className="icon" />
              <div className="photo-info-row-content">
                <div className="photo-info-row-value">{formatDateFull(photo.created_at)}</div>
              </div>
            </div>

            <div className="photo-info-row">
              <ImageIcon size={18} className="icon" />
              <div className="photo-info-row-content">
                <div className="photo-info-row-value">{photo.width} × {photo.height}</div>
                <div className="photo-info-row-label">{photo.mime_type}</div>
              </div>
            </div>

            <div className="photo-info-row">
              <HardDrive size={18} className="icon" />
              <div className="photo-info-row-content">
                <div className="photo-info-row-value">{formatFileSize(photo.file_size)}</div>
                <div className="photo-info-row-label" style={{ fontSize: '11px', wordBreak: 'break-all' }}>{photo.file_path}</div>
              </div>
            </div>
          </div>

          {exifData && (
            <div className="photo-info-section">
              <div className="photo-info-section-title">Camera</div>
              {exifData.make && (
                <div className="photo-info-row">
                  <Camera size={18} className="icon" />
                  <div className="photo-info-row-content">
                    <div className="photo-info-row-value">{String(exifData.make)} {String(exifData.model || '')}</div>
                    {exifData.lens_model && <div className="photo-info-row-label">{String(exifData.lens_model)}</div>}
                  </div>
                </div>
              )}
              {(exifData.f_number || exifData.exposure_time || exifData.iso) && (
                <div className="photo-info-row">
                  <Aperture size={18} className="icon" />
                  <div className="photo-info-row-content">
                    <div className="photo-info-row-value">
                      {exifData.f_number ? `ƒ/${exifData.f_number}` : ''}
                      {exifData.exposure_time ? ` · ${exifData.exposure_time}s` : ''}
                      {exifData.iso ? ` · ISO ${exifData.iso}` : ''}
                    </div>
                    {exifData.focal_length && (
                      <div className="photo-info-row-label">{exifData.focal_length}mm</div>
                    )}
                  </div>
                </div>
              )}
              {exifData.gps_lat && exifData.gps_lon && (
                <div className="photo-info-row">
                  <MapPin size={18} className="icon" />
                  <div className="photo-info-row-content">
                    <div className="photo-info-row-value">
                      {Number(exifData.gps_lat).toFixed(4)}, {Number(exifData.gps_lon).toFixed(4)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom Filmstrip Bar */}
      {activePhotos && activePhotos.length > 1 && (
        <div className="photo-viewer-filmstrip">
          <div className="filmstrip-track">
            {activePhotos.map((item) => {
              const isCurrent = item.id === photo.id
              const thumbUrl = getThumbnailUrl(item.preview_path || item.thumbnail_path || item.file_path)
              const isVid = item.mime_type?.startsWith('video')
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`filmstrip-item ${isCurrent ? 'active' : ''}`}
                  onClick={() => {
                    if (state.viewerPhotos) {
                      dispatch({ type: 'SET_VIEWER_SCOPED', payload: { photoId: item.id, photos: activePhotos } })
                    } else {
                      dispatch({ type: 'SET_VIEWER', payload: item.id })
                    }
                    setZoomScale(1)
                  }}
                  ref={isCurrent ? activeThumbRef : null}
                  title={item.filename}
                >
                  <img src={thumbUrl} alt={item.filename} loading="lazy" />
                  {isVid && (
                    <div className="filmstrip-video-badge">
                      <Film size={10} />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
