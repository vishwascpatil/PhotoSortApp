import React, { useEffect, useMemo, useState } from 'react'
import { Heart } from 'lucide-react'
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

export default function FavoritesPage() {
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

  // Instant in-memory filtering (0ms)
  const favorites = useMemo(() => {
    return photoState.photos.filter(p => p.is_favorite === 1)
  }, [photoState.photos])

  const totalBytes = useMemo(() => {
    return favorites.reduce((sum, p) => sum + (p.file_size || 0), 0)
  }, [favorites])

  const selectedPhotos = useMemo(() => {
    return favorites.filter(p => photoState.selectedIds.has(p.id))
  }, [favorites, photoState.selectedIds])

  const uniqueYears = useMemo(() => {
    return Array.from(
      new Set(favorites.map(p => new Date(p.created_at).getFullYear()))
    ).filter(y => !isNaN(y))
  }, [favorites])

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
      payload: { photoId: id, photos: favorites }
    })
  }

  function handleContextOpenInExplorer(id: number) {
    const photo = favorites.find(p => p.id === id)
    if (photo) window.photoVault.openInExplorer(photo.file_path)
  }

  if (!photoState.isLoading && favorites.length === 0) {
    return (
      <EmptyState
        icon={
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="0" height="0" style={{ position: 'absolute' }}>
              <defs>
                <linearGradient id="favIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f43f5e" />
                  <stop offset="50%" stopColor="#ec4899" />
                  <stop offset="100%" stopColor="#d946ef" />
                </linearGradient>
              </defs>
            </svg>
            <Heart
              size={46}
              strokeWidth={1.8}
              stroke="url(#favIconGrad)"
              style={{ filter: 'drop-shadow(0 4px 12px rgba(244, 63, 94, 0.35))' }}
            />
          </div>
        }
        title={
          <>
            No <span className="title-sort-gradient">Favorites</span> Yet
          </>
        }
        description="Photos you mark as favorites will appear here. Click the heart icon on any photo or use the context menu to pin your best shots."
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
      {favorites.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '0 20px' }}>
          <span className="apple-storage-pill">
            {favorites.length} favorite{favorites.length > 1 ? 's' : ''} • {formatFileSize(totalBytes)}
          </span>
        </div>
      )}

      {/* Main Virtualized Grid Identical to All Photos */}
      <PhotoGrid
        photos={favorites}
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
