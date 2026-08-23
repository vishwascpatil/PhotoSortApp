import React, { useState, useCallback, useRef, useMemo } from 'react'
import { Check, Heart, Play, FileText } from 'lucide-react'
import { Photo, usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { getThumbnailUrl, getOriginalUrl, formatDate, groupPhotosByDate } from '../utils/helpers'


interface PhotoGridProps {
  photos: Photo[]
  showDateHeaders?: boolean
  onContextMenu?: (e: React.MouseEvent, photoId: number) => void
}

export default function PhotoGrid({ photos, showDateHeaders = true, onContextMenu }: PhotoGridProps) {
  const { state: photoState, dispatch: photoDispatch } = usePhotos()
  const { state: appState, showToast } = useApp()
  const lastClickedRef = useRef<number | null>(null)

  const thumbnailSize = appState.gridDensity === 'comfortable' ? 240 : appState.gridDensity === 'medium' ? 160 : 100

  // Group photos by date
  const dateGroups = useMemo(() => {
    if (!showDateHeaders) return [{ date: '', photos }]

    const groups: { date: string; photos: Photo[] }[] = []
    let currentDate = ''
    let currentGroup: Photo[] = []

    for (const photo of photos) {
      const dateKey = photo.created_at ? (photo.created_at.split('T')[0] || photo.created_at.split(' ')[0]) : 'Unknown Date'
      if (dateKey !== currentDate) {
        if (currentGroup.length > 0) {
          groups.push({ date: currentDate, photos: currentGroup })
        }
        currentDate = dateKey
        currentGroup = [photo]
      } else {
        currentGroup.push(photo)
      }
    }
    if (currentGroup.length > 0) {
      groups.push({ date: currentDate, photos: currentGroup })
    }

    return groups
  }, [photos, showDateHeaders])

  const handleClick = useCallback((photoId: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedRef.current !== null) {
      photoDispatch({ type: 'SELECT_RANGE', payload: { from: lastClickedRef.current, to: photoId } })
    } else if (e.ctrlKey || e.metaKey) {
      photoDispatch({ type: 'TOGGLE_SELECT', payload: photoId })
    } else if (photoState.isSelecting) {
      photoDispatch({ type: 'TOGGLE_SELECT', payload: photoId })
    } else {
      photoDispatch({ type: 'SET_VIEWER', payload: photoId })
    }
    lastClickedRef.current = photoId
  }, [photoState.isSelecting, photoDispatch])

  const handleCheckbox = useCallback((photoId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    photoDispatch({ type: 'TOGGLE_SELECT', payload: photoId })
    lastClickedRef.current = photoId
  }, [photoDispatch])

  const handleFavorite = useCallback(async (photoId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    const isFav = await window.photoVault.toggleFavorite(photoId)
    const photo = photos.find(p => p.id === photoId)
    if (photo) {
      photoDispatch({
        type: 'UPDATE_PHOTO',
        payload: { ...photo, is_favorite: isFav ? 1 : 0 }
      })
    }
    showToast(isFav ? 'Added to favorites' : 'Removed from favorites')
  }, [photos, photoDispatch, showToast])

  const handleSelectDate = useCallback((datePhotos: Photo[]) => {
    const allSelected = datePhotos.every(p => photoState.selectedIds.has(p.id))
    if (allSelected) {
      datePhotos.forEach(p => photoDispatch({ type: 'DESELECT_PHOTO', payload: p.id }))
    } else {
      datePhotos.forEach(p => photoDispatch({ type: 'SELECT_PHOTO', payload: p.id }))
    }
  }, [photoState.selectedIds, photoDispatch])

  return (
    <div className="photo-grid-container">
      {dateGroups.map((group, gi) => (
        <div key={`${group.date || 'unknown'}-${gi}`} className="photo-grid-date-group">
          {showDateHeaders && group.date && (
            <div className="photo-grid-date-header">
              <button
                className={`photo-grid-date-select ${
                  group.photos.every(p => photoState.selectedIds.has(p.id)) ? 'checked' : ''
                }`}
                onClick={() => handleSelectDate(group.photos)}
              >
                {group.photos.every(p => photoState.selectedIds.has(p.id)) && <Check size={14} />}
              </button>
              <span className="photo-grid-date-text">{formatDate(group.date)}</span>
              <span className="photo-grid-date-count">{group.photos.length} photos</span>
            </div>
          )}
          <div className="photo-grid">
            {group.photos.map((photo) => (
              <PhotoTile
                key={photo.id}
                photo={photo}
                size={thumbnailSize}
                isSelected={photoState.selectedIds.has(photo.id)}
                onClick={handleClick}
                onCheckbox={handleCheckbox}
                onFavorite={handleFavorite}
                onContextMenu={onContextMenu}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Photo Tile ─────────────────────────────────────────────────────────

interface PhotoTileProps {
  photo: Photo
  size: number
  isSelected: boolean
  onClick: (id: number, e: React.MouseEvent) => void
  onCheckbox: (id: number, e: React.MouseEvent) => void
  onFavorite: (id: number, e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent, id: number) => void
}

function PhotoTile({ photo, size, isSelected, onClick, onCheckbox, onFavorite, onContextMenu }: PhotoTileProps) {
  const [loaded, setLoaded] = useState(false)
  const thumbnailUrl = getThumbnailUrl(photo.thumbnail_path, photo.file_path)
  const originalUrl = getOriginalUrl(photo.file_path)

  // Enforce uniform square grid instead of justified layout
  const width = size

  const isDocument = photo.mime_type && (
    photo.mime_type.includes('pdf') || 
    photo.mime_type.includes('text') || 
    photo.mime_type.includes('word') || 
    photo.mime_type.includes('document')
  )

  return (
    <div
      className={`photo-tile ${isSelected ? 'selected' : ''}`}
      style={{ width: `${width}px`, height: `${size}px` }}
      onClick={(e) => onClick(photo.id, e)}
      onContextMenu={(e) => {
        e.preventDefault()
        onContextMenu?.(e, photo.id)
      }}
    >
      {isDocument ? (
        <div className="photo-tile-img" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          <FileText size={48} />
          <span style={{ fontSize: '12px', marginTop: '8px', maxWidth: '80%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo.filename}</span>
        </div>
      ) : thumbnailUrl ? (
        <img
          className={`photo-tile-img ${loaded ? 'loaded' : 'loading'}`}
          src={thumbnailUrl}
          alt={photo.filename}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          draggable={false}
        />
      ) : (
        <div className="photo-tile-img" style={{ background: 'var(--bg-tertiary)' }} />
      )}

      <div className="photo-tile-overlay" />

      {(photo.mime_type?.startsWith('video') || photo.media_type === 'video' || ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v'].some(ext => photo.file_path?.toLowerCase().endsWith(ext))) && (
        <div className="video-badge" style={{
          position: 'absolute', bottom: '8px', left: '8px',
          background: 'rgba(0, 0, 0, 0.65)', color: 'white',
          width: '24px', height: '24px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)', zIndex: 3
        }}>
          <Play size={12} fill="white" style={{ marginLeft: '1px' }} />
        </div>
      )}

      <button
        className={`photo-tile-checkbox ${isSelected ? 'checked' : ''}`}
        onClick={(e) => onCheckbox(photo.id, e)}
      >
        {isSelected && <Check size={14} color="white" />}
      </button>

      <button
        className={`photo-tile-favorite ${photo.is_favorite ? 'is-favorite' : ''}`}
        onClick={(e) => onFavorite(photo.id, e)}
      >
        <Heart size={18} fill={photo.is_favorite ? 'currentColor' : 'none'} />
      </button>
    </div>
  )
}
