import React, { useEffect, useState, useCallback } from 'react'
import { ImageIcon, Upload, Play } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import ContextMenu from '../components/ContextMenu'
import EmptyState from '../components/EmptyState'
import CollageModal from '../components/CollageModal'
import PhotoCompareModal from '../components/PhotoCompareModal'
import MemoriesCarousel, { Memory } from '../components/MemoriesCarousel'
import MemoriesViewer from '../components/MemoriesViewer'
import SlideshowViewer from '../components/SlideshowViewer'
import DateScrubber from '../components/DateScrubber'

export default function PhotosPage() {
  const { state, dispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast } = useApp()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; photoId: number } | null>(null)

  useEffect(() => {
    const isSpecialFilter = state.activeFilter && (state.activeFilter.isTrashed || state.activeFilter.isArchived || state.activeFilter.isLocked || state.activeFilter.search)
    if (isSpecialFilter || state.photos.length === 0) {
      loadPhotos({})
    }
  }, [loadPhotos, state.activeFilter, state.photos.length])

  // Listen for import done to refresh
  useEffect(() => {
    const cleanup = window.photoVault.onImportStatus((status) => {
      if (status.stage === 'done') {
        refreshPhotos()
      }
    })
    return cleanup
  }, [refreshPhotos])

  // Listen for menu imports
  useEffect(() => {
    const cleanup1 = window.photoVault.onMenuImportFolder(async () => {
      await window.photoVault.importFolder()
    })
    const cleanup2 = window.photoVault.onMenuImportFiles(async () => {
      await window.photoVault.importFiles()
    })
    return () => { cleanup1(); cleanup2() }
  }, [])

  async function handleImport() {
    await window.photoVault.importFolder()
  }

  function handleContextMenu(e: React.MouseEvent, photoId: number) {
    setContextMenu({ x: e.clientX, y: e.clientY, photoId })
  }

  async function handleContextFavorite(id: number) {
    await window.photoVault.toggleFavorite(id)
    refreshPhotos()
  }

  async function handleContextTrash(id: number) {
    await window.photoVault.trash([id])
    dispatch({ type: 'REMOVE_PHOTOS', payload: [id] })
    showToast('Moved to trash', async () => {
      await window.photoVault.restore([id])
      refreshPhotos()
    })
  }

  function handleContextInfo(id: number) {
    dispatch({ type: 'SET_VIEWER', payload: id })
  }

  function handleContextOpenInExplorer(id: number) {
    const photo = state.photos.find(p => p.id === id)
    if (photo) window.photoVault.openInExplorer(photo.file_path)
  }

  const [activeMemory, setActiveMemory] = useState<Memory | null>(null)
  const [slideshowActive, setSlideshowActive] = useState(false)
  const [collageModal, setCollageModal] = useState(false)
  const [compareModal, setCompareModal] = useState(false)

  if (!state.isLoading && state.photos.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon size={48} />}
        title="Your photo library is empty"
        description="Import photos from your computer to get started. You can import entire folders or individual files."
        actionLabel="Import Photos"
        onAction={handleImport}
      />
    )
  }

  const selectedPhotos = state.photos.filter(p => state.selectedIds.has(p.id))

  const uniqueYears = Array.from(
    new Set(state.photos.map(p => new Date(p.created_at).getFullYear()))
  ).filter(y => !isNaN(y))

  return (
    <>
      <SelectionBar
        onCollage={() => setCollageModal(true)}
        onCompare={() => setCompareModal(true)}
      />

      {/* Date Scrubber Bar for 100GB fast scroll */}
      <DateScrubber
        years={uniqueYears}
        onSelectYear={(year) => {
          showToast(`Jumped to year ${year}`)
        }}
      />

      {/* Top Header Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <MemoriesCarousel photos={state.photos} onSelectMemory={(m) => setActiveMemory(m)} />
        {state.photos.length > 0 && (
          <button
            className="btn btn-ghost"
            onClick={() => setSlideshowActive(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <Play size={16} /> Slideshow
          </button>
        )}
      </div>

      <PhotoGrid
        photos={state.photos}
        showDateHeaders={true}
        onContextMenu={handleContextMenu}
      />

      {/* Memories Story Overlay */}
      {activeMemory && (
        <MemoriesViewer memory={activeMemory} onClose={() => setActiveMemory(null)} />
      )}

      {/* Fullscreen Slideshow Overlay */}
      {slideshowActive && (
        <SlideshowViewer photos={state.photos} onClose={() => setSlideshowActive(false)} />
      )}

      {/* Collage Modal */}
      {collageModal && (
        <CollageModal
          photos={selectedPhotos}
          onClose={() => setCollageModal(false)}
          onSaved={() => {
            dispatch({ type: 'DESELECT_ALL' })
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
    </>
  )
}
