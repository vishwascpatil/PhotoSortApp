import React, { useEffect, useState } from 'react'
import { Trash2, AlertTriangle, RotateCcw, X } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { formatFileSize } from '../utils/helpers'
import PhotoGrid from '../components/PhotoGrid'
import EmptyState from '../components/EmptyState'

export default function TrashPage() {
  const { state, dispatch, loadPhotos } = usePhotos()
  const { showToast } = useApp()
  const [showEmptyConfirm, setShowEmptyConfirm] = useState(false)
  const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false)

  useEffect(() => {
    loadPhotos({ isTrashed: true })
  }, [loadPhotos])

  async function confirmAndEmptyTrash() {
    const ids = state.photos.map(p => p.id)
    if (ids.length === 0) return
    const bytesDeleted = state.photos.reduce((sum, p) => sum + (p.file_size || 0), 0)
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
    showToast(`${ids.length} photos restored`)
  }

  async function handleRestoreSelected() {
    const ids = Array.from(state.selectedIds)
    if (ids.length === 0) return
    await window.photoVault.restore(ids)
    dispatch({ type: 'REMOVE_PHOTOS', payload: ids })
    showToast(`${ids.length} photos restored`)
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
    setShowDeleteSelectedConfirm(false)
    setShowEmptyConfirm(false)
    showToast(`${ids.length} items permanently deleted (${formatFileSize(bytesDeleted)} freed)`)
  }

  if (!state.isLoading && state.photos.length === 0) {
    return (
      <EmptyState
        icon={<Trash2 size={48} />}
        title="Trash is empty"
        description="Photos and videos you delete will appear here. Items in trash are saved before permanent deletion."
      />
    )
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Trash</h1>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={handleRestoreAll}>
            <RotateCcw size={16} /> Restore all
          </button>
          <button
            className="btn btn-danger"
            onClick={(e) => {
              e.stopPropagation()
              setShowDeleteSelectedConfirm(false)
              setShowEmptyConfirm(true)
            }}
          >
            <Trash2 size={16} /> Empty trash
          </button>
        </div>
      </div>

      <div className="trash-banner">
        <AlertTriangle size={16} className="icon" />
        <span>Items in trash will be automatically deleted after 30 days.</span>
      </div>

      {state.selectedIds.size > 0 && (
        <div className="selection-bar">
          <div className="selection-bar-count">
            <button className="selection-bar-btn" onClick={() => dispatch({ type: 'DESELECT_ALL' })}>
              <X size={14} />
            </button>
            {state.selectedIds.size} selected
          </div>
          <button className="selection-bar-btn" onClick={handleRestoreSelected} title="Restore">
            <RotateCcw size={20} />
          </button>
          <button
            className="selection-bar-btn"
            onClick={(e) => {
              e.stopPropagation()
              setShowEmptyConfirm(false)
              setShowDeleteSelectedConfirm(true)
            }}
            title="Delete permanently"
          >
            <Trash2 size={20} />
          </button>
        </div>
      )}

      <PhotoGrid photos={state.photos} showDateHeaders={false} />

      {/* Confirmation Modal for Empty Trash */}
      {showEmptyConfirm && (
        <div className="modal-overlay" onClick={() => setShowEmptyConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Empty Trash?</h3>
              <button className="modal-close" onClick={() => setShowEmptyConfirm(false)} title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                All {state.photos.length} items in trash will be permanently deleted from your device. This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer" style={{ marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowEmptyConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmAndEmptyTrash}>
                Empty Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Delete Selected */}
      {showDeleteSelectedConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteSelectedConfirm(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Delete permanently?</h3>
              <button className="modal-close" onClick={() => setShowDeleteSelectedConfirm(false)} title="Close">
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', margin: 0 }}>
                {state.selectedIds.size} selected item{state.selectedIds.size > 1 ? 's' : ''} will be permanently removed from your device. This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer" style={{ marginTop: '20px' }}>
              <button className="btn btn-ghost" onClick={() => setShowDeleteSelectedConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmAndDeleteSelected}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
