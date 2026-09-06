import React, { useEffect, useMemo } from 'react'
import { Star, Heart } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import EmptyState from '../components/EmptyState'

export default function FavoritesPage() {
  const { state: photoState, loadPhotos } = usePhotos()

  const filterKey = JSON.stringify(photoState.activeFilter)
  useEffect(() => {
    const isSpecialFilter =
      photoState.activeFilter &&
      (photoState.activeFilter.isTrashed ||
        photoState.activeFilter.isArchived ||
        photoState.activeFilter.isLocked ||
        photoState.activeFilter.search)
    if (isSpecialFilter || photoState.photos.length === 0) {
      loadPhotos({})
    }
  }, [loadPhotos, filterKey, photoState.photos.length])

  // Instant in-memory filtering (0ms)
  const favorites = useMemo(() => {
    return photoState.photos.filter(p => p.is_favorite === 1)
  }, [photoState.photos])

  return (
    <div className="photos-page" style={{ padding: '24px 32px' }}>
      {photoState.isSelecting && <SelectionBar />}

      {/* Modern Apple HIG Header */}
      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)'
            }}
          >
            <Star size={22} fill="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>
                Favorites
              </h1>
              {favorites.length > 0 && (
                <span
                  style={{
                    background: 'rgba(236, 72, 153, 0.15)',
                    color: '#ec4899',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '2px 9px',
                    borderRadius: '12px'
                  }}
                >
                  {favorites.length} {favorites.length === 1 ? 'photo' : 'photos'}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #64748b)', margin: '2px 0 0 0' }}>
              Photos you’ve pinned with a heart appear here for quick access.
            </p>
          </div>
        </div>
      </div>

      {/* Photos Grid or Empty State */}
      {!photoState.isLoading && favorites.length === 0 ? (
        <EmptyState
          icon={<Heart size={48} color="#ec4899" />}
          title="No favorites yet"
          description="Photos you mark as favorites will appear here. Click the heart icon on any photo or use the context menu to pin your best shots."
        />
      ) : (
        <PhotoGrid photos={favorites} showDateHeaders={true} />
      )}
    </div>
  )
}
