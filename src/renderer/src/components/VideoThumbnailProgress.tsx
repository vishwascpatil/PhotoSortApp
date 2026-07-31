import React, { useEffect, useState } from 'react'

export default function VideoThumbnailProgress() {
  const [status, setStatus] = useState({ total: 0, completed: 0, active: false })

  useEffect(() => {
    if (window.photoVault?.onVideoThumbnailProgress) {
      return window.photoVault.onVideoThumbnailProgress((newStatus) => {
        setStatus(newStatus)
      })
    }
  }, [])

  if (!status.active) return null

  const progress = status.total > 0
    ? Math.round((status.completed / status.total) * 100)
    : 0

  return (
    <div className="import-progress" style={{ top: '70px', left: '50%', transform: 'translateX(-50%)', bottom: 'auto', right: 'auto', width: '300px', padding: '16px', zIndex: 1000, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
      <div className="import-progress-header" style={{ marginBottom: '12px' }}>
        <span className="import-progress-title" style={{ fontSize: '13px', fontWeight: 600 }}>
          Generating Video Thumbnails
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontWeight: 500 }}>
          {status.completed}/{status.total}
        </span>
      </div>
      <div className="import-progress-bar" style={{ height: '6px', marginBottom: '8px' }}>
        <div
          className="import-progress-bar-fill"
          style={{ width: `${progress}%`, transition: 'width 0.3s ease' }}
        />
      </div>
      <div className="import-progress-message" style={{ fontSize: '11px' }}>
        Extracting frames in background...
      </div>
    </div>
  )
}
