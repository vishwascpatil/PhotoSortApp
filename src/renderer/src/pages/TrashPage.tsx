import React, { useEffect, useState, useMemo } from 'react'
import { Trash2, AlertTriangle, RotateCcw, X, ShieldAlert } from 'lucide-react'
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

  const totalTrashBytes = useMemo(() => {
    return state.photos.reduce((sum, p) => sum + (p.file_size || 0), 0)
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
    setShowDeleteSelectedConfirm(false)
    setShowEmptyConfirm(false)
    showToast(`${ids.length} items permanently deleted (${formatFileSize(bytesDeleted)} freed)`)
  }

  return (
    <div className="photos-page" style={{ padding: '24px 32px' }}>
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
            marginBottom: '20px',
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

      {/* Floating Selection Bar */}
      {state.selectedIds.size > 0 && (
        <div className="selection-bar">
          <div className="selection-bar-count">
            <button className="selection-bar-btn" onClick={() => dispatch({ type: 'DESELECT_ALL' })}>
              <X size={14} />
            </button>
            {state.selectedIds.size} selected
          </div>
          <button className="selection-bar-btn" onClick={handleRestoreSelected} title="Restore selected to library">
            <RotateCcw size={18} />
          </button>
          <button
            className="selection-bar-btn"
            onClick={(e) => {
              e.stopPropagation()
              setShowEmptyConfirm(false)
              setShowDeleteSelectedConfirm(true)
            }}
            title="Delete permanently from disk"
          >
            <Trash2 size={18} />
          </button>
        </div>
      )}

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
        <PhotoGrid photos={state.photos} showDateHeaders={false} />
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
