import React, { useEffect, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import EmptyState from '../components/EmptyState'

export default function SearchPage() {
  const { state: appState } = useApp()
  const { state, dispatch } = usePhotos()
  const [results, setResults] = useState<Photo[]>([])
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (appState.searchQuery) {
      performSearch(appState.searchQuery)
    }
  }, [appState.searchQuery])

  async function performSearch(query: string) {
    const photos = await window.photoVault.search(query)
    setResults(photos)
    dispatch({ type: 'SET_PHOTOS', payload: photos })
    setSearched(true)
  }

  if (!appState.searchQuery) {
    return (
      <EmptyState
        icon={<SearchIcon size={48} />}
        title="Search your photos"
        description="Search by filename, camera model, or date to find your photos."
      />
    )
  }

  if (searched && results.length === 0) {
    return (
      <EmptyState
        icon={<SearchIcon size={48} />}
        title="No results found"
        description={`No photos found matching "${appState.searchQuery}". Try a different search term.`}
      />
    )
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">
          Search results for "{appState.searchQuery}"
        </h1>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          {results.length} photo{results.length !== 1 ? 's' : ''}
        </span>
      </div>
      <SelectionBar />
      <PhotoGrid photos={state.photos} showDateHeaders={true} />
    </>
  )
}
