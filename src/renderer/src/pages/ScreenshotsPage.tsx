import React, { useState, useMemo, useEffect } from 'react'
import {
  Monitor, Smartphone, Film, Laptop, Trash2, CheckSquare,
  Square, RefreshCw, Sparkles, CheckCircle2
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import EmptyState from '../components/EmptyState'
import { formatFileSize } from '../utils/helpers'
import { detectScreenshot, ScreenshotCategory } from '../utils/screenshotDetector'

export default function ScreenshotsPage() {
  const { state: photoState, dispatch: photoDispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast } = useApp()
  const [activeCategory, setActiveCategory] = useState<ScreenshotCategory>('all')
  const [isCleaning, setIsCleaning] = useState(false)

  // Ensure photos are loaded
  const filterKey = JSON.stringify(photoState.activeFilter)
  useEffect(() => {
    const isSpecialFilter =
      photoState.activeFilter &&
      (photoState.activeFilter.isTrashed ||
        photoState.activeFilter.isArchived ||
        photoState.activeFilter.isLocked ||
        photoState.activeFilter.search)
    if (isSpecialFilter || photoState.photos.length === 0) {
      loadPhotos({})
    }
  }, [loadPhotos, filterKey, photoState.photos.length])

  // Detect and categorize screenshots in real time
  const detectedScreenshots = useMemo(() => {
    return photoState.photos.map(p => ({
      photo: p,
      info: detectScreenshot(p)
    })).filter(item => item.info.isScreenshot)
  }, [photoState.photos])

  // Filtered by current category
  const filteredScreenshots = useMemo(() => {
    if (activeCategory === 'all') {
      return detectedScreenshots.map(d => d.photo)
    }
    return detectedScreenshots
      .filter(d => d.info.category === activeCategory)
      .map(d => d.photo)
  }, [detectedScreenshots, activeCategory])

  // Counts & sizes for stats
  const totalCount = detectedScreenshots.length
  const totalBytes = useMemo(() => {
    return detectedScreenshots.reduce((acc, curr) => acc + (curr.photo.file_size || 0), 0)
  }, [detectedScreenshots])

  const mobileCount = useMemo(
    () => detectedScreenshots.filter(d => d.info.category === 'mobile').length,
    [detectedScreenshots]
  )
  const desktopCount = useMemo(
    () => detectedScreenshots.filter(d => d.info.category === 'desktop').length,
    [detectedScreenshots]
  )
  const videoCount = useMemo(
    () => detectedScreenshots.filter(d => d.info.category === 'video').length,
    [detectedScreenshots]
  )

  const handleRefresh = () => {
    refreshPhotos()
    showToast('Refreshed screenshots!')
  }

  const handleSelectAllScreenshots = () => {
    if (photoState.selectedIds.size === filteredScreenshots.length) {
      photoDispatch({ type: 'DESELECT_ALL' })
    } else {
      photoDispatch({ type: 'SELECT_ALL' })
    }
  }

  const handleTrashAllScreenshots = async () => {
    if (filteredScreenshots.length === 0) return
    const ids = filteredScreenshots.map(p => p.id)
    const count = ids.length
    if (
      !confirm(
        `Are you sure you want to move ${count} screenshot${count > 1 ? 's' : ''} (${formatFileSize(totalBytes)}) to Trash?`
      )
    ) {
      return
    }

    try {
      setIsCleaning(true)
      if (window.photoVault?.trash) {
        await window.photoVault.trash(ids)
        photoDispatch({ type: 'REMOVE_PHOTOS', payload: ids })
        showToast(`Moved ${count} screenshot${count > 1 ? 's' : ''} to Trash`)
        refreshPhotos()
      }
    } catch (err) {
      console.error('Failed to trash screenshots:', err)
      showToast('Failed to move screenshots to Trash')
    } finally {
      setIsCleaning(false)
    }
  }

  return (
    <div className="photos-page" style={{ padding: '24px 32px' }}>
      {photoState.isSelecting && <SelectionBar />}

      {/* Header */}
      <div
        className="page-header"
        style={{
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(14, 165, 233, 0.25)'
            }}
          >
            <Monitor size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '26px', fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                Screenshots
              </h1>
              {totalCount > 0 && (
                <span
                  style={{
                    background: 'rgba(14, 165, 233, 0.12)',
                    color: '#0284c7',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    letterSpacing: '0.02em'
                  }}
                >
                  {totalCount} items • {formatFileSize(totalBytes)}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #64748b)', margin: '4px 0 0 0' }}>
              Auto-detected screenshots, snips, and screen recordings across your library.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleRefresh}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <RefreshCw size={15} /> Refresh
          </button>

          {filteredScreenshots.length > 0 && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleTrashAllScreenshots}
              disabled={isCleaning}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                padding: '7px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              <Trash2 size={15} /> Move All to Trash
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs / Badges */}
      {totalCount > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '20px',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '12px'
          }}
        >
          <button
            type="button"
            className={`btn ${activeCategory === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveCategory('all')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Monitor size={15} /> All Screenshots ({totalCount})
          </button>

          <button
            type="button"
            className={`btn ${activeCategory === 'mobile' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveCategory('mobile')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Smartphone size={15} /> Mobile & Tablets ({mobileCount})
          </button>

          <button
            type="button"
            className={`btn ${activeCategory === 'desktop' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveCategory('desktop')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Laptop size={15} /> Desktop & Snips ({desktopCount})
          </button>

          {videoCount > 0 && (
            <button
              type="button"
              className={`btn ${activeCategory === 'video' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveCategory('video')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              <Film size={15} /> Screen Recordings ({videoCount})
            </button>
          )}
        </div>
      )}

      {/* Main Content */}
      {totalCount === 0 ? (
        <EmptyState
          icon={<Monitor size={48} />}
          title="No Screenshots Detected"
          description="Your library has no screenshot or screen capture images. Standard photos and imported pictures are sorted in All Photos."
          actionLabel="Refresh Library"
          onAction={handleRefresh}
        />
      ) : filteredScreenshots.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={48} />}
          title={`No ${activeCategory === 'mobile' ? 'Mobile' : activeCategory === 'desktop' ? 'Desktop' : 'Video'} Screenshots`}
          description="There are no screenshots matching this category."
          actionLabel="View All Screenshots"
          onAction={() => setActiveCategory('all')}
        />
      ) : (
        <PhotoGrid photos={filteredScreenshots} showDateHeaders={true} />
      )}
    </div>
  )
}
