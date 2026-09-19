import React, { useEffect, useMemo } from 'react'
import { Heart } from 'lucide-react'
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
