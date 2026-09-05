import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  Share2, Film, ImageIcon, CheckSquare,
  Square, Trash2, RefreshCw, CheckCircle2,
  Play, Check, ShieldCheck, BookmarkCheck, Loader2
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import EmptyState from '../components/EmptyState'
import { formatFileSize, getThumbnailUrl, isVideoFile } from '../utils/helpers'
import { detectJunk, SocialAppCategory, SocialAppOrigin, APP_THEMES } from '../utils/junkDetector'

export default function JunkPage() {
  const { state: photoState, dispatch: photoDispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { state: appState, showToast } = useApp()

  // Use global grid density from AppContext (controlled by topbar icon)
  const gridDensity = appState.gridDensity || 'dense'
  const isDense = gridDensity === 'dense'
  const isComfortable = gridDensity === 'comfortable'
  const isMedium = gridDensity === 'medium'

  const minTileWidth = isComfortable ? 240 : isMedium ? 160 : 100
  const gridGap = isComfortable ? '14px' : isMedium ? '10px' : '6px'
  const tileRadius = isComfortable ? '10px' : isMedium ? '6px' : '3px'
  const checkboxSize = isComfortable ? 24 : isMedium ? 20 : 18
  const checkIconSize = isComfortable ? 16 : isMedium ? 13 : 11
  const checkboxOffset = isComfortable ? '8px' : isMedium ? '6px' : '4px'

  const [activeTab, setActiveTab] = useState<SocialAppCategory>('all')
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'video' | 'image'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [classifiedMap, setClassifiedMap] = useState<Map<number, SocialAppOrigin>>(new Map())

  // Progressive Scan State
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{
    completed: number
    total: number
    percent: number
    currentFile: string
    isComplete: boolean
    foundCount: number
  } | null>(null)

  const isScanningRef = useRef(false)

  // Ensure library photos are loaded
  const filterKey = JSON.stringify(photoState.activeFilter)
  useEffect(() => {
    const isSpecialFilter =
      photoState.activeFilter &&
      (photoState.activeFilter.isTrashed ||
        photoState.activeFilter.isArchived ||
        photoState.activeFilter.isLocked ||
        photoState.activeFilter.search)
    if (isSpecialFilter || photoState.photos.length === 0) {
      loadPhotos({})
    }
  }, [loadPhotos, filterKey, photoState.photos.length])

  // Classify photos using platform origin detector
  useEffect(() => {
    if (isScanningRef.current) return
    const map = new Map<number, SocialAppOrigin>()
    for (const photo of photoState.photos) {
      map.set(photo.id, detectJunk(photo))
    }
    setClassifiedMap(map)
  }, [photoState.photos])

  // Progressive Rescan Handler with Live Progress to 100%
  const handleStartRescan = async () => {
    if (isScanning) return
    setIsScanning(true)
    isScanningRef.current = true

    try {
      // Direct fetch to avoid React state closure staleness
      let allPhotos: Photo[] = []
      try {
        allPhotos = (await window.photoVault?.getPhotos({})) || []
      } catch {
        allPhotos = []
      }
      if (allPhotos.length === 0) {
        allPhotos = photoState.photos || []
      }
      const total = allPhotos.length

      if (total === 0) {
        showToast('No photos found in library to scan')
        return
      }

      // Sync into PhotoContext
      photoDispatch({ type: 'SET_PHOTOS', payload: allPhotos })
      photoDispatch({ type: 'SET_TOTAL_COUNT', payload: total })

      const newMap = new Map<number, SocialAppOrigin>()
      let foundCount = 0
      const chunkSize = 20

      setScanProgress({
        completed: 0,
        total,
        percent: 0,
        currentFile: allPhotos[0]?.filename || '',
        isComplete: false,
        foundCount: 0
      })

      // Process in asynchronous chunks so progress bar animates fluidly
      for (let i = 0; i < total; i += chunkSize) {
        const chunk = allPhotos.slice(i, i + chunkSize)
        for (const photo of chunk) {
          const info = detectJunk(photo)
          newMap.set(photo.id, info)
          if (info.classification !== 'keep') {
            foundCount++
          }
        }

        const completed = Math.min(i + chunkSize, total)
        const percent = Math.round((completed / total) * 100)
        const currentFile = allPhotos[completed - 1]?.filename || ''

        setScanProgress({
          completed,
          total,
          percent,
          currentFile,
          isComplete: false,
          foundCount
        })

        // Update the live map incrementally so items appear as they are discovered
        setClassifiedMap(new Map(newMap))

        // Small async tick for 60 FPS UI rendering
        await new Promise(resolve => setTimeout(resolve, 20))
      }

      // Reach 100% completion
      setScanProgress({
        completed: total,
        total,
        percent: 100,
        currentFile: 'Complete Scan',
        isComplete: true,
        foundCount
      })

      showToast(`Complete scan finished! Analyzed ${total.toLocaleString()} items, found ${foundCount} social media & app files.`)

      // Keep 100% banner visible for 2.5 seconds before concluding
      await new Promise(resolve => setTimeout(resolve, 2500))
    } catch (err) {
      console.error('Rescan failed:', err)
      showToast('Rescan failed to complete')
    } finally {
      setIsScanning(false)
      isScanningRef.current = false
      setScanProgress(null)
    }
  }

  // Filter social & app items
  const appMediaCandidates = useMemo(() => {
    return photoState.photos.filter((p) => {
      const info = classifiedMap.get(p.id) || detectJunk(p)
      if (info.classification === 'keep') return false

      const isVid = isVideoFile(p.file_path)
      if (mediaTypeFilter === 'video' && !isVid) return false
      if (mediaTypeFilter === 'image' && isVid) return false

      if (activeTab === 'all') return true
      return info.category === activeTab
    })
  }, [photoState.photos, classifiedMap, activeTab, mediaTypeFilter])

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts: Record<SocialAppCategory, number> = {
      all: 0,
      whatsapp: 0,
      instagram: 0,
      snapchat: 0,
      linkedin: 0,
      browser: 0,
      editor: 0,
      'other-social': 0,
      'other-apps': 0
    }

    for (const p of photoState.photos) {
      const info = classifiedMap.get(p.id) || detectJunk(p)
      if (info.classification === 'keep') continue
      counts.all++
      if (info.category in counts) {
        counts[info.category]++
      } else {
        counts['other-apps']++
      }
    }

    return counts
  }, [photoState.photos, classifiedMap])

  // Aggregate stats
  const totalBytes = useMemo(() => {
    return appMediaCandidates.reduce((acc, p) => acc + (p.file_size || 0), 0)
  }, [appMediaCandidates])

  const selectedPhotos = useMemo(() => {
    return appMediaCandidates.filter(p => selectedIds.has(p.id))
  }, [appMediaCandidates, selectedIds])

  const selectedBytes = useMemo(() => {
    return selectedPhotos.reduce((acc, p) => acc + (p.file_size || 0), 0)
  }, [selectedPhotos])

  // Selection handlers
  const handleToggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAll = () => {
    if (selectedIds.size === appMediaCandidates.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(appMediaCandidates.map(p => p.id)))
    }
  }

  const handleTileClick = (photo: Photo) => {
    photoDispatch({ type: 'SET_VIEWER', payload: photo.id })
  }

  // Move selected to Trash
  const handleTrashSelected = async () => {
    if (selectedPhotos.length === 0) return
    const ids = selectedPhotos.map(p => p.id)
    const count = ids.length
    if (!confirm(`Move ${count} items (${formatFileSize(selectedBytes)}) to Trash?`)) return

    try {
      if (window.photoVault?.trash) {
        await window.photoVault.trash(ids)
        photoDispatch({ type: 'REMOVE_PHOTOS', payload: ids })
        setSelectedIds(new Set())
        showToast(`Moved ${count} items to Trash`)
        refreshPhotos()
      }
    } catch (err) {
      console.error('Failed to trash items:', err)
      showToast('Failed to move items to Trash')
    }
  }

  // Deselect / Keep in library
  const handleKeepSelected = () => {
    if (selectedPhotos.length === 0) return
    const count = selectedPhotos.length
    setSelectedIds(new Set())
    showToast(`Kept ${count} items in your photo library`)
  }

  return (
    <div className="photos-page" style={{ padding: '20px 28px' }}>
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 3px 12px rgba(59, 130, 246, 0.25)'
            }}
          >
            <Share2 size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Social Media & Apps
              </h1>
              {appMediaCandidates.length > 0 && (
                <span
                  style={{
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: 'var(--primary, #3b82f6)',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '12px'
                  }}
                >
                  {appMediaCandidates.length} items • {formatFileSize(totalBytes)}
                </span>
              )}
            </div>
            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Organized by WhatsApp, Instagram, Snapchat, LinkedIn, Web Downloads & Editor Apps
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedPhotos.length > 0 && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleKeepSelected}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '6px 12px',
                  borderRadius: '8px'
                }}
              >
                <BookmarkCheck size={14} /> Keep Selected ({selectedPhotos.length})
              </button>

              <button
                type="button"
                className="btn btn-danger"
                onClick={handleTrashSelected}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  color: '#ffffff',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  boxShadow: '0 3px 10px rgba(239, 68, 68, 0.3)'
                }}
              >
                <Trash2 size={14} /> Move to Trash ({selectedPhotos.length} • {formatFileSize(selectedBytes)})
              </button>
            </>
          )}

          {/* Rescan Button with Spinning Indicator */}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleStartRescan}
            disabled={isScanning}
            title="Rescan Library"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 600,
              background: isScanning ? 'var(--bg-secondary)' : undefined,
              cursor: isScanning ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={14} className={isScanning ? 'animate-spin' : ''} />
            {isScanning ? 'Scanning...' : 'Rescan'}
          </button>
        </div>
      </div>

      {/* ─── Progressive Scan Banner (0% to 100%) ───────────────────────── */}
      {isScanning && scanProgress && (
        <div
          style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '20px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
            position: 'relative',
            overflow: 'hidden',
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          {/* Top Row: Status Label & Percentage */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {scanProgress.isComplete ? (
                <CheckCircle2 size={18} color="#10b981" />
              ) : (
                <Loader2 size={18} className="animate-spin" color="var(--primary, #3b82f6)" />
              )}
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {scanProgress.isComplete
                  ? `Scan Complete! Analyzed all ${scanProgress.total.toLocaleString()} items (${scanProgress.foundCount} social media & app files found)`
                  : `Analyzing library media for social forwards, web downloads & editor apps...`}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                {scanProgress.completed.toLocaleString()} / {scanProgress.total.toLocaleString()}
              </span>
              <span
                style={{
                  background: scanProgress.isComplete ? 'rgba(16, 185, 129, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  color: scanProgress.isComplete ? '#10b981' : 'var(--primary, #3b82f6)',
                  fontWeight: 800,
                  fontSize: '12px',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}
              >
                {scanProgress.percent}%
              </span>
            </div>
          </div>

          {/* Subtext: Current File being analyzed */}
          {!scanProgress.isComplete && scanProgress.currentFile && (
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Analyzing: {scanProgress.currentFile}
            </div>
          )}

          {/* Progressive Bar Track */}
          <div
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '6px',
              background: 'rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              position: 'relative'
            }}
          >
            <div
              style={{
                width: `${scanProgress.percent}%`,
                height: '100%',
                borderRadius: '6px',
                background: scanProgress.isComplete
                  ? 'linear-gradient(90deg, #10b981, #059669)'
                  : 'linear-gradient(90deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)',
                transition: 'width 0.08s ease-out',
                boxShadow: scanProgress.isComplete
                  ? '0 0 12px rgba(16, 185, 129, 0.5)'
                  : '0 0 12px rgba(59, 130, 246, 0.5)'
              }}
            />
          </div>
        </div>
      )}

      {/* ─── Filter Bar ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '10px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        {/* App Platform Origin Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('all')}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '16px', fontWeight: activeTab === 'all' ? 700 : 500 }}
          >
            All Apps ({tabCounts.all})
          </button>

          {tabCounts.whatsapp > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'whatsapp' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('whatsapp')}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontWeight: activeTab === 'whatsapp' ? 700 : 500,
                color: activeTab === 'whatsapp' ? '#ffffff' : '#10b981'
              }}
            >
              WhatsApp ({tabCounts.whatsapp})
            </button>
          )}

          {tabCounts.instagram > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'instagram' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('instagram')}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontWeight: activeTab === 'instagram' ? 700 : 500,
                color: activeTab === 'instagram' ? '#ffffff' : '#ec4899'
              }}
            >
              Instagram ({tabCounts.instagram})
            </button>
          )}

          {tabCounts.snapchat > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'snapchat' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('snapchat')}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontWeight: activeTab === 'snapchat' ? 700 : 500,
                color: activeTab === 'snapchat' ? '#ffffff' : '#eab308'
              }}
            >
              Snapchat ({tabCounts.snapchat})
            </button>
          )}

          {tabCounts.linkedin > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'linkedin' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('linkedin')}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontWeight: activeTab === 'linkedin' ? 700 : 500,
                color: activeTab === 'linkedin' ? '#ffffff' : '#0284c7'
              }}
            >
              LinkedIn ({tabCounts.linkedin})
            </button>
          )}

          {tabCounts.browser > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'browser' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('browser')}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontWeight: activeTab === 'browser' ? 700 : 500,
                color: activeTab === 'browser' ? '#ffffff' : '#06b6d4'
              }}
            >
              Web Downloads ({tabCounts.browser})
            </button>
          )}

          {tabCounts.editor > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'editor' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('editor')}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontWeight: activeTab === 'editor' ? 700 : 500,
                color: activeTab === 'editor' ? '#ffffff' : '#8b5cf6'
              }}
            >
              Editor Apps ({tabCounts.editor})
            </button>
          )}

          {tabCounts['other-social'] > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'other-social' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('other-social')}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontWeight: activeTab === 'other-social' ? 700 : 500,
                color: activeTab === 'other-social' ? '#ffffff' : '#6366f1'
              }}
            >
              Other Social ({tabCounts['other-social']})
            </button>
          )}

          {tabCounts['other-apps'] > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'other-apps' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('other-apps')}
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontWeight: activeTab === 'other-apps' ? 700 : 500,
                color: activeTab === 'other-apps' ? '#ffffff' : '#94a3b8'
              }}
            >
              Unidentified Apps ({tabCounts['other-apps']})
            </button>
          )}
        </div>

        {/* Media Filters & Select All */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '8px' }}>
            <button
              type="button"
              className={`btn ${mediaTypeFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMediaTypeFilter('all')}
              style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px' }}
            >
              All
            </button>
            <button
              type="button"
              className={`btn ${mediaTypeFilter === 'video' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMediaTypeFilter('video')}
              style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Film size={12} /> Videos
            </button>
            <button
              type="button"
              className={`btn ${mediaTypeFilter === 'image' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMediaTypeFilter('image')}
              style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <ImageIcon size={12} /> Photos
            </button>
          </div>

          {appMediaCandidates.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleSelectAll}
              style={{ fontSize: '12px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {selectedIds.size === appMediaCandidates.length ? (
                <CheckSquare size={15} color="var(--primary)" />
              ) : (
                <Square size={15} />
              )}
              {selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Select All'}
            </button>
          )}
        </div>
      </div>

      {/* ─── Media-First Grid ─────────────────────────────────────────────── */}
      {appMediaCandidates.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={48} />}
          title="No Social Media or App Forwards Found"
          description="All media in your library are genuine camera photos or screenshots."
          actionLabel={isScanning ? 'Scanning...' : 'Rescan Library'}
          onAction={handleStartRescan}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${minTileWidth}px, 1fr))`,
            gap: gridGap,
            marginBottom: '40px'
          }}
        >
          {appMediaCandidates.map((photo) => {
            const isSelected = selectedIds.has(photo.id)
            const isVid = isVideoFile(photo.file_path)
            const info = classifiedMap.get(photo.id) || detectJunk(photo)

            return (
              <div
                key={photo.id}
                onClick={() => handleTileClick(photo)}
                title={`${photo.filename}\nOrigin: ${info.label}\n${info.reason}`}
                style={{
                  background: '#0b0f19',
                  border: isSelected ? '2px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
                  borderRadius: tileRadius,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  boxShadow: isSelected ? '0 4px 18px rgba(59, 130, 246, 0.3)' : 'none'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              >
                {/* Media Image Thumbnail */}
                <img
                  src={getThumbnailUrl(photo.thumbnail_path, photo.file_path)}
                  alt={photo.filename}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />

                {/* Select Checkbox Button */}
                <div
                  onClick={(e) => handleToggleSelect(photo.id, e)}
                  style={{
                    position: 'absolute',
                    top: checkboxOffset,
                    left: checkboxOffset,
                    width: `${checkboxSize}px`,
                    height: `${checkboxSize}px`,
                    borderRadius: isDense ? '4px' : '6px',
                    background: isSelected ? 'var(--primary, #3b82f6)' : 'rgba(0, 0, 0, 0.45)',
                    border: '1.5px solid #ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    zIndex: 2
                  }}
                >
                  {isSelected && <Check size={checkIconSize} strokeWidth={3} />}
                </div>

                {/* Video Badge */}
                {isVid && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: checkboxOffset,
                      left: checkboxOffset,
                      background: 'rgba(0, 0, 0, 0.75)',
                      color: '#ffffff',
                      fontSize: isDense ? '8px' : '9.5px',
                      fontWeight: 700,
                      padding: isDense ? '1px 4px' : '2px 6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Play size={isDense ? 7 : 9} fill="#fff" /> {isDense ? 'VID' : 'VIDEO'}
                  </div>
                )}

                {/* Platform Origin Pill */}
                <div
                  style={{
                    position: 'absolute',
                    top: checkboxOffset,
                    right: checkboxOffset,
                    pointerEvents: 'none',
                    zIndex: 2
                  }}
                >
                  <span
                    style={{
                      background: info.gradient,
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: isComfortable ? '10px' : isMedium ? '9px' : '8px',
                      padding: isComfortable ? '2.5px 8px' : isMedium ? '2px 6.5px' : '1px 4.5px',
                      borderRadius: isDense ? '4px' : '6px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                      letterSpacing: '0.02em',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {isDense ? (
                      info.category === 'whatsapp' ? 'WA' :
                      info.category === 'instagram' ? 'IG' :
                      info.category === 'snapchat' ? 'Snap' :
                      info.category === 'linkedin' ? 'LinkedIn' :
                      info.category === 'browser' ? 'Web' :
                      info.category === 'editor' ? 'Editor' :
                      info.category === 'other-social' ? 'Social' : 'App'
                    ) : (
                      info.label
                    )}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
