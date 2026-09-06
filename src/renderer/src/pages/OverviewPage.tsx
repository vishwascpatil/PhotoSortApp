import React, { useState, useEffect } from 'react'
import {
  Compass, Images, Film, Users, MapPin, Copy, Sparkles, Monitor, HardDrive,
  MessageSquare, FileText, Cpu, Zap, ArrowRight, ShieldCheck, CheckCircle2, RefreshCw, Loader2
} from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { usePhotos } from '../contexts/PhotoContext'

import EmptyState from '../components/EmptyState'
import { Folder } from 'lucide-react'

export default function OverviewPage() {
  const { state, navigateTo, openCleanUpModal } = useApp()
  const { state: photoState } = usePhotos()

  const [stats, setStats] = useState({ totalPhotos: 0, totalSize: 0, favorites: 0, albums: 0 })
  const [importedFolders, setImportedFolders] = useState<any[]>([])

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadStats() {
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
  const isScanning = importStatus.active
  const total = importStatus.total > 0 ? importStatus.total : stats.totalPhotos
  const completed = importStatus.completed > 0 ? importStatus.completed : stats.totalPhotos
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 100

  // Scanned thumbnails for live activity stream
  const recentPhotos = photoState.photos.slice(0, 10)

  if (stats.totalPhotos === 0 && importedFolders.length === 0 && !isScanning) {
    return (
      <div className="overview-container">
        <EmptyState
          icon={<Folder size={48} />}
          title="No Folder Imported"
          description="Your library is currently empty. Import a folder from your computer to view photos and organization insights."
          actionLabel="Select Folder"
          onAction={() => navigateTo('source-select')}
        />
      </div>
    )
  }

  return (
    <div className="overview-container">
      {/* ─── Hero Header ─────────────────────────────────────────────────── */}
      <header className="overview-header">
        <div className="overview-title-group">
          <h1 className="overview-title">
            Library <span className="title-sort-gradient">Overview</span>
          </h1>
          <p className="overview-subtitle">
            Real-time library status & multi-worker scanning engine.
          </p>
        </div>

        {/* Live Metrics Bar */}
        <div className="overview-metrics-bar">
          <div className="metric-chip">
            <Images size={16} className="metric-icon-blue" />
            <div className="metric-info">
              <span className="metric-value">{(stats.totalPhotos || completed).toLocaleString()}</span>
              <span className="metric-label">Total Media</span>
            </div>
          </div>

          <div className="metric-chip">
            <Zap size={16} className="metric-icon-purple" />
            <div className="metric-info">
              <span className="metric-value">24 Threads</span>
              <span className="metric-label">Active Workers</span>
            </div>
          </div>

          <div className="metric-chip">
            <Cpu size={16} className="metric-icon-indigo" />
            <div className="metric-info">
              <span className="metric-value">AI Engine</span>
              <span className="metric-label">Face & Object AI</span>
            </div>
          </div>

          <div className="metric-chip">
            <ShieldCheck size={16} className="metric-icon-green" />
            <div className="metric-info">
              <span className="metric-value">100% Private</span>
              <span className="metric-label">On-Device Storage</span>
            </div>
          </div>
        </div>
      </header>

      {/* ─── Quick Category Access Grid ─────────────────────────────────── */}
      <section className="overview-section">
        <div className="section-title-box" style={{ marginBottom: '18px' }}>
          <Sparkles size={20} className="section-icon-purple" />
          <h2 className="section-title-text">Quick Library Categories</h2>
        </div>

        <div className="categories-grid">
          {/* All Photos */}
          <div className="category-card" onClick={() => navigateTo('photos')}>
            <div className="cat-icon-wrapper blue-cat">
              <Images size={22} />
            </div>
            <div className="cat-info">
              <span className="cat-title">All Photos</span>
              <span className="cat-count">{(stats.totalPhotos || completed).toLocaleString()} items</span>
            </div>
            <ArrowRight size={18} className="cat-arrow" />
          </div>

          {/* People */}
          <div className="category-card" onClick={() => navigateTo('people')}>
            <div className="cat-icon-wrapper purple-cat">
              <Users size={22} />
            </div>
            <div className="cat-info">
              <span className="cat-title">People & Faces</span>
              <span className="cat-count">Explore face groups</span>
            </div>
            <ArrowRight size={18} className="cat-arrow" />
          </div>

          {/* Places */}
          <div className="category-card" onClick={() => navigateTo('places')}>
            <div className="cat-icon-wrapper orange-cat">
              <MapPin size={22} />
            </div>
            <div className="cat-info">
              <span className="cat-title">Places</span>
              <span className="cat-count">Map & location clusters</span>
            </div>
            <ArrowRight size={18} className="cat-arrow" />
          </div>

          {/* Duplicates */}
          <div className="category-card" onClick={() => navigateTo('duplicates')}>
            <div className="cat-icon-wrapper yellow-cat">
              <Copy size={22} />
            </div>
            <div className="cat-info">
              <span className="cat-title">Duplicates & Similar</span>
              <span className="cat-count">Free up disk space</span>
            </div>
            <ArrowRight size={18} className="cat-arrow" />
          </div>

          {/* Free Up Space / Clean Up */}
          <div className="category-card" onClick={() => openCleanUpModal()}>
            <div
              className="cat-icon-wrapper"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                color: '#ffffff',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
              }}
            >
              <Sparkles size={22} />
            </div>
            <div className="cat-info">
              <span className="cat-title">Free Up Space</span>
              <span className="cat-count">Smart clean-up suggestions</span>
            </div>
            <ArrowRight size={18} className="cat-arrow" />
          </div>
        </div>
      </section>

      {/* ─── Live Scanned Media Stream ───────────────────────────────────── */}
      {recentPhotos.length > 0 && (
        <section className="overview-section">
          <div className="section-title-box" style={{ marginBottom: '18px' }}>
            <Compass size={20} className="section-icon-blue" />
            <h2 className="section-title-text">Recently Scanned Media</h2>
          </div>

          <div className="media-stream-grid">
            {recentPhotos.map(photo => (
              <div key={photo.id} className="stream-thumb-card" onClick={() => navigateTo('photos')}>
                <img src={photo.thumbnail_path || photo.file_path} alt="Thumbnail" className="stream-thumb-img" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
