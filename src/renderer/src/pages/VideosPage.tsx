import React, { useEffect, useMemo, useState } from 'react'
import { Film } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import ContextMenu from '../components/ContextMenu'
import EmptyState from '../components/EmptyState'
import CollageModal from '../components/CollageModal'
import PhotoCompareModal from '../components/PhotoCompareModal'
import DateScrubber from '../components/DateScrubber'
import { formatFileSize } from '../utils/helpers'

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']

export default function VideosPage() {
  const { state: photoState, dispatch: photoDispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast } = useApp()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; photoId: number } | null>(null)
  const [collageModal, setCollageModal] = useState(false)
  const [compareModal, setCompareModal] = useState(false)
  const [targetYear, setTargetYear] = useState<number | null>(null)

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

  // Listen for import completion to auto refresh
  useEffect(() => {
    const cleanup = window.photoVault.onImportStatus((status) => {
      if (status.stage === 'done') {
        refreshPhotos()
      }
    })
    return cleanup
  }, [refreshPhotos])

  // Filter video files from photo library
  const videos = useMemo(() => {
    return photoState.photos.filter(p => {
      if (p.media_type === 'video') return true
      const ext = '.' + (p.file_path.split('.').pop() || '').toLowerCase()
      return VIDEO_EXTENSIONS.includes(ext)
    })
  }, [photoState.photos])

  const totalBytes = useMemo(() => {
    return videos.reduce((sum, p) => sum + (p.file_size || 0), 0)
  }, [videos])

  const selectedPhotos = useMemo(() => {
    return videos.filter(p => photoState.selectedIds.has(p.id))
  }, [videos, photoState.selectedIds])

  const uniqueYears = useMemo(() => {
    return Array.from(
      new Set(videos.map(p => new Date(p.created_at).getFullYear()))
    ).filter(y => !isNaN(y))
  }, [videos])

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
      payload: { photoId: id, photos: videos }
    })
  }

  function handleContextOpenInExplorer(id: number) {
    const photo = videos.find(p => p.id === id)
    if (photo) window.photoVault.openInExplorer(photo.file_path)
  }

  if (!photoState.isLoading && videos.length === 0) {
    return (
      <EmptyState
        icon={
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="0" height="0" style={{ position: 'absolute' }}>
              <defs>
                <linearGradient id="videoIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4f46e5" />
                  <stop offset="50%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
            </svg>
            <Film
              size={46}
              strokeWidth={1.8}
              stroke="url(#videoIconGrad)"
              style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
            />
          </div>
        }
        title={
          <>
            No <span className="title-sort-gradient">Videos</span> Found
          </>
        }
        description="Your video recordings from imported folders will appear here automatically. Supported formats include MP4, MOV, AVI, and MKV."
      />
    )
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

      {/* Top Header Information Pill */}
      {videos.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '0 20px' }}>
          <span className="apple-storage-pill">
            {videos.length} video{videos.length > 1 ? 's' : ''} • {formatFileSize(totalBytes)}
          </span>
        </div>
      )}

      {/* Main Virtualized Grid Identical to All Photos */}
      <PhotoGrid
        photos={videos}
        showDateHeaders={true}
        onContextMenu={handleContextMenu}
        scrollToYear={targetYear}
      />

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
