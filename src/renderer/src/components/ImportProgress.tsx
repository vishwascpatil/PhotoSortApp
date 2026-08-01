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
    <div className="import-progress-hud">
      <div className="import-progress-header">
        <span className="import-progress-title">
          {importStatus.stage === 'done' ? (
            <span style={{ color: '#34d399' }}>✓ Import Complete</span>
          ) : (
            <>
              <span className="badge-dot" style={{ background: '#6366f1' }} />
              {importStatus.stage === 'scanning' ? 'Scanning Folder...' :
               importStatus.stage === 'processing' ? 'Extracting Metadata...' :
               importStatus.stage === 'thumbnails' ? 'Generating Previews...' :
               importStatus.stage === 'saving' ? 'Saving Library...' : 'Importing...'}
            </>
          )}
        </span>
        <span className="import-progress-count">
          {importStatus.total > 0 ? `${importStatus.completed} / ${importStatus.total}` : ''}
        </span>
      </div>
      <div className="import-progress-bar-track">
        <div
          className="import-progress-bar-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="import-progress-subtext" title={importStatus.message}>
        {importStatus.message || 'Processing photo & video media...'}
      </div>
    </div>
  )
}
