import React, { useEffect, useMemo } from 'react'
import { Film } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import EmptyState from '../components/EmptyState'

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v']

export default function VideosPage() {
  const { state: photoState, loadPhotos, refreshPhotos } = usePhotos()

  const filterKey = JSON.stringify(photoState.activeFilter)
  useEffect(() => {
    const isSpecialFilter = photoState.activeFilter && (photoState.activeFilter.isTrashed || photoState.activeFilter.isArchived || photoState.activeFilter.isLocked || photoState.activeFilter.search)
    if (isSpecialFilter || photoState.photos.length === 0) {
      loadPhotos({})
    }
  }, [loadPhotos, filterKey, photoState.photos.length])

  // Listen for import completion to auto refresh
  useEffect(() => {
    const cleanup = window.photoVault.onImportStatus((status) => {
      if (status.stage === 'done') {
        refreshPhotos()
      }
    })
    return cleanup
  }, [refreshPhotos])

  // Filter video files from photo library
  const videos = useMemo(() => {
    return photoState.photos.filter(p => {
      if (p.media_type === 'video') return true
      const ext = '.' + (p.file_path.split('.').pop() || '').toLowerCase()
      return VIDEO_EXTENSIONS.includes(ext)
    })
  }, [photoState.photos])

  return (
    <div className="photos-page" style={{ padding: '24px 32px' }}>
      {photoState.isSelecting && <SelectionBar />}

      {/* Main Grid identical to All Photos */}
      {videos.length === 0 ? (
        <EmptyState
          icon={
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="videoIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
              <Film
                size={46}
                strokeWidth={1.8}
                stroke="url(#videoIconGrad)"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
              />
            </div>
          }
          title={
            <>
              No <span className="title-sort-gradient">Videos</span> Found
            </>
          }
          description="Your video recordings from imported folders will appear here automatically. Supported formats include MP4, MOV, AVI, and MKV."
        />
      ) : (
        <PhotoGrid photos={videos} showDateHeaders={true} />
      )}
    </div>
  )
}
