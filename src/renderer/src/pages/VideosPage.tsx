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

  const handleImportVideos = async () => {
    await window.photoVault.importFolder()
  }

  return (
    <div className="photos-page" style={{ padding: '24px 32px' }}>
      {photoState.isSelecting && <SelectionBar />}

      {/* Header matching All Photos */}
      <div className="page-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #6366f1 0%, #3b82f6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.25)'
          }}>
            <Film size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '28px', fontWeight: 800, margin: 0, color: 'var(--text-primary, #0f172a)' }}>Videos</h1>
            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary, #64748b)', margin: 0 }}>
              {videos.length} {videos.length === 1 ? 'video' : 'videos'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid identical to All Photos */}
      {videos.length === 0 ? (
        <EmptyState
          icon={<Film size={48} />}
          title="No Videos Found"
          description="Your photo vault library does not contain any video files yet. Import a folder containing MP4, MOV, or AVI videos."
          actionLabel="Import Videos"
          onAction={handleImportVideos}
        />
      ) : (
        <PhotoGrid photos={videos} showDateHeaders={true} />
      )}
    </div>
  )
}
