import React, { useState, useEffect } from 'react'
import {
  Pause, Play, FileText, Sparkles, Folder, Check, Loader2
} from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { usePhotos } from '../contexts/PhotoContext'
import EmptyState from '../components/EmptyState'

interface ImportedFolder {
  id: number
  folder_path: string
  folder_name: string
  photo_count: number
  last_synced_at: string
  created_at: string
}

export default function ScanningLibraryPage() {
  const { state, navigateTo, dispatch } = useApp()
  const { state: photoState } = usePhotos()

  const [stats, setStats] = useState({ totalPhotos: 0, totalSize: 0, favorites: 0, albums: 0 })
  const [importedFolders, setImportedFolders] = useState<ImportedFolder[]>([])
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 3000)
    return () => clearInterval(interval)
  }, [])

  async function loadData() {
    try {
      if (window.photoVault) {
        const [s, f] = await Promise.all([
          window.photoVault.getStats ? window.photoVault.getStats() : { totalPhotos: 0, totalSize: 0, favorites: 0, albums: 0 },
          window.photoVault.getImportedFolders ? window.photoVault.getImportedFolders() : []
        ])
        setStats(s)
        setImportedFolders(f)
      }
    } catch {}
  }

  const importStatus = state.importStatus
  const isImporting = importStatus.active

  // Function to import folder
  const handleImportFolder = async () => {
    try {
      const result = await window.photoVault.importFolder();
      if (!result) return;
      dispatch({
        type: 'SET_IMPORT_STATUS',
        payload: { active: true, stage: 'scanning', message: 'Scanning folder structure for photos & videos...', total: 0, completed: 0 }
      });
      navigateTo('scanning-library');
    } catch (err) {
      console.error('Import folder error:', err);
    }
  };

  // Compute total & completed numbers dynamically
  const total = (importStatus.total && importStatus.total > 0) ? importStatus.total : stats.totalPhotos;
  const completed = isImporting ? Math.min(importStatus.completed, total) : total;

  // Accurate overall percentage calculation matching completed items
  let percent = 0
  if (!isImporting) {
    percent = total > 0 ? 100 : 0
  } else if (importStatus.stage === 'done') {
    percent = 100
  } else if (importStatus.stage === 'scanning') {
    percent = 10
  } else if (importStatus.stage === 'processing' || importStatus.stage === 'thumbnails') {
    percent = Math.round((completed / Math.max(1, total)) * 100)
  } else if (importStatus.stage === 'saving') {
    percent = 90
  }

  // Active folder details
  const activeFolder = importedFolders[0]
  const folderName = activeFolder ? activeFolder.folder_name : 'Imported Media'
  const folderPath = activeFolder ? activeFolder.folder_path : 'Selected Folder'

  // Pipeline Stage 1: Extracting Metadata
  let stage1Pct = 0
  let stage1CountStr = 'Waiting...'
  let isStage1Processing = false
  if (!isImporting && total > 0) {
    stage1Pct = 100
    stage1CountStr = `${total.toLocaleString()} / ${total.toLocaleString()}`
  } else if (importStatus.stage === 'scanning') {
    stage1Pct = 0
    stage1CountStr = 'Waiting...'
  } else if (importStatus.stage === 'processing') {
    isStage1Processing = true
    stage1Pct = Math.round((completed / Math.max(1, total)) * 100)
    stage1CountStr = `${completed.toLocaleString()} / ${total.toLocaleString()}`
  } else {
    stage1Pct = 100
    stage1CountStr = `${total.toLocaleString()} / ${total.toLocaleString()}`
  }

  // Pipeline Stage 2: Generating Thumbnails & Previews
  const isThumbnailStage = importStatus.stage === 'thumbnails'
  const stage2Done = !isImporting || importStatus.stage === 'done' || (stage1Pct === 100 && !isThumbnailStage)
  const stage2Pct = stage2Done ? 100 : (isThumbnailStage ? Math.round((completed / Math.max(1, total)) * 100) : 0)
  const stage2CountStr = stage2Done
    ? `${total.toLocaleString()} / ${total.toLocaleString()}`
    : (isThumbnailStage ? `${completed.toLocaleString()} / ${total.toLocaleString()}` : 'Waiting...')

  // Live 60 FPS smooth interpolation for percentage counting & SVG progress ring
  const [displayedPercent, setDisplayedPercent] = useState(0)

  useEffect(() => {
    let animId: number
    const animate = () => {
      setDisplayedPercent(prev => {
        const diff = percent - prev
        if (Math.abs(diff) < 0.1) return percent
        return prev + diff * 0.2
      })
      animId = requestAnimationFrame(animate)
    }
    animId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animId)
  }, [percent])

  // Circular progress SVG calculations
  const radius = 140
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (displayedPercent / 100) * circumference

  // Render Empty State if no folder imported and not actively importing
  if (importedFolders.length === 0 && stats.totalPhotos === 0 && !isImporting) {
    return (
      <div className="scanning-page-container">
        <EmptyState
          icon={<Folder size={48} />}
          title="No Folder Imported"
          description="Please select or import a folder from your computer to start scanning and organizing media."
          actionLabel="Select Folder"
          onAction={handleImportFolder}
        />
      </div>
    )
  }

  return (
    <div className="scanning-page-container">
      {/* Top Header */}
      <header className="scanning-page-header">
        <div>
          <h1 className="scanning-page-title">Scanning Your Library</h1>
          <p className="scanning-page-subtitle">
            This may take a while depending on the size of your library.
          </p>
        </div>

        <button 
          type="button" 
          className="scan-pause-btn"
          onClick={() => setIsPaused(!isPaused)}
        >
          {isPaused ? <Play size={16} /> : <Pause size={16} />}
          <span>{isPaused ? 'Resume' : 'Pause'}</span>
        </button>
      </header>

      {/* Main Grid: Circle Progress Ring + Pipeline Stages */}
      <div className="scanning-grid-row">
        {/* Left Column: Circular Progress Ring & Folder Card */}
        <div className="scanning-left-col">
          <div className="circular-ring-wrapper">
            <svg className="progress-ring-svg" width="320" height="320" viewBox="0 0 320 320">
              <circle
                cx="160"
                cy="160"
                r={radius}
                className="progress-ring-bg"
                strokeWidth="12"
              />
              <circle
                cx="160"
                cy="160"
                r={radius}
                className="progress-ring-fill"
                strokeWidth="12"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 160 160)"
              />
            </svg>
            <div className="progress-ring-center-content">
              <span className="ring-pct-text">{Math.round(displayedPercent)}%</span>
              <span className="ring-sub-text">
                {completed.toLocaleString()} of {total.toLocaleString()}
              </span>
              <span className="ring-sub-text-small">
                {importStatus.stage === 'thumbnails' ? 'thumbnails generated' : (importStatus.stage === 'processing' ? 'items processed' : 'items ready')}
              </span>
            </div>
          </div>

          {/* Folder Card below Ring */}
          <div className="scan-folder-card">
            <div className="folder-card-left">
              <Folder size={20} className="icon-folder-card" />
              <div className="folder-card-info">
                <span className="folder-card-name" title={folderName}>{folderName}</span>
                <span className="folder-card-path" title={folderPath}>{folderPath}</span>
              </div>
            </div>
            <button 
              type="button" 
              className="folder-change-btn"
              onClick={handleImportFolder}
              title="Import or change folder"
            >
              Change
            </button>
          </div>
        </div>

        {/* Right Column: Pipeline Stages */}
        <div className="scanning-right-col">
          {/* Stage 1: Extracting Metadata */}
          <div className="scan-stage-item">
            <div className={`stage-icon-wrapper ${stage1Pct === 100 ? 'stage-green-done' : 'stage-green'}`}>
              {isStage1Processing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : stage1Pct === 100 ? (
                <Check size={18} />
              ) : (
                <FileText size={18} />
              )}
            </div>
            <div className="stage-content">
              <div className="stage-header-row">
                <span className="stage-title">Extracting Metadata</span>
                <div className="stage-right-stats">
                  <span className="stage-counts">{stage1CountStr}</span>
                  <span className="stage-pct green-pct">{stage1Pct}%</span>
                </div>
              </div>
              <span className="stage-subtitle">
                {stage1Pct === 100 ? 'Metadata extraction complete' : (isStage1Processing ? 'Reading file metadata...' : 'Waiting for scan...')}
              </span>
              <div className="stage-bar-track">
                <div className="stage-bar-fill green-bar" style={{ width: `${stage1Pct}%` }} />
              </div>
            </div>
          </div>

          {/* Stage 2: Generating Thumbnails & Media Previews */}
          <div className="scan-stage-item">
            <div className={`stage-icon-wrapper ${stage2Done ? 'stage-green-done' : 'stage-purple'}`}>
              {isThumbnailStage ? (
                <Loader2 size={18} className="animate-spin" />
              ) : stage2Done ? (
                <Check size={18} />
              ) : (
                <Sparkles size={18} />
              )}
            </div>
            <div className="stage-content">
              <div className="stage-header-row">
                <span className="stage-title">Generating Thumbnails & Previews</span>
                <div className="stage-right-stats">
                  <span className="stage-counts">{stage2CountStr}</span>
                  <span className="stage-pct purple-pct">{stage2Pct}%</span>
                </div>
              </div>
              <span className="stage-subtitle">
                {stage2Done ? 'Library thumbnails ready!' : (isThumbnailStage ? 'Generating thumbnails & media previews...' : 'Almost done...')}
              </span>
              <div className="stage-bar-track">
                <div className="stage-bar-fill purple-bar" style={{ width: `${stage2Pct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
