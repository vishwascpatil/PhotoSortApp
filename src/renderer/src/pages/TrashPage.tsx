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
      {/* Modern Apple HIG Header */}
      <div
        className="page-header"
        style={{
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)'
            }}
          >
            <Trash2 size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                Trash
              </h1>
              {state.photos.length > 0 && (
                <span
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '2px 9px',
                    borderRadius: '12px'
                  }}
                >
                  {state.photos.length} items • {formatFileSize(totalTrashBytes)}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #64748b)', margin: '2px 0 0 0' }}>
              Items in trash can be restored anytime before permanent deletion.
            </p>
          </div>
        </div>

        {state.photos.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleRestoreAll}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 14px' }}
            >
              <RotateCcw size={15} /> Restore All
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={(e) => {
                e.stopPropagation()
                setShowDeleteSelectedConfirm(false)
                setShowEmptyConfirm(true)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', padding: '8px 16px' }}
            >
              <Trash2 size={15} /> Empty Trash
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
          icon={<Trash2 size={48} />}
          title="Trash is empty"
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
              <button className="btn btn-ghost" onClick={() => setShowEmptyConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmAndEmptyTrash}>
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
              <button className="btn btn-ghost" onClick={() => setShowDeleteSelectedConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={confirmAndDeleteSelected}>
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
