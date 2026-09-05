import React from 'react'
import { X, Heart, Trash2, FolderPlus, Layout, Columns } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'

interface SelectionBarProps {
  onAddToAlbum?: () => void
  onCollage?: () => void
  onCompare?: () => void
}

export default function SelectionBar({ onAddToAlbum, onCollage, onCompare }: SelectionBarProps) {
  const { state, dispatch, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const count = state.selectedIds.size
  if (count === 0) return null

  const ids = Array.from(state.selectedIds)

  async function handleFavorite() {
    await window.photoVault.batchFavorite(ids, true)
    showToast(`${count} photo${count > 1 ? 's' : ''} added to favorites`)
    dispatch({ type: 'DESELECT_ALL' })
    refreshPhotos()
  }

  async function handleTrash() {
    await window.photoVault.trash(ids)
    dispatch({ type: 'REMOVE_PHOTOS', payload: ids })
    showToast(`${count} photo${count > 1 ? 's' : ''} moved to trash`, async () => {
      await window.photoVault.restore(ids)
      refreshPhotos()
    })
  }

  return (
    <div className="selection-bar">
      <div className="selection-bar-count">
        <button className="selection-bar-btn" onClick={() => dispatch({ type: 'DESELECT_ALL' })}>
          <X size={20} />
        </button>
        {count} selected
      </div>

      <button className="selection-bar-btn" onClick={handleFavorite} title="Add to favorites">
        <Heart size={20} />
      </button>

      {count >= 2 && count <= 9 && onCollage && (
        <button className="selection-bar-btn" onClick={onCollage} title="Create Collage">
          <Layout size={20} />
        </button>
      )}
      {count === 2 && onCompare && (
        <button className="selection-bar-btn" onClick={onCompare} title="Compare Side-by-Side">
          <Columns size={20} />
        </button>
      )}
      <button className="selection-bar-btn" onClick={handleTrash} title="Move to trash">
        <Trash2 size={20} />
      </button>
    </div>
  )
}
