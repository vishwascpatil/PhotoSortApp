import React, { useEffect } from 'react'
import { useApp } from '../contexts/AppContext'
import { usePhotos } from '../contexts/PhotoContext'
import { X } from 'lucide-react'

export default function ImportProgress() {
  const { state, dispatch } = useApp()
  const { refreshPhotos } = usePhotos()
  const { importStatus } = state

  useEffect(() => {
    if (importStatus.active && importStatus.stage === 'done') {
      refreshPhotos()
      const timer = setTimeout(() => {
        dispatch({ type: 'SET_IMPORT_STATUS', payload: { active: false, stage: 'scanning', message: '', total: 0, completed: 0 } })
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [importStatus.active, importStatus.stage, refreshPhotos, dispatch])

  if (!importStatus.active) return null

  const progress = importStatus.total > 0
    ? Math.round((importStatus.completed / importStatus.total) * 100)
    : 0

  return (
    <div className="import-progress">
      <div className="import-progress-header">
        <span className="import-progress-title">
          {importStatus.stage === 'scanning' ? 'Scanning...' :
           importStatus.stage === 'processing' ? 'Processing photos...' :
           importStatus.stage === 'thumbnails' ? 'Generating thumbnails...' :
           importStatus.stage === 'saving' ? 'Saving...' :
           importStatus.stage === 'done' ? 'Import Complete!' : 'Importing...'}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
          {importStatus.completed}/{importStatus.total}
        </span>
      </div>
      <div className="import-progress-bar">
        <div
          className="import-progress-bar-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="import-progress-message">{importStatus.message}</div>
    </div>
  )
}
