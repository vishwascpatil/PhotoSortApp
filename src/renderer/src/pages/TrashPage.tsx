import React, { useEffect, useState, useMemo } from 'react'
import { Trash2, AlertTriangle, RotateCcw, X, ShieldAlert, Info, FolderOpen } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { formatFileSize } from '../utils/helpers'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import ContextMenu, { ContextMenuAction } from '../components/ContextMenu'
import DateScrubber from '../components/DateScrubber'
import EmptyState from '../components/EmptyState'

export default function TrashPage() {
  const { state, dispatch, loadPhotos } = usePhotos()
  const { showToast } = useApp()
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false)
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; photoId: number } | null>(null)
  const [targetYear, setTargetYear] = useState<number | null>(null)

  useEffect(() => {
    loadPhotos({ isTrashed: true })
  }, [loadPhotos])

  const totalTrashBytes = useMemo(() => {
    return state.photos.reduce((sum, p) => sum + (p.file_size || 0), 0)
  }, [state.photos])

  const uniqueYears = useMemo(() => {
    return Array.from(
      new Set(state.photos.map(p => new Date(p.created_at).getFullYear()))
    ).filter(y => !isNaN(y))
  }, [state.photos])

  async function confirmAndEmptyTrash() {
    const ids = state.photos.map(p => p.id)
    if (ids.length === 0) return
    const bytesDeleted = totalTrashBytes
    await window.photoVault.deletePermanently(ids)
    dispatch({ type: 'SET_PHOTOS', payload: [] })
    setShowEmptyConfirm(false)
    setShowDeleteSelectedConfirm(false)
    showToast(`${ids.length} items permanently deleted (${formatFileSize(bytesDeleted)} freed)`)
  }

  async function handleRestoreAll() {
    const ids = state.photos.map(p => p.id)
    if (ids.length === 0) return
    await window.photoVault.restore(ids)
    dispatch({ type: 'SET_PHOTOS', payload: [] })
    showToast(`${ids.length} photos restored to library`)
  }

  async function handleRestoreSelected() {
    const ids = Array.from(state.selectedIds)
    if (ids.length === 0) return
    await window.photoVault.restore(ids)
    dispatch({ type: 'REMOVE_PHOTOS', payload: ids })
    dispatch({ type: 'DESELECT_ALL' })
    showToast(`${ids.length} photos restored to library`)
  }

  async function confirmAndDeleteSelected() {
    const ids = Array.from(state.selectedIds)
    if (ids.length === 0) return
    const bytesDeleted = ids.reduce((sum, id) => {
      const p = state.photos.find(photo => photo.id === id)
      return sum + (p?.file_size || 0)
    }, 0)
    await window.photoVault.deletePermanently(ids)
    dispatch({ type: 'REMOVE_PHOTOS', payload: ids })
    dispatch({ type: 'DESELECT_ALL' })
    setShowDeleteSelectedConfirm(false)
    setShowEmptyConfirm(false)
    showToast(`${ids.length} items permanently deleted (${formatFileSize(bytesDeleted)} freed)`)
  }

  function handleContextMenu(e: React.MouseEvent, photoId: number) {
    setContextMenu({ x: e.clientX, y: e.clientY, photoId })
  }

  const trashCustomActions: ContextMenuAction[] = [
    {
      label: 'Restore to library',
      icon: <RotateCcw size={18} />,
      onClick: async (id) => {
        await window.photoVault.restore([id])
        dispatch({ type: 'REMOVE_PHOTOS', payload: [id] })
        showToast('Restored photo to library')
      }
    },
    {
      label: 'Details',
      icon: <Info size={18} />,
      onClick: (id) => {
        dispatch({
          type: 'SET_VIEWER_SCOPED',
          payload: { photoId: id, photos: state.photos }
        })
      }
    },
    {
      label: 'Open in explorer',
      icon: <FolderOpen size={18} />,
      onClick: (id) => {
        const photo = state.photos.find(p => p.id === id)
        if (photo) window.photoVault.openInExplorer(photo.file_path)
      }
    },
    {
      label: 'Delete permanently',
      icon: <Trash2 size={18} />,
      danger: true,
      onClick: (id) => {
        dispatch({ type: 'SELECT_PHOTO', payload: id })
        setShowEmptyConfirm(false)
        setShowDeleteSelectedConfirm(true)
      }
    }
  ]

  return (
    <div className="photos-page-container">
      {/* Floating Selection Bar Dock */}
      <SelectionBar
        customActions={
          <>
            <button
              type="button"
              className="dock-action-btn"
              onClick={handleRestoreSelected}
              title="Restore selected to library"
            >
              <RotateCcw size={15} />
              <span>Restore</span>
            </button>
            <button
              type="button"
              className="dock-action-btn dock-action-trash"
              onClick={() => {
                setShowEmptyConfirm(false)
                setShowDeleteSelectedConfirm(true)
              }}
              title="Delete permanently from disk"
            >
              <Trash2 size={15} />
              <span>Delete Permanently</span>
            </button>
          </>
        }
        hideDelete={true}
      />

      {/* Date Scrubber Bar for 100GB fast scroll */}
      <DateScrubber
        years={uniqueYears}
        onSelectYear={(year) => {
          setTargetYear(year)
          showToast(`Jumped to year ${year}`)
        }}
      />

      {/* Action Header & Notice Container */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {state.photos.length > 0 && (
              <span className="apple-storage-pill">
                {state.photos.length} items • {formatFileSize(totalTrashBytes)}
              </span>
            )}
          </div>

          {/* Action Buttons */}
          {state.photos.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
              <button
                type="button"
                className="apple-secondary-btn"
                onClick={handleRestoreAll}
              >
                <RotateCcw size={14} />
                <span>Restore All</span>
              </button>
              <button
                type="button"
                className="apple-secondary-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowDeleteSelectedConfirm(false)
                  setShowEmptyConfirm(true)
                }}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  gap: '6px'
                }}
              >
                <Trash2 size={14} />
                <span>Empty Trash</span>
              </button>
            </div>
          )}
        </div>

        {/* Warning Notice Banner */}
        {state.photos.length > 0 && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '14px',
              padding: '10px 16px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '13px',
              color: 'var(--text-secondary)'
            }}
          >
            <AlertTriangle size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
            <span>Permanently deleting items frees up disk storage on your computer. Deleted items cannot be restored.</span>
          </div>
        )}
      </div>

      {/* Photos Grid or Empty State */}
      {!state.isLoading && state.photos.length === 0 ? (
        <EmptyState
          icon={
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="trashIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
              <Trash2
                size={46}
                strokeWidth={1.8}
                stroke="url(#trashIconGrad)"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
              />
            </div>
          }
          title={
            <>
              Trash is <span className="title-sort-gradient">Empty</span>
            </>
          }
          description="Photos and videos you delete will appear here. Items in trash are saved before permanent deletion."
        />
      ) : (
        <PhotoGrid
          photos={state.photos}
          showDateHeaders={true}
          onContextMenu={handleContextMenu}
          scrollToYear={targetYear}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          photoId={contextMenu.photoId}
          onClose={() => setContextMenu(null)}
          customActions={trashCustomActions}
        />
      )}

      {/* Confirmation Modal for Empty Trash */}
      {showEmptyConfirm && (
        <div className="modal-overlay" onClick={() => setShowEmptyConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', borderRadius: '20px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={20} color="#ef4444" /> Empty Trash?
              </h3>
              <button className="modal-close" onClick={() => setShowEmptyConfirm(false)} title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
                All <strong>{state.photos.length} items</strong> ({formatFileSize(totalTrashBytes)}) in trash will be permanently deleted from your computer. This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="apple-secondary-btn" onClick={() => setShowEmptyConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="apple-secondary-btn"
                onClick={confirmAndEmptyTrash}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  fontWeight: 600
                }}
              >
                Empty Trash Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Delete Selected */}
      {showDeleteSelectedConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteSelectedConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', borderRadius: '20px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ShieldAlert size={20} color="#ef4444" /> Delete Permanently?
              </h3>
              <button className="modal-close" onClick={() => setShowDeleteSelectedConfirm(false)} title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0, lineHeight: 1.5 }}>
                <strong>{state.selectedIds.size} selected item{state.selectedIds.size > 1 ? 's' : ''}</strong> will be permanently removed from your computer. This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" className="apple-secondary-btn" onClick={() => setShowDeleteSelectedConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="apple-secondary-btn"
                onClick={confirmAndDeleteSelected}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  fontWeight: 600
                }}
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
