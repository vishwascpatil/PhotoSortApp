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
  const { state: photoState, dispatch: photoDispatch, refreshPhotos } = usePhotos()
  const { state: appState, dispatch: appDispatch, showToast } = useApp()

  const [loading, setLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ scannedCount: number; totalCount: number; isScanning: boolean } | null>(null)
  const [utilitiesData, setUtilitiesData] = useState<{ duplicates: Photo[][]; similar: Photo[][] }>({
    duplicates: [],
    similar: []
  })
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState<'all' | 'exact' | 'similar' | 'videos'>('all')
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // Load utilities data from IPC
  const fetchDuplicates = useCallback(async () => {
    setLoading(true)
    try {
      if (window.photoVault?.getUtilitiesData) {
        const data = await window.photoVault.getUtilitiesData()
        setUtilitiesData({
          duplicates: data.duplicates || [],
          similar: data.similar || []
        })
      }
    } catch (err) {
      console.error('Failed to load duplicate data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDuplicates()
  }, [fetchDuplicates])

  // Subscribe to live duplicate scan progress
  useEffect(() => {
    if (window.photoVault?.onDuplicateScanProgress) {
      const unsub = window.photoVault.onDuplicateScanProgress((progress) => {
        setScanProgress({
          scannedCount: progress.scanned,
          totalCount: progress.total,
          isScanning: progress.scanned < progress.total
        })
      })
      return unsub
    }
  }, [])

  // Trigger manual 100% Pixel Density Duplicate Scan
  const handleStartScan = async () => {
    setIsScanning(true)
    showToast('Computing 64-bit visual pixel-density hashes across library...')
    try {
      if (window.photoVault?.scanDuplicates) {
        const data = await window.photoVault.scanDuplicates()
        setUtilitiesData({
          duplicates: data.duplicates || [],
          similar: data.similar || []
        })
      }
    } catch (err) {
      console.error('Scan duplicates error:', err)
    } finally {
      setIsScanning(false)
      fetchDuplicates()
    }
  }

  // Helper to calculate hamming distance match percentage
  const calculateMatch = (p1: Photo, p2: Photo, isExact: boolean): number => {
    if (isExact) return 100
    if (!p1.perceptual_hash || !p2.perceptual_hash || p1.perceptual_hash === '0000000000000000') return 95
    let distance = 0
    for (let i = 0; i < Math.min(p1.perceptual_hash.length, p2.perceptual_hash.length); i++) {
      const n1 = parseInt(p1.perceptual_hash[i], 16)
      const n2 = parseInt(p2.perceptual_hash[i], 16)
      let xor = n1 ^ n2
      while (xor > 0) {
        distance += xor & 1
        xor >>= 1
      }
    }
    return Math.max(75, Math.round(((64 - distance) / 64) * 100))
  }

  // Structure duplicate groups with Master (Largest file size) + Duplicates
  const groups: DuplicateGroup[] = useMemo(() => {
    const result: DuplicateGroup[] = []

    // Process Exact Duplicates
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

    // Process Similar Photos
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

  // Filter groups by tab
  const filteredGroups = useMemo(() => {
    if (activeTab === 'exact') return groups.filter(g => g.isExact)
    if (activeTab === 'similar') return groups.filter(g => !g.isExact)
    if (activeTab === 'videos') return groups.filter(g => g.isVideo)
    return groups
  }, [groups, activeTab])

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
        refreshPhotos()
        fetchDuplicates()
      })
      fetchDuplicates()
    } catch (err) {
      console.error('Batch clean duplicate error:', err)
    }
  }

  const handleOpenViewer = (photo: Photo) => {
    photoDispatch({ type: 'SET_VIEWER_SCOPED', payload: { photoId: photo.id, photos: [photo] } })
  }

  return (
    <div className="apple-duplicates-page" style={{ padding: '20px 28px' }}>
      {/* Ultra-Clean Apple Header */}
      <header className="apple-page-header" style={{ marginBottom: '16px', gap: '12px' }}>
        <div className="apple-header-title-row">
          <div className="apple-header-left">
            <h1 className="apple-page-title" style={{ fontSize: '24px' }}>Duplicates</h1>
            {groups.length > 0 && (
              <span className="apple-storage-pill">
                {formatFileSize(totalStats.recoverableBytes)}
              </span>
            )}
          </div>

          <div className="apple-header-actions" style={{ gap: '8px' }}>
            {/* Segmented Tab Filter */}
            {groups.length > 0 && (
              <div className="apple-segmented-bar">
                <button
                  type="button"
                  className={`apple-segment-btn ${activeTab === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveTab('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`apple-segment-btn ${activeTab === 'exact' ? 'active' : ''}`}
                  onClick={() => setActiveTab('exact')}
                >
                  Exact
                </button>
                <button
                  type="button"
                  className={`apple-segment-btn ${activeTab === 'similar' ? 'active' : ''}`}
                  onClick={() => setActiveTab('similar')}
                >
                  Similar
                </button>
                <button
                  type="button"
                  className={`apple-segment-btn ${activeTab === 'videos' ? 'active' : ''}`}
                  onClick={() => setActiveTab('videos')}
                >
                  Videos
                </button>
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

      {/* Live Scan Progress */}
      {isScanning && (
        <div className="apple-scan-banner" style={{ margin: '0 0 16px 0', padding: '10px 16px' }}>
          <Loader2 size={16} className="animate-spin" />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '12px', fontWeight: 600 }}>
              <span>Analyzing photo & video similarities...</span>
              <span>{scanProgress ? `${scanProgress.scannedCount} / ${scanProgress.totalCount}` : 'Processing...'}</span>
            </div>
            <div className="apple-progress-track" style={{ height: '3px' }}>
              <div
                className="apple-progress-fill"
                style={{
                  width: `${scanProgress && scanProgress.totalCount > 0 ? Math.round((scanProgress.scannedCount / scanProgress.totalCount) * 100) : 10}%`
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Ultra-Dense Stream Grid */}
      {loading ? (
        <div className="apple-loading-state" style={{ padding: '40px' }}>
          <RefreshCw size={24} className="animate-spin" />
          <span>Analyzing...</span>
        </div>
      ) : filteredGroups.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={48} />}
          title="No Duplicates Found"
          description="Your library photos and videos are clean!"
          actionLabel={isScanning ? "Scanning..." : "Rescan"}
          onAction={handleStartScan}
        />
      ) : (
        <div
          className="apple-groups-container"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${appState.gridDensity === 'comfortable' ? '420px' : appState.gridDensity === 'medium' ? '320px' : '230px'}, 1fr))`,
            gap: appState.gridDensity === 'comfortable' ? '20px' : appState.gridDensity === 'medium' ? '14px' : '10px'
          }}
        >
          {filteredGroups.map((group, gIdx) => {
            const duplicateCopies = group.items.slice(1)
            const isGroupDuplicatesSelected = duplicateCopies.every(item => selectedIds.has(item.id))

            return (
              <div
                key={group.id}
                className="apple-group-card"
                style={{
                  padding: appState.gridDensity === 'comfortable' ? '14px 16px' : appState.gridDensity === 'medium' ? '10px 12px' : '8px 10px',
                  borderRadius: appState.gridDensity === 'comfortable' ? '16px' : '12px',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                {/* Minimal Header Bar */}
                <div className="apple-group-header" style={{ marginBottom: '6px' }}>
                  <div className="apple-group-meta" style={{ gap: '6px' }}>
                    <span className={`apple-match-badge ${group.isExact ? 'is-exact' : 'is-similar'}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                      {group.matchPercentage}%
                    </span>
                    <span className="apple-reclaim-text" style={{ fontSize: '10px' }}>
                      {formatFileSize(group.recoverableBytes)}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="apple-merge-btn"
                    style={{ fontSize: '10px', padding: '2px 8px' }}
                    onClick={() => handleSelectGroupDuplicates(group)}
                  >
                    <span>{isGroupDuplicatesSelected ? 'Deselect' : 'Select'}</span>
                  </button>
                </div>

                {/* Full Width Side-by-Side Comparison Items */}
                <div className="apple-grid-row" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(group.items.length, 4)}, 1fr)`, gap: appState.gridDensity === 'dense' ? '6px' : '8px' }}>
                  {group.items.map((photo, itemIdx) => {
                    const isMaster = itemIdx === 0
                    const isSelectedForTrash = selectedIds.has(photo.id)
                    const isVideo = photo.mime_type?.startsWith('video') || photo.media_type === 'video'

                    return (
                      <div
                        key={photo.id}
                        className={`apple-tile-card ${isMaster ? 'is-master-tile' : ''} ${isSelectedForTrash ? 'is-selected-trash' : ''}`}
                        title={`${photo.filename} (${formatFileSize(photo.file_size)})${isMaster ? ' - KEEP MASTER' : ' - DUPLICATE'}`}
                        style={{ borderRadius: appState.gridDensity === 'comfortable' ? '12px' : '10px' }}
                      >
                        <div
                          className="apple-tile-thumb"
                          onClick={() => handleOpenViewer(photo)}
                          style={{ aspectRatio: appState.gridDensity === 'comfortable' ? '4/3' : '1/1' }}
                        >
                          <img
                            src={photo.thumbnail_path ? getThumbnailUrl(photo.thumbnail_path) : getThumbnailUrl(photo.file_path)}
                            alt={photo.filename}
                            className="apple-thumb-image"
                            loading="lazy"
                          />

                          {isVideo && (
                            <div className="apple-play-badge" style={{ width: '14px', height: '14px', bottom: '2px', left: '2px' }}>
                              <Play size={8} fill="white" style={{ marginLeft: '1px' }} />
                            </div>
                          )}

                          {/* Checkbox */}
                          <button
                            type="button"
                            className={`apple-checkbox ${isSelectedForTrash ? 'checked' : ''}`}
                            style={{ width: '16px', height: '16px', top: '2px', right: '2px' }}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleSelectPhoto(photo.id)
                            }}
                          >
                            {isSelectedForTrash && <Check size={10} strokeWidth={3} />}
                          </button>
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
