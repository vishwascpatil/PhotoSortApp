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

      {/* Action Header */}
      <div
        className="page-header"
        style={{
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {totalCount > 0 && (
            <span className="apple-storage-pill">
              {totalCount} items • {formatFileSize(totalBytes)}
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <button
            type="button"
            className="apple-secondary-btn"
            onClick={handleRefresh}
          >
            <RefreshCw size={14} />
            <span>Refresh</span>
          </button>

          {filteredScreenshots.length > 0 && (
            <button
              type="button"
              className="apple-secondary-btn"
              onClick={handleTrashAllScreenshots}
              disabled={isCleaning}
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#ef4444',
                borderColor: 'rgba(239, 68, 68, 0.25)',
                gap: '6px'
              }}
            >
              <Trash2 size={14} />
              <span>Move All to Trash</span>
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
            paddingBottom: '12px',
            flexWrap: 'wrap'
          }}
        >
          {[
            { id: 'all', label: `All Screenshots (${totalCount})`, icon: <Monitor size={14} /> },
            { id: 'mobile', label: `Mobile & Tablets (${mobileCount})`, icon: <Smartphone size={14} /> },
            { id: 'desktop', label: `Desktop & Snips (${desktopCount})`, icon: <Laptop size={14} /> },
            ...(videoCount > 0 ? [{ id: 'video', label: `Screen Recordings (${videoCount})`, icon: <Film size={14} /> }] : [])
          ].map(tab => {
            const isActive = activeCategory === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id as any)}
                style={{
                  fontSize: '12px',
                  padding: '5px 14px',
                  borderRadius: '99px',
                  fontWeight: isActive ? 600 : 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: isActive ? '1px solid transparent' : '1px solid var(--border)',
                  background: isActive ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : 'var(--bg-secondary)',
                  color: isActive ? '#ffffff' : 'var(--text-secondary)',
                  boxShadow: isActive ? '0 2px 8px rgba(99, 102, 241, 0.25)' : 'none'
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Main Content */}
      {totalCount === 0 ? (
        <EmptyState
          icon={
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="scrIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
              <Monitor
                size={46}
                strokeWidth={1.8}
                stroke="url(#scrIconGrad)"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
              />
            </div>
          }
          title={
            <>
              No <span className="title-sort-gradient">Screenshots</span> Detected
            </>
          }
          description="Your library has no screenshot or screen capture images. Standard photos and imported pictures are sorted in All Photos."
        />
      ) : filteredScreenshots.length === 0 ? (
        <EmptyState
          icon={
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="scrCatIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
              <CheckCircle2
                size={46}
                strokeWidth={1.8}
                stroke="url(#scrCatIconGrad)"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
              />
            </div>
          }
          title={
            <>
              No <span className="title-sort-gradient">{activeCategory === 'mobile' ? 'Mobile' : activeCategory === 'desktop' ? 'Desktop' : 'Video'}</span> Screenshots
            </>
          }
          description="There are no screenshots matching this category."
        />
      ) : (
        <PhotoGrid photos={filteredScreenshots} showDateHeaders={true} />
      )}
    </div>
  )
}
