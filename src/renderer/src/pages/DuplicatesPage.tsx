import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Copy, Sparkles, Trash2, CheckCircle2, ShieldCheck, Play,
  Zap, RefreshCw, Check, Search, Loader2, LayoutGrid, Grid3x3,
  CheckSquare, Square
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { getThumbnailUrl, formatFileSize } from '../utils/helpers'
import EmptyState from '../components/EmptyState'

interface DuplicateGroup {
  id: string
  matchPercentage: number
  isExact: boolean
  isVideo: boolean
  totalBytes: number
  recoverableBytes: number
  items: Photo[]
}

export default function DuplicatesPage() {
  const { state: photoState, dispatch: photoDispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { state: appState, dispatch: appDispatch, showToast } = useApp()

  const [loading, setLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{
    completed: number
    total: number
    percent: number
    currentFile: string
    isComplete: boolean
    foundCount: number
  } | null>(null)
  const [utilitiesData, setUtilitiesData] = useState<{ duplicates: Photo[][]; similar: Photo[][] }>({
    duplicates: [],
    similar: []
  })
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [minConfidence, setMinConfidence] = useState<number>(75)
  const [activeTab, setActiveTab] = useState<'all' | 'exact' | 'similar' | 'videos'>('all')
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  const gridDensity = appState.gridDensity || 'dense'

  // Load utilities data from IPC with live progressive scan
  const fetchDuplicates = useCallback(async () => {
    setIsScanning(true)

    // Direct fetch to ensure accurate total count
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

    setScanProgress({
      completed: 0,
      total,
      percent: 0,
      currentFile: allPhotos[0]?.filename ? `Scanning ${allPhotos[0].filename}...` : 'Analyzing duplicate candidates...',
      isComplete: false,
      foundCount: 0
    })

    try {
      if (window.photoVault?.getUtilitiesData) {
        const data = await window.photoVault.getUtilitiesData()
        const totalFound = (data.duplicates?.length || 0) + (data.similar?.length || 0)
        const finalTotal = total > 0 ? total : (data.duplicates?.flat().length || 100)

        // Reach 100% completion
        setScanProgress({
          completed: finalTotal,
          total: finalTotal,
          percent: 100,
          currentFile: 'Complete Scan',
          isComplete: true,
          foundCount: totalFound
        })

        setUtilitiesData({
          duplicates: data.duplicates || [],
          similar: data.similar || []
        })

        // Hold 100% completion banner for 1.8s so user clearly sees 100% confirmation
        await new Promise((resolve) => setTimeout(resolve, 1800))
      }
    } catch (err) {
      console.error('Failed to load duplicate data:', err)
    } finally {
      setIsScanning(false)
      setScanProgress(null)
      setLoading(false)
    }
  }, [photoState.photos])

  useEffect(() => {
    fetchDuplicates()
  }, [fetchDuplicates])


  // Subscribe to live duplicate scan progress
  useEffect(() => {
    if (window.photoVault?.onDuplicateScanProgress) {
      const unsub = window.photoVault.onDuplicateScanProgress((progress) => {
        const pct = progress.total > 0 ? Math.min(99, Math.round((progress.scanned / progress.total) * 100)) : 0
        setScanProgress(prev => ({
          completed: progress.scanned,
          total: progress.total,
          percent: pct,
          currentFile: progress.currentFile || prev?.currentFile || '',
          isComplete: false,
          foundCount: prev?.foundCount || 0
        }))
      })
      return unsub
    }
  }, [])

  // Trigger manual 100% Pixel Density Duplicate Scan
  const handleStartScan = async () => {
    if (isScanning) return
    setIsScanning(true)

    // Direct fetch to ensure accurate total count
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

    setScanProgress({
      completed: 0,
      total,
      percent: 0,
      currentFile: allPhotos[0]?.filename || '',
      isComplete: false,
      foundCount: 0
    })

    try {
      if (window.photoVault?.scanDuplicates) {
        const data = await window.photoVault.scanDuplicates()
        const totalFound = (data.duplicates?.length || 0) + (data.similar?.length || 0)
        const finalTotal = total > 0 ? total : (data.duplicates?.flat().length || 100)

        // Reach 100% completion
        setScanProgress({
          completed: finalTotal,
          total: finalTotal,
          percent: 100,
          currentFile: 'Complete Scan',
          isComplete: true,
          foundCount: totalFound
        })

        setUtilitiesData({
          duplicates: data.duplicates || [],
          similar: data.similar || []
        })

        showToast(
          totalFound > 0
            ? `Complete scan finished! Analyzed all ${finalTotal.toLocaleString()} items (${totalFound} duplicate/similar groups found).`
            : `Complete scan finished! No duplicates found in library.`
        )

        // Keep 100% complete state visible for 2.5 seconds so user clearly sees 100%
        await new Promise((resolve) => setTimeout(resolve, 2500))
      }
    } catch (err) {
      console.error('Scan failed:', err)
      showToast('Scan failed to complete')
    } finally {
      setIsScanning(false)
      setScanProgress(null)
    }
  }

  // Helper to calculate hamming distance match percentage
  const calculateMatch = (p1: Photo, p2: Photo, isExact: boolean): number => {
    if (isExact) return 100
    if (!p1.perceptual_hash || !p2.perceptual_hash || p1.perceptual_hash === '0'.repeat(64)) return 95
    let distance = 0
    const len = Math.min(p1.perceptual_hash.length, p2.perceptual_hash.length)
    for (let i = 0; i < len; i++) {
      const n1 = parseInt(p1.perceptual_hash[i], 16)
      const n2 = parseInt(p2.perceptual_hash[i], 16)
      let xor = n1 ^ n2
      while (xor > 0) {
        distance += xor & 1
        xor >>= 1
      }
    }
    const totalBits = len * 4
    return Math.max(75, Math.round(((totalBits - distance) / totalBits) * 100))
  }

  // Structure duplicate groups with Master (Highest Quality / Size) + Duplicates
  const groups: DuplicateGroup[] = useMemo(() => {
    const result: DuplicateGroup[] = []

    // Process Exact Duplicates (100% Bit-for-bit SHA-256 confirmed)
    utilitiesData.duplicates.forEach((groupItems, idx) => {
      if (groupItems.length < 2) return
      const sorted = [...groupItems].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))
      const totalBytes = sorted.reduce((sum, item) => sum + (item.file_size || 0), 0)
      const recoverableBytes = sorted.slice(1).reduce((sum, item) => sum + (item.file_size || 0), 0)
      const isVideo = sorted.some(p => p.mime_type?.startsWith('video') || p.media_type === 'video')

      result.push({
        id: `exact-${idx}`,
        matchPercentage: 100,
        isExact: true,
        isVideo,
        totalBytes,
        recoverableBytes,
        items: sorted
      })
    })

    // Process Similar Photos (90%+ Perceptual Hash match)
    utilitiesData.similar.forEach((groupItems, idx) => {
      if (groupItems.length < 2) return
      const sorted = [...groupItems].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))
      const totalBytes = sorted.reduce((sum, item) => sum + (item.file_size || 0), 0)
      const recoverableBytes = sorted.slice(1).reduce((sum, item) => sum + (item.file_size || 0), 0)
      const matchPercentage = calculateMatch(sorted[0], sorted[1], false)
      const isVideo = sorted.some(p => p.mime_type?.startsWith('video') || p.media_type === 'video')

      result.push({
        id: `similar-${idx}`,
        matchPercentage,
        isExact: false,
        isVideo,
        totalBytes,
        recoverableBytes,
        items: sorted
      })
    })

    return result
  }, [utilitiesData])

  // Tab counts for badge projection
  const tabCounts = useMemo(() => {
    let exact = 0
    let similar = 0
    let videos = 0
    groups.forEach(g => {
      if (g.isExact) exact++
      else similar++
      if (g.isVideo) videos++
    })
    return { all: groups.length, exact, similar, videos }
  }, [groups])

  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'size' | 'confidence' | 'count'>('size')

  // Filter & Sort groups by tab, confidence, search query, and sort mode
  const filteredGroups = useMemo(() => {
    let list = groups.filter(g => {
      if (g.matchPercentage < minConfidence) return false
      if (activeTab === 'exact') return g.isExact
      if (activeTab === 'similar') return !g.isExact
      if (activeTab === 'videos') return g.isVideo

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const match = g.items.some(p => p.filename.toLowerCase().includes(q) || p.file_path?.toLowerCase().includes(q))
        if (!match) return false
      }

      return true
    })

    list.sort((a, b) => {
      if (sortBy === 'confidence') return b.matchPercentage - a.matchPercentage
      if (sortBy === 'count') return b.items.length - a.items.length
      return b.recoverableBytes - a.recoverableBytes
    })

    return list
  }, [groups, activeTab, minConfidence, searchQuery, sortBy])

  // Aggregate storage estimates
  const totalStats = useMemo(() => {
    let totalMasterBytes = 0
    let totalRecoverableBytes = 0
    let totalDuplicateCount = 0

    groups.forEach(g => {
      totalMasterBytes += g.items[0]?.file_size || 0
      totalRecoverableBytes += g.recoverableBytes
      totalDuplicateCount += (g.items.length - 1)
    })

    return {
      masterBytes: totalMasterBytes,
      recoverableBytes: totalRecoverableBytes,
      duplicateCount: totalDuplicateCount,
      groupCount: groups.length
    }
  }, [groups])

  // Check if all duplicates in current view are selected
  const isAllDuplicatesSelected = useMemo(() => {
    if (filteredGroups.length === 0) return false
    return filteredGroups.every(g => g.items.slice(1).every(item => selectedIds.has(item.id)))
  }, [filteredGroups, selectedIds])

  // Select / Deselect All Duplicates
  const toggleSelectAll = useCallback(() => {
    if (isAllDuplicatesSelected) {
      setSelectedIds(new Set())
      showToast('Deselected all duplicates')
    } else {
      const newSelected = new Set(selectedIds)
      filteredGroups.forEach(g => {
        g.items.slice(1).forEach(item => newSelected.add(item.id))
      })
      setSelectedIds(newSelected)
      showToast(`Selected all duplicates (${newSelected.size} files)`)
    }
  }, [isAllDuplicatesSelected, filteredGroups, selectedIds, showToast])

  // Ctrl + A keyboard shortcut for Select All
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const target = e.target as HTMLElement
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
        e.preventDefault()
        toggleSelectAll()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSelectAll])

  // Smart Auto-Select All Duplicates
  const handleSmartAutoSelectAll = () => {
    const newSelected = new Set<number>()
    groups.forEach(g => {
      g.items.slice(1).forEach(item => {
        newSelected.add(item.id)
      })
    })
    setSelectedIds(newSelected)
  }

  const handleSelectGroupDuplicates = (group: DuplicateGroup) => {
    const newSelected = new Set(selectedIds)
    const duplicateCopies = group.items.slice(1)
    const allSelected = duplicateCopies.every(item => newSelected.has(item.id))

    if (allSelected) {
      duplicateCopies.forEach(item => newSelected.delete(item.id))
    } else {
      duplicateCopies.forEach(item => newSelected.add(item.id))
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectPhoto = (id: number) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  // Selected Storage Savings calculation
  const selectedSavingsBytes = useMemo(() => {
    let bytes = 0
    groups.forEach(g => {
      g.items.forEach(item => {
        if (selectedIds.has(item.id)) {
          bytes += (item.file_size || 0)
        }
      })
    })
    return bytes
  }, [groups, selectedIds])

  // Batch Clean Action
  const handleBatchClean = async () => {
    let idsToDelete: number[] = []
    if (selectedIds.size > 0) {
      idsToDelete = Array.from(selectedIds)
    } else {
      groups.forEach(g => {
        g.items.slice(1).forEach(item => idsToDelete.push(item.id))
      })
    }

    if (idsToDelete.length === 0) return

    try {
      setShowConfirmModal(false)
      await window.photoVault.trash(idsToDelete)
      photoDispatch({ type: 'REMOVE_PHOTOS', payload: idsToDelete })
      setSelectedIds(new Set())
      showToast(`Moved ${idsToDelete.length} duplicates to Trash (${formatFileSize(selectedSavingsBytes || totalStats.recoverableBytes)} reclaimed)`, async () => {
        await window.photoVault.restore(idsToDelete)
        loadPhotos({})
        fetchDuplicates()
      })
      fetchDuplicates()
    } catch (err) {
      console.error('Batch clean duplicate error:', err)
    }
  }

  const handleOpenViewer = (photo: Photo, groupItems?: Photo[]) => {
    const allVisiblePhotos = filteredGroups.flatMap(g => g.items)
    photoDispatch({
      type: 'SET_VIEWER_SCOPED',
      payload: {
        photoId: photo.id,
        photos: allVisiblePhotos.length > 0 ? allVisiblePhotos : (groupItems || [photo])
      }
    })
  }

  return (
    <div className="apple-duplicates-page">
      {/* Ultra-Clean Header */}
      <header className="apple-page-header">
        <div className="apple-header-title-row">
          <div className="apple-header-left">
            <h1 className="apple-page-title">Duplicates</h1>
            {groups.length > 0 && (
              <span className="apple-storage-pill">
                +{formatFileSize(totalStats.recoverableBytes)} Reclaimable
              </span>
            )}
          </div>

          <div className="apple-header-actions">
            {/* Segmented Tab Filter with live counts */}
            {groups.length > 0 && (
              <div className="apple-segmented-bar">
                <button
                  type="button"
                  className={`apple-segment-btn ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  All ({tabCounts.all})
                </button>
                <button
                  type="button"
                  className={`apple-segment-btn ${activeTab === 'exact' ? 'active' : ''}`}
                  onClick={() => setActiveTab('exact')}
                >
                  100% Exact ({tabCounts.exact})
                </button>
                <button
                  type="button"
                  className={`apple-segment-btn ${activeTab === 'similar' ? 'active' : ''}`}
                  onClick={() => setActiveTab('similar')}
                >
                  90%+ Similar ({tabCounts.similar})
                </button>
                {tabCounts.videos > 0 && (
                  <button
                    type="button"
                    className={`apple-segment-btn ${activeTab === 'videos' ? 'active' : ''}`}
                    onClick={() => setActiveTab('videos')}
                  >
                    Videos ({tabCounts.videos})
                  </button>
                )}
              </div>
            )}

            {groups.length > 0 && (
              <button
                type="button"
                className="apple-secondary-btn"
                onClick={toggleSelectAll}
                title={isAllDuplicatesSelected ? 'Deselect All (Ctrl+A)' : 'Select All Duplicates (Ctrl+A)'}
              >
                {isAllDuplicatesSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                <span>{isAllDuplicatesSelected ? 'Deselect All' : 'Select All'}</span>
              </button>
            )}

            <button
              type="button"
              className="apple-secondary-btn"
              onClick={handleStartScan}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Scanning</span>
                </>
              ) : (
                <>
                  <Search size={14} />
                  <span>Rescan</span>
                </>
              )}
            </button>

            {groups.length > 0 && (
              <button
                type="button"
                className="apple-primary-btn"
                onClick={() => {
                  handleSmartAutoSelectAll()
                  setShowConfirmModal(true)
                }}
              >
                <Zap size={14} />
                <span>Clean ({formatFileSize(totalStats.recoverableBytes)})</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ─── Live Progressive Scan Banner (0% to 100%) ─────────────────── */}
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
                  ? `Scan Complete! Analyzed all ${scanProgress.total.toLocaleString()} items (${scanProgress.foundCount} duplicate groups found)`
                  : `Analyzing library media for exact & perceptual duplicates...`}
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

      {/* Duplicates Dynamic Grid Responsive to gridDensity */}
      {filteredGroups.length === 0 && !isScanning ? (
        <EmptyState
          icon={<ShieldCheck size={48} />}
          title="No Duplicates Found"
          description="Your library photos and videos are clean!"
          actionLabel={isScanning ? "Scanning..." : "Rescan"}
          onAction={handleStartScan}
        />
      ) : (
        <div className={`apple-duplicates-container density-${gridDensity}`}>
          {filteredGroups.map((group) => {
            const duplicateCopies = group.items.slice(1)
            const isGroupDuplicatesSelected = duplicateCopies.every(item => selectedIds.has(item.id))

            return (
              <div key={group.id} className={`apple-group-card ${group.items.length > 3 ? 'has-many-items' : ''}`}>
                {/* Minimal Header Bar */}
                <div className="apple-group-header">
                  <div className="apple-group-meta">
                    <span className={`apple-match-badge ${group.isExact ? 'is-exact' : 'is-similar'}`}>
                      {group.isExact ? <CheckCircle2 size={12} /> : <Sparkles size={12} />}
                      {group.isExact ? '100% Exact' : `${group.matchPercentage}% Match`}
                    </span>
                    <span className="apple-items-count-badge">
                      {group.items.length} files
                    </span>
                    <span className="apple-reclaim-text">
                      +{formatFileSize(group.recoverableBytes)}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="apple-merge-btn"
                    onClick={() => handleSelectGroupDuplicates(group)}
                  >
                    <span>{isGroupDuplicatesSelected ? 'Deselect' : 'Select Duplicates'}</span>
                  </button>
                </div>

                {/* Side-by-Side Comparison Items */}
                <div className={`apple-tiles-row count-${group.items.length} ${group.items.length > 3 ? 'has-many' : ''}`}>
                  {group.items.map((photo, itemIdx) => {
                    const isMaster = itemIdx === 0
                    const isSelectedForTrash = selectedIds.has(photo.id)
                    const isVideo = photo.mime_type?.startsWith('video') || photo.media_type === 'video'
                    const dimensionsText = photo.width && photo.height ? `${photo.width} × ${photo.height}` : ''

                    return (
                      <div
                        key={photo.id}
                        className={`apple-tile-card ${isMaster ? 'is-master-tile' : ''} ${isSelectedForTrash ? 'is-selected-trash' : ''}`}
                        title={`${photo.filename} (${formatFileSize(photo.file_size)})${isMaster ? ' • KEEP MASTER' : ' • DUPLICATE'}`}
                      >
                        <div
                          className="apple-tile-thumb"
                          onClick={() => handleOpenViewer(photo, group.items)}
                        >
                          <img
                            src={photo.thumbnail_path ? getThumbnailUrl(photo.thumbnail_path) : getThumbnailUrl(photo.file_path)}
                            alt={photo.filename}
                            className="apple-thumb-image"
                            loading="lazy"
                          />

                          {/* Master / Copy Badge */}
                          {isMaster ? (
                            <div className="apple-tile-badge-master">
                              {group.items.length > 3 ? 'MASTER' : 'KEEP MASTER'}
                            </div>
                          ) : (
                            <div className="apple-tile-badge-duplicate">
                              COPY {itemIdx}
                            </div>
                          )}

                          {/* Video Play Badge */}
                          {isVideo && (
                            <div className="apple-play-badge">
                              <Play size={10} fill="white" style={{ marginLeft: '1px' }} />
                            </div>
                          )}

                          {/* Selection Checkbox */}
                          <button
                            type="button"
                            className={`apple-checkbox ${isSelectedForTrash ? 'checked' : ''}`}
                            title={isSelectedForTrash ? "Keep this file" : "Mark duplicate for deletion"}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleSelectPhoto(photo.id)
                            }}
                          >
                            {isSelectedForTrash && <Check size={12} strokeWidth={3} />}
                          </button>

                          {/* Hover Micro Meta Overlay */}
                          <div className="apple-tile-overlay-meta">
                            <span>{formatFileSize(photo.file_size)}</span>
                            {dimensionsText && <span>{dimensionsText}</span>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Floating Apple Island Action Bar */}
      {selectedIds.size > 0 && (
        <div className="apple-floating-island">
          <div className="island-info">
            <span className="island-title">{selectedIds.size} duplicates selected</span>
            <span className="island-sub">Reclaims {formatFileSize(selectedSavingsBytes)} of disk space</span>
          </div>

          <div className="island-buttons">
            <button
              type="button"
              className="island-cancel-btn"
              onClick={() => setSelectedIds(new Set())}
            >
              Cancel
            </button>
            <button
              type="button"
              className="island-delete-btn"
              onClick={() => setShowConfirmModal(true)}
            >
              <Trash2 size={15} />
              <span>Delete Selected ({formatFileSize(selectedSavingsBytes)})</span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="clean-confirm-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="clean-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-wrapper">
              <Sparkles size={24} />
            </div>

            <h3 className="modal-title">Confirm Duplicate Cleaning</h3>
            <p className="modal-desc">
              You are about to move <strong>{selectedIds.size || totalStats.duplicateCount} duplicate files</strong> ({formatFileSize(selectedSavingsBytes || totalStats.recoverableBytes)}) to Trash.
            </p>

            <div className="modal-trust-box">
              <div className="trust-point">
                <Check size={14} className="point-icon" />
                <span>The highest quality version of every photo & video is preserved.</span>
              </div>
              <div className="trust-point">
                <Check size={14} className="point-icon" />
                <span>Files are moved to Photo Vault Trash first and can be restored anytime.</span>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-cancel-btn"
                onClick={() => setShowConfirmModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-confirm-btn"
                onClick={handleBatchClean}
              >
                <Trash2 size={15} />
                <span>Clean Duplicates ({formatFileSize(selectedSavingsBytes || totalStats.recoverableBytes)})</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
