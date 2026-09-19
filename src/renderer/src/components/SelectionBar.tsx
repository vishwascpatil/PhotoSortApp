import React from 'react'
import { X, Trash2 } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'

interface SelectionBarProps {
  onAddToAlbum?: () => void
  onCollage?: () => void
  onCompare?: () => void
}

export default function SelectionBar({}: SelectionBarProps = {}) {
  const { state, dispatch, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const count = state.selectedIds.size
  if (count === 0) return null

  const ids = Array.from(state.selectedIds)

  async function handleTrash() {
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

      {/* Delete / Trash Button */}
      <button 
        className="dock-action-btn dock-action-trash" 
        onClick={handleTrash} 
        title="Delete selected photos"
      >
        <Trash2 size={15} />
        <span>Delete</span>
      </button>
    </div>
  )
}
