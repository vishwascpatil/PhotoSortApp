import React, { useEffect, useMemo } from 'react'
import { Star } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import EmptyState from '../components/EmptyState'

export default function FavoritesPage() {
  const { state, loadPhotos } = usePhotos()

  useEffect(() => {
    const isSpecialFilter = state.activeFilter && (state.activeFilter.isTrashed || state.activeFilter.isArchived || state.activeFilter.isLocked || state.activeFilter.search)
    if (isSpecialFilter || state.photos.length === 0) {
      loadPhotos({})
    }
  }, [loadPhotos, state.activeFilter, state.photos.length])

  // Instant in-memory filtering (0ms)
  const favorites = useMemo(() => {
    return state.photos.filter(p => p.is_favorite === 1)
  }, [state.photos])

  if (!state.isLoading && favorites.length === 0) {
    return (
      <EmptyState
        icon={<Star size={48} />}
        title="No favorites yet"
        description="Photos you mark as favorites will appear here. Tap the heart icon on any photo to add it to your favorites."
      />
    )
  }

  return (
    <>
      <div className="page-header" style={{ padding: '24px 32px 0 32px' }}>
        <h1 className="page-title">Favorites</h1>
      </div>
      <div style={{ padding: '0 32px' }}>
        <SelectionBar />
        <PhotoGrid photos={favorites} showDateHeaders={true} />
      </div>
    </>
  )
}
