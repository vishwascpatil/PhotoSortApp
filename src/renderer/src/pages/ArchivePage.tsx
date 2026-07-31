import React, { useEffect } from 'react'
import { Archive, Info } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import EmptyState from '../components/EmptyState'

export default function ArchivePage() {
  const { state, loadPhotos } = usePhotos()

  useEffect(() => {
    loadPhotos({ isArchived: true })
  }, [loadPhotos])

  if (!state.isLoading && state.photos.length === 0) {
    return (
      <EmptyState
        icon={<Archive size={48} />}
        title="Archive is empty"
        description="Photos you archive will appear here. Archived photos won't show up in your main photo grid but you can find them here anytime."
      />
    )
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Archive</h1>
      </div>
      <div className="trash-banner">
        <Info size={16} className="icon" />
        <span>Archived photos are hidden from your main Photos view but can be accessed here.</span>
      </div>
      <SelectionBar />
      <PhotoGrid photos={state.photos} showDateHeaders={true} />
    </>
  )
}
