import React, { useEffect, useRef } from 'react'
import { Heart, FolderPlus, Trash2, Info, FolderOpen, ExternalLink } from 'lucide-react'

interface ContextMenuProps {
  x: number
  y: number
  photoId: number
  onClose: () => void
  onFavorite: (id: number) => void
  onTrash: (id: number) => void
  onInfo: (id: number) => void
  onOpenInExplorer: (id: number) => void
}

export default function ContextMenu({
  x, y, photoId, onClose, onFavorite, onTrash, onInfo, onOpenInExplorer
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position if menu would go off-screen
  const adjustedX = Math.min(x, window.innerWidth - 220)
  const adjustedY = Math.min(y, window.innerHeight - 280)

  return (
    <div className="context-menu" ref={menuRef} style={{ left: adjustedX, top: adjustedY }}>
      <button className="context-menu-item" onClick={() => { onFavorite(photoId); onClose() }}>
        <Heart size={18} className="icon" />
        Favorite
      </button>
      <button className="context-menu-item" onClick={() => { onInfo(photoId); onClose() }}>
        <Info size={18} className="icon" />
        Details
      </button>
      <button className="context-menu-item" onClick={() => { onOpenInExplorer(photoId); onClose() }}>
        <FolderOpen size={18} className="icon" />
        Open in explorer
      </button>
      <div className="context-menu-divider" />
      <button className="context-menu-item danger" onClick={() => { onTrash(photoId); onClose() }}>
        <Trash2 size={18} className="icon" />
        Move to trash
      </button>
    </div>
  )
}
