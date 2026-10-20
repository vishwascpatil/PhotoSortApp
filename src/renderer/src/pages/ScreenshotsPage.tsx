import React, { useState, useMemo, useEffect } from 'react'
import {
  Monitor, Smartphone, Film, Laptop, Trash2, CheckSquare,
  Square, RefreshCw, Sparkles, CheckCircle2, Loader2
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import ContextMenu from '../components/ContextMenu'
import EmptyState from '../components/EmptyState'
import CollageModal from '../components/CollageModal'
import PhotoCompareModal from '../components/PhotoCompareModal'
import DateScrubber from '../components/DateScrubber'
import { formatFileSize } from '../utils/helpers'
import { detectScreenshot, ScreenshotCategory } from '../utils/screenshotDetector'

export default function ScreenshotsPage() {
  const { state: photoState, dispatch: photoDispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast } = useApp()
  const [activeCategory, setActiveCategory] = useState<ScreenshotCategory>('all')
  const [isCleaning, setIsCleaning] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; photoId: number } | null>(null)
  const [collageModal, setCollageModal] = useState(false)
  const [compareModal, setCompareModal] = useState(false)
  const [targetYear, setTargetYear] = useState<number | null>(null)

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

  const [hasScanned, setHasScanned] = useState(false)
  const [isScanning, setIsScanning] = useState(false)

  // Reset scan state when a new folder is imported
  useEffect(() => {
    const handleImported = () => {
      setHasScanned(false)
    }
    window.addEventListener('photosort:library-imported', handleImported)
    return () => window.removeEventListener('photosort:library-imported', handleImported)
  }, [])

  const handleStartScan = async () => {
    setIsScanning(true)
    await new Promise(r => setTimeout(r, 350))
    setHasScanned(true)
    setIsScanning(false)
    showToast('Screenshots scan completed!')
  }

  const handleRefresh = async () => {
    refreshPhotos()
    await handleStartScan()
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

  const selectedPhotos = useMemo(() => {
    return filteredScreenshots.filter(p => photoState.selectedIds.has(p.id))
  }, [filteredScreenshots, photoState.selectedIds])

  const uniqueYears = useMemo(() => {
    return Array.from(
      new Set(filteredScreenshots.map(p => new Date(p.created_at).getFullYear()))
    ).filter(y => !isNaN(y))
  }, [filteredScreenshots])

  function handleContextMenu(e: React.MouseEvent, photoId: number) {
    setContextMenu({ x: e.clientX, y: e.clientY, photoId })
  }

  async function handleContextFavorite(id: number) {
    await window.photoVault.toggleFavorite(id)
    refreshPhotos()
  }

  async function handleContextTrash(id: number) {
    await window.photoVault.trash([id])
    photoDispatch({ type: 'REMOVE_PHOTOS', payload: [id] })
    showToast('Moved to trash', async () => {
      await window.photoVault.restore([id])
      refreshPhotos()
    })
  }

  function handleContextInfo(id: number) {
    photoDispatch({
      type: 'SET_VIEWER_SCOPED',
      payload: { photoId: id, photos: filteredScreenshots }
    })
  }

  function handleContextOpenInExplorer(id: number) {
    const photo = filteredScreenshots.find(p => p.id === id)
    if (photo) window.photoVault.openInExplorer(photo.file_path)
  }

  return (
    <div className="photos-page-container">
      <SelectionBar
        onCollage={() => setCollageModal(true)}
        onCompare={() => setCompareModal(true)}
      />

      {/* Date Scrubber Bar for 100GB fast scroll */}
      <DateScrubber
        years={uniqueYears}
        onSelectYear={(year) => {
          setTargetYear(year)
          showToast(`Jumped to year ${year}`)
        }}
      />

      {/* Action Header & Tabs */}
      <div style={{ padding: '0 20px', marginBottom: '16px' }}>
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
            className={hasScanned ? "apple-secondary-btn" : "apple-primary-btn"}
            onClick={hasScanned ? handleRefresh : handleStartScan}
            disabled={isScanning}
          >
            {isScanning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Scanning Screenshots...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>{hasScanned ? 'Rescan' : 'Scan Screenshots'}</span>
              </>
            )}
          </button>

          {hasScanned && filteredScreenshots.length > 0 && (
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
      {hasScanned && totalCount > 0 && (
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
      </div>

      {/* Main Content */}
      {!hasScanned && !isScanning ? (
        <EmptyState
          icon={
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Monitor
                size={48}
                strokeWidth={1.8}
                style={{ color: '#6366f1', filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
              />
            </div>
          }
          title={
            <>
              Scan for <span className="title-sort-gradient">Screenshots</span>
            </>
          }
          description="Detect mobile captures, desktop snips, and screen recordings across your photo library."
          actionLabel="Scan Screenshots"
          onAction={handleStartScan}
        />
      ) : isScanning ? (
        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-secondary)' }}>
          <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 16px', color: '#6366f1' }} />
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Analyzing photo library for screenshots...</div>
        </div>
      ) : totalCount === 0 ? (
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
        <PhotoGrid
          photos={filteredScreenshots}
          showDateHeaders={true}
          onContextMenu={handleContextMenu}
          scrollToYear={targetYear}
        />
      )}

      {/* Collage Modal */}
      {collageModal && (
        <CollageModal
          photos={selectedPhotos}
          onClose={() => setCollageModal(false)}
          onSaved={() => {
            photoDispatch({ type: 'DESELECT_ALL' })
            refreshPhotos()
          }}
        />
      )}

      {/* Side-by-Side Compare Modal */}
      {compareModal && selectedPhotos.length >= 2 && (
        <PhotoCompareModal
          photo1={selectedPhotos[0]}
          photo2={selectedPhotos[1]}
          onClose={() => setCompareModal(false)}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          photoId={contextMenu.photoId}
          onClose={() => setContextMenu(null)}
          onFavorite={handleContextFavorite}
          onTrash={handleContextTrash}
          onInfo={handleContextInfo}
          onOpenInExplorer={handleContextOpenInExplorer}
        />
      )}
    </div>
  )
}
