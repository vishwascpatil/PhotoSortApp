import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react'
import { Check, Heart, Play, FileText } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Photo, usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { getThumbnailUrl, formatDate } from '../utils/helpers'

interface PhotoGridProps {
  photos: Photo[]
  showDateHeaders?: boolean
  onContextMenu?: (e: React.MouseEvent, photoId: number) => void
}

type RowItem =
  | {
      type: 'header'
      key: string
      date: string
      photos: Photo[]
    }
  | {
      type: 'photos'
      key: string
      photos: Photo[]
      date: string
    }

export default function PhotoGrid({ photos, showDateHeaders = true, onContextMenu }: PhotoGridProps) {
  const { state: photoState, dispatch: photoDispatch } = usePhotos()
  const { state: appState, showToast } = useApp()
  const lastClickedRef = useRef<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const thumbnailSize = appState.gridDensity === 'comfortable' ? 240 : appState.gridDensity === 'medium' ? 160 : 100
  const gap = 4

  // Measure container width dynamically to adaptively fit columns
  const [containerWidth, setContainerWidth] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.max(300, window.innerWidth - 280)
    }
    return 1200
  })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateWidth = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0) {
        setContainerWidth(rect.width)
      }
    }

    updateWidth()

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setContainerWidth(entry.contentRect.width)
        }
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Number of photo columns that fit in the container
  const columns = useMemo(() => {
    return Math.max(1, Math.floor((containerWidth + gap) / (thumbnailSize + gap)))
  }, [containerWidth, thumbnailSize])

  // Exact width and height of each square tile in the row
  const tileWidth = useMemo(() => {
    return Math.floor((containerWidth - (columns - 1) * gap) / columns)
  }, [containerWidth, columns])

  const photoRowHeight = tileWidth

  // Flatten photos and date headers into virtual rows
  const rowItems = useMemo(() => {
    const items: RowItem[] = []
    if (!photos || photos.length === 0) return items

    if (!showDateHeaders) {
      for (let i = 0; i < photos.length; i += columns) {
        const chunk = photos.slice(i, i + columns)
        items.push({
          type: 'photos',
          key: `row-${i}-${chunk[0]?.id || i}`,
          photos: chunk,
          date: ''
        })
      }
      return items
    }

    // Group photos by date
    let currentDate = ''
    let currentGroup: Photo[] = []

    const flushGroup = (dateKey: string, groupPhotos: Photo[]) => {
      if (groupPhotos.length === 0) return
      items.push({
        type: 'header',
        key: `header-${dateKey}`,
        date: dateKey,
        photos: groupPhotos
      })
      for (let i = 0; i < groupPhotos.length; i += columns) {
        const chunk = groupPhotos.slice(i, i + columns)
        items.push({
          type: 'photos',
          key: `row-${dateKey}-${i}-${chunk[0]?.id || i}`,
          photos: chunk,
          date: dateKey
        })
      }
    }

    for (const photo of photos) {
      const raw = photo.created_at || ''
      const dateKey = raw ? (raw.split('T')[0] || raw.split(' ')[0]) : 'Unknown Date'
      if (dateKey !== currentDate) {
        if (currentGroup.length > 0) {
          flushGroup(currentDate, currentGroup)
        }
        currentDate = dateKey
        currentGroup = [photo]
      } else {
        currentGroup.push(photo)
      }
    }
    if (currentGroup.length > 0) {
      flushGroup(currentDate, currentGroup)
    }

    return items
  }, [photos, showDateHeaders, columns])

  // Virtualizer scroll target
  const getScrollElement = useCallback(() => {
    return (containerRef.current?.closest('.app-content') || document.querySelector('.app-content')) as HTMLElement | null
  }, [])

  const [scrollMargin, setScrollMargin] = useState(0)

  useEffect(() => {
    if (containerRef.current) {
      setScrollMargin(containerRef.current.offsetTop || 0)
    }
  }, [photos.length])

  const virtualizer = useVirtualizer({
    count: rowItems.length,
    getScrollElement,
    estimateSize: (index) => {
      const item = rowItems[index]
      if (item?.type === 'header') return 48
      return photoRowHeight + gap
    },
    scrollMargin,
    overscan: 4
  })

  // Re-measure when column or row sizes change
  useEffect(() => {
    virtualizer.measure()
  }, [photoRowHeight, columns, thumbnailSize, virtualizer])

  const handleClick = useCallback((photoId: number, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedRef.current !== null) {
      photoDispatch({ type: 'SELECT_RANGE', payload: { from: lastClickedRef.current, to: photoId } })
    } else if (e.ctrlKey || e.metaKey) {
      photoDispatch({ type: 'TOGGLE_SELECT', payload: photoId })
    } else if (photoState.isSelecting) {
      photoDispatch({ type: 'TOGGLE_SELECT', payload: photoId })
    } else {
      photoDispatch({ type: 'SET_VIEWER_SCOPED', payload: { photoId, photos } })
    }
    lastClickedRef.current = photoId
  }, [photoState.isSelecting, photoDispatch, photos])

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

  if (photos.length === 0) {
    return <div ref={containerRef} className="photo-grid-container" />
  }

  return (
    <div
      ref={containerRef}
      className="photo-grid-container"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: `${virtualizer.getTotalSize()}px`,
        contain: 'layout size'
      }}
    >
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = rowItems[virtualItem.index]
        if (!item) return null

        return (
          <div
            key={item.key}
            data-index={virtualItem.index}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
              willChange: 'transform'
            }}
          >
            {item.type === 'header' ? (
              <DateHeaderRow
                date={item.date}
                photos={item.photos}
                selectedIds={photoState.selectedIds}
                onSelectDate={handleSelectDate}
              />
            ) : (
              <div
                className="photo-grid-virtual-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  gap: `${gap}px`,
                  width: '100%',
                  height: `${photoRowHeight}px`
                }}
              >
                {item.photos.map((photo) => (
                  <PhotoTile
                    key={photo.id}
                    photo={photo}
                    isSelected={photoState.selectedIds.has(photo.id)}
                    onClick={handleClick}
                    onCheckbox={handleCheckbox}
                    onFavorite={handleFavorite}
                    onContextMenu={onContextMenu}
                  />
                ))}
                {Array.from({ length: Math.max(0, columns - item.photos.length) }).map((_, i) => (
                  <div key={`spacer-${i}`} style={{ width: '100%', height: '100%', pointerEvents: 'none' }} />
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Memoized Date Header Row ───────────────────────────────────────────

interface DateHeaderRowProps {
  date: string
  photos: Photo[]
  selectedIds: Set<number>
  onSelectDate: (photos: Photo[]) => void
}

const DateHeaderRow = React.memo(function DateHeaderRow({
  date,
  photos,
  selectedIds,
  onSelectDate
}: DateHeaderRowProps) {
  const allSelected = useMemo(() => {
    return photos.length > 0 && photos.every(p => selectedIds.has(p.id))
  }, [photos, selectedIds])

  return (
    <div className="photo-grid-date-header" style={{ margin: 0, height: '44px', boxSizing: 'border-box' }}>
      <button
        className={`photo-grid-date-select ${allSelected ? 'checked' : ''}`}
        onClick={() => onSelectDate(photos)}
      >
        {allSelected && <Check size={14} />}
      </button>
      <span className="photo-grid-date-text">{formatDate(date)}</span>
      <span className="photo-grid-date-count">{photos.length} photos</span>
    </div>
  )
})

// ─── Memoized Photo Tile ────────────────────────────────────────────────

interface PhotoTileProps {
  photo: Photo
  isSelected: boolean
  onClick: (id: number, e: React.MouseEvent) => void
  onCheckbox: (id: number, e: React.MouseEvent) => void
  onFavorite: (id: number, e: React.MouseEvent) => void
  onContextMenu?: (e: React.MouseEvent, id: number) => void
}

const PhotoTile = React.memo(
  function PhotoTile({ photo, isSelected, onClick, onCheckbox, onFavorite, onContextMenu }: PhotoTileProps) {
    const [loaded, setLoaded] = useState(false)
    const thumbnailUrl = useMemo(() => getThumbnailUrl(photo.thumbnail_path, photo.file_path), [photo.thumbnail_path, photo.file_path])

    const isDocument = useMemo(() => {
      return !!photo.mime_type && (
        photo.mime_type.includes('pdf') ||
        photo.mime_type.includes('text') ||
        photo.mime_type.includes('word') ||
        photo.mime_type.includes('document')
      )
    }, [photo.mime_type])

    const isVideo = useMemo(() => {
      if (photo.mime_type?.startsWith('video') || (photo as any).media_type === 'video') return true
      const p = photo.file_path?.toLowerCase() || ''
      return p.endsWith('.mp4') || p.endsWith('.mov') || p.endsWith('.avi') || p.endsWith('.mkv') || p.endsWith('.webm') || p.endsWith('.m4v')
    }, [photo.mime_type, (photo as any).media_type, photo.file_path])

    return (
      <div
        className={`photo-tile ${isSelected ? 'selected' : ''}`}
        onClick={(e) => onClick(photo.id, e)}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu?.(e, photo.id)
        }}
      >
        {isDocument ? (
          <div
            className="photo-tile-img"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-tertiary)',
              color: 'var(--text-secondary)'
            }}
          >
            <FileText size={42} />
            <span
              style={{
                fontSize: '11px',
                marginTop: '6px',
                maxWidth: '85%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {photo.filename}
            </span>
          </div>
        ) : thumbnailUrl ? (
          <img
            className={`photo-tile-img ${loaded ? 'loaded' : 'loading'}`}
            src={thumbnailUrl}
            alt={photo.filename}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            draggable={false}
          />
        ) : (
          <div className="photo-tile-img" style={{ background: 'var(--bg-tertiary)' }} />
        )}

        <div className="photo-tile-overlay" />

        {isVideo && (
          <div
            className="video-badge"
            style={{
              position: 'absolute',
              bottom: '8px',
              left: '8px',
              background: 'rgba(0, 0, 0, 0.65)',
              color: 'white',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backdropFilter: 'blur(4px)',
              zIndex: 3
            }}
          >
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
  },
  (prev, next) => {
    return (
      prev.photo.id === next.photo.id &&
      prev.isSelected === next.isSelected &&
      prev.photo.is_favorite === next.photo.is_favorite &&
      prev.photo.thumbnail_path === next.photo.thumbnail_path &&
      prev.photo.preview_path === next.photo.preview_path &&
      prev.photo.file_path === next.photo.file_path &&
      prev.photo.filename === next.photo.filename
    )
  }
)
