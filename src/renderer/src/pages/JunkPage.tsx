import React, { useState, useMemo, useEffect, useRef } from 'react'
import {
  Share2, Film, ImageIcon, CheckSquare,
  Square, Trash2, RefreshCw, CheckCircle2,
  Play, Check, ShieldCheck, BookmarkCheck, Loader2,
  Sparkles
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

  // Classify photos using platform origin detector in non-blocking chunks
  useEffect(() => {
    if (isScanningRef.current) return
    let isCancelled = false
    const photos = photoState.photos
    if (!photos || photos.length === 0) {
      setClassifiedMap(new Map())
      return
    }

    const map = new Map<number, SocialAppOrigin>()
    let index = 0
    const chunkSize = 150

    function processNextChunk() {
      if (isCancelled) return
      const end = Math.min(index + chunkSize, photos.length)
      for (; index < end; index++) {
        map.set(photos[index].id, detectJunk(photos[index]))
      }
      if (index < photos.length) {
        setTimeout(processNextChunk, 0)
      } else {
        setClassifiedMap(new Map(map))
      }
    }

    // Run first chunk immediately so UI displays instantly without lag
    processNextChunk()

    return () => {
      isCancelled = true
    }
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
    photoDispatch({
      type: 'SET_VIEWER_SCOPED',
      payload: { photoId: photo.id, photos: appMediaCandidates }
    })
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
      {/* ─── Action Header ─────────────────────────────────────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {appMediaCandidates.length > 0 && (
            <span className="apple-storage-pill">
              {appMediaCandidates.length} items • {formatFileSize(totalBytes)}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {selectedPhotos.length > 0 && (
            <>
              <button
                type="button"
                className="apple-secondary-btn"
                onClick={handleKeepSelected}
              >
                <BookmarkCheck size={14} />
                <span>Keep Selected ({selectedPhotos.length})</span>
              </button>

              <button
                type="button"
                className="apple-secondary-btn"
                onClick={handleTrashSelected}
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  color: '#ef4444',
                  borderColor: 'rgba(239, 68, 68, 0.25)',
                  gap: '6px'
                }}
              >
                <Trash2 size={14} />
                <span>Move to Trash ({selectedPhotos.length} • {formatFileSize(selectedBytes)})</span>
              </button>
            </>
          )}

          {/* Scan Social Media Button */}
          <button
            type="button"
            className={appMediaCandidates.length > 0 ? 'apple-secondary-btn' : 'apple-primary-btn'}
            onClick={handleStartRescan}
            disabled={isScanning}
            title="Scan Social Media & Apps"
          >
            {isScanning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Scanning Social Media...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Scan Social Media</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── Live Scanner Progress Banner (People / Documents / Places Pattern) ── */}
      {isScanning && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: '16px',
            padding: '14px 20px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6366f1'
              }}
            >
              <Loader2 size={18} className="animate-spin" />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Scanning photo library for social media & apps...
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Scanned {scanProgress?.completed || 0} of {scanProgress?.total || (photoState.photos.length || 0)} photos (
                {scanProgress && scanProgress.total > 0
                  ? Math.round((scanProgress.completed / scanProgress.total) * 100)
                  : 0}
                %){scanProgress && scanProgress.foundCount > 0 ? ` • ${scanProgress.foundCount} media items found` : ''}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Filter Bar ──────────────────────────────────────────────────── */}
      {appMediaCandidates.length > 0 && (
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
            {[
              { id: 'all', label: `All Apps (${tabCounts.all})`, show: true },
              { id: 'whatsapp', label: `WhatsApp (${tabCounts.whatsapp})`, show: tabCounts.whatsapp > 0 },
              { id: 'instagram', label: `Instagram (${tabCounts.instagram})`, show: tabCounts.instagram > 0 },
              { id: 'snapchat', label: `Snapchat (${tabCounts.snapchat})`, show: tabCounts.snapchat > 0 },
              { id: 'linkedin', label: `LinkedIn (${tabCounts.linkedin})`, show: tabCounts.linkedin > 0 },
              { id: 'browser', label: `Web Downloads (${tabCounts.browser})`, show: tabCounts.browser > 0 },
              { id: 'editor', label: `Editor Apps (${tabCounts.editor})`, show: tabCounts.editor > 0 },
              { id: 'other-social', label: `Other Social (${tabCounts['other-social']})`, show: tabCounts['other-social'] > 0 },
              { id: 'other-apps', label: `Unidentified Apps (${tabCounts['other-apps']})`, show: tabCounts['other-apps'] > 0 }
            ].filter(t => t.show).map(tab => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
                  style={{
                    fontSize: '12px',
                    padding: '5px 12px',
                    borderRadius: '99px',
                    fontWeight: isActive ? 600 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: isActive ? '1px solid transparent' : '1px solid var(--border)',
                    background: isActive ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : 'var(--bg-secondary)',
                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                    boxShadow: isActive ? '0 2px 8px rgba(99, 102, 241, 0.25)' : 'none'
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Media Filters & Select All */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="apple-segmented-bar">
              <button
                type="button"
                className={`apple-segment-btn ${mediaTypeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setMediaTypeFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`apple-segment-btn ${mediaTypeFilter === 'video' ? 'active' : ''}`}
                onClick={() => setMediaTypeFilter('video')}
              >
                <Film size={12} /> Videos
              </button>
              <button
                type="button"
                className={`apple-segment-btn ${mediaTypeFilter === 'image' ? 'active' : ''}`}
                onClick={() => setMediaTypeFilter('image')}
              >
                <ImageIcon size={12} /> Photos
              </button>
            </div>

            {appMediaCandidates.length > 0 && (
              <button
                type="button"
                className="apple-secondary-btn"
                onClick={handleSelectAll}
                style={{ fontSize: '12px', padding: '5px 12px', gap: '6px' }}
              >
                {selectedIds.size === appMediaCandidates.length ? (
                  <CheckSquare size={14} color="#6366f1" />
                ) : (
                  <Square size={14} />
                )}
                <span>{selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Select All'}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Media-First Grid ─────────────────────────────────────────────── */}
      {appMediaCandidates.length === 0 ? (
        <EmptyState
          icon={
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="junkIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
              <Share2
                size={46}
                strokeWidth={1.8}
                stroke="url(#junkIconGrad)"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
              />
            </div>
          }
          title={
            <>
              No <span className="title-sort-gradient">Social Media</span> Found
            </>
          }
          description="All media in your library are genuine camera photos or screenshots."
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
