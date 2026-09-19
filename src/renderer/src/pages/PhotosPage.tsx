import React, { useEffect, useState, useCallback } from 'react'
import { ImageIcon, Upload, Sparkles } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import ContextMenu from '../components/ContextMenu'
import EmptyState from '../components/EmptyState'
import CollageModal from '../components/CollageModal'
import PhotoCompareModal from '../components/PhotoCompareModal'
import DateScrubber from '../components/DateScrubber'

export default function PhotosPage() {
  const { state, dispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast, openCleanUpModal } = useApp()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; photoId: number } | null>(null)

  const filterKey = JSON.stringify(state.activeFilter)
  useEffect(() => {
    const isSpecialFilter = state.activeFilter && (state.activeFilter.isTrashed || state.activeFilter.isArchived || state.activeFilter.isLocked || state.activeFilter.search)
    if (isSpecialFilter || state.photos.length === 0) {
      loadPhotos({})
    }
  }, [loadPhotos, filterKey, state.photos.length])

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

  const [collageModal, setCollageModal] = useState(false)
  const [compareModal, setCompareModal] = useState(false)

  if (!state.isLoading && state.photos.length === 0) {
    return (
      <EmptyState
        icon={
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="0" height="0" style={{ position: 'absolute' }}>
              <defs>
                <linearGradient id="photoIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#4f46e5" />
                  <stop offset="50%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
            </svg>
            <ImageIcon
              size={46}
              strokeWidth={1.8}
              stroke="url(#photoIconGrad)"
              style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
            />
          </div>
        }
        title={
          <>
            Your Photo Library is <span className="title-sort-gradient">Empty</span>
          </>
        }
        description="Photos and videos from your imported folders will appear here automatically."
      />
    )
  }

  const selectedPhotos = state.photos.filter(p => state.selectedIds.has(p.id))

  const uniqueYears = Array.from(
    new Set(state.photos.map(p => new Date(p.created_at).getFullYear()))
  ).filter(y => !isNaN(y))

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
          showToast(`Jumped to year ${year}`)
        }}
      />

      {/* Top Header Controls */}
      {state.photos.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px', padding: '0 16px' }}>
          <button
            type="button"
            className="btn-free-up-space"
            onClick={() => openCleanUpModal()}
            title="Clean Up Suggestions & Free Up Space (Large files, WhatsApp junk, screenshots, duplicates)"
          >
            <Sparkles size={15} /> Free Up Space
          </button>
        </div>
      )}

      <PhotoGrid
        photos={state.photos}
        showDateHeaders={true}
        onContextMenu={handleContextMenu}
      />

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
    </div>
  )
}
