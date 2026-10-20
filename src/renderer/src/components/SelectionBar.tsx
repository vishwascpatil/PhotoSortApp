import React from 'react'
import { X, Trash2, LayoutGrid, Columns } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'

interface SelectionBarProps {
  onAddToAlbum?: () => void
  onCollage?: () => void
  onCompare?: () => void
  customActions?: React.ReactNode
  hideDelete?: boolean
  onTrash?: () => void
}

export default function SelectionBar({
  onCollage,
  onCompare,
  customActions,
  hideDelete = false,
  onTrash
}: SelectionBarProps = {}) {
  const { state, dispatch, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const count = state.selectedIds.size
  if (count === 0) return null

  const ids = Array.from(state.selectedIds)

  async function handleDefaultTrash() {
    if (onTrash) {
      onTrash()
      return
    }
    await window.photoVault.trash(ids)
    dispatch({ type: 'REMOVE_PHOTOS', payload: ids })
    showToast(`${count} photo${count > 1 ? 's' : ''} moved to trash`, async () => {
      await window.photoVault.restore(ids)
      refreshPhotos()
    })
  }

  return (
    <div className="selection-floating-dock">
      {/* Dismiss / Close Button */}
      <button 
        className="dock-btn-circle" 
        onClick={() => dispatch({ type: 'DESELECT_ALL' })}
        title="Clear selection (Esc)"
      >
        <X size={15} />
      </button>

      {/* Purple-Blue Glowing Count Badge */}
      <div className="dock-count-badge">
        <span className="dock-count-number">{count}</span>
        <span className="dock-count-text">selected</span>
      </div>

      <div className="dock-divider" />

      {/* Optional Collage Action */}
      {onCollage && (
        <button
          type="button"
          className="dock-action-btn dock-action-collage"
          onClick={onCollage}
          title="Create collage from selected"
        >
          <LayoutGrid size={15} />
          <span>Collage</span>
        </button>
      )}

      {/* Optional Compare Action */}
      {onCompare && count >= 2 && (
        <button
          type="button"
          className="dock-action-btn dock-action-compare"
          onClick={onCompare}
          title="Compare selected photos side-by-side"
        >
          <Columns size={15} />
          <span>Compare</span>
        </button>
      )}

      {/* Custom Actions (e.g. for Trash, Large Files, Social Media) */}
      {customActions}

      {/* Default Delete / Trash Button */}
      {!customActions && !hideDelete && (
        <button 
          type="button"
          className="dock-action-btn dock-action-trash" 
          onClick={handleDefaultTrash} 
          title="Delete selected photos"
        >
          <Trash2 size={15} />
          <span>Delete</span>
        </button>
      )}
    </div>
  )
}
