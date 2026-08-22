import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  HardDrive, Film, ImageIcon, Folder, CheckSquare,
  Square, Trash2, RefreshCw, History, Play, Loader2, X,
  Check, CheckCircle2, ArrowUpDown
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import EmptyState from '../components/EmptyState'
import { formatFileSize, formatDate, getThumbnailUrl, isVideoFile } from '../utils/helpers'

const THRESHOLD_OPTIONS = [
  { label: '> 25 MB', bytes: 25 * 1024 * 1024 },
  { label: '> 50 MB', bytes: 50 * 1024 * 1024 },
  { label: '> 100 MB', bytes: 100 * 1024 * 1024 },
  { label: '> 250 MB', bytes: 250 * 1024 * 1024 },
  { label: '> 500 MB', bytes: 500 * 1024 * 1024 },
  { label: '> 1 GB', bytes: 1024 * 1024 * 1024 }
]

export default function LargeFilesPage() {
  const { state: photoState, dispatch: photoDispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  // Controls
  const [minBytes, setMinBytes] = useState<number>(50 * 1024 * 1024)
  const [mediaType, setMediaType] = useState<'all' | 'video' | 'image'>('all')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Relocation Modal & Progress
  const [showMoveModal, setShowMoveModal] = useState(false)
  const [destinationDir, setDestinationDir] = useState<string>('')
  const [preserveSubpath, setPreserveSubpath] = useState(true)
  const [isMoving, setIsMoving] = useState(false)
  const [moveProgress, setMoveProgress] = useState<{
    completed: number
    total: number
    currentFile: string
    bytesMoved: number
    totalBytes: number
    percentage: number
  } | null>(null)
  const [moveSummary, setMoveSummary] = useState<{
    manifestId: string
    movedCount: number
    totalBytesMoved: number
    errors: string[]
  } | null>(null)

  // History Drawer
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [manifests, setManifests] = useState<any[]>([])
  const [isUndoing, setIsUndoing] = useState(false)

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

  // Progress listener
  useEffect(() => {
    if (window.photoVault?.onLargeFilesProgress) {
      const cleanup = window.photoVault.onLargeFilesProgress((progress) => {
        setMoveProgress(progress)
      })
      return cleanup
    }
  }, [])

  // Filter large files
  const largeFiles = useMemo(() => {
    return photoState.photos.filter((p) => {
      const isVid = isVideoFile(p.file_path) || p.mime_type?.startsWith('video/')
      const size = p.file_size || 0

      if (size < minBytes) return false
      if (mediaType === 'video') return isVid
      if (mediaType === 'image') return !isVid
      return true
    })
  }, [photoState.photos, minBytes, mediaType])

  // Sorted candidates
  const sortedFiles = useMemo(() => {
    return [...largeFiles].sort((a, b) => {
      const sizeA = a.file_size || 0
      const sizeB = b.file_size || 0
      return sortOrder === 'desc' ? sizeB - sizeA : sizeA - sizeB
    })
  }, [largeFiles, sortOrder])

  // Aggregate stats
  const totalBytes = useMemo(() => {
    return sortedFiles.reduce((acc, p) => acc + (p.file_size || 0), 0)
  }, [sortedFiles])

  const selectedPhotos = useMemo(() => {
    return sortedFiles.filter(p => selectedIds.has(p.id))
  }, [sortedFiles, selectedIds])

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
    if (selectedIds.size === sortedFiles.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedFiles.map(p => p.id)))
    }
  }

  const handleTileClick = (photo: Photo) => {
    photoDispatch({ type: 'SET_VIEWER', payload: photo.id })
  }

  // Choose destination directory
  const handleBrowseDestination = async () => {
    try {
      if (window.photoVault?.selectLargeFilesDestination) {
        const path = await window.photoVault.selectLargeFilesDestination()
        if (path) setDestinationDir(path)
      }
    } catch (err) {
      console.error('Failed to select destination directory:', err)
    }
  }

  // Move large files to external folder
  const handleExecuteMove = async () => {
    if (!destinationDir) {
      showToast('Please select a destination folder first')
      return
    }

    const ids = selectedPhotos.map(p => p.id)
    if (ids.length === 0) return

    setIsMoving(true)
    setMoveProgress({
      completed: 0,
      total: ids.length,
      currentFile: 'Starting transfer...',
      bytesMoved: 0,
      totalBytes: selectedBytes,
      percentage: 0
    })

    try {
      if (window.photoVault?.moveLargeFiles) {
        const res = await window.photoVault.moveLargeFiles({
          fileIds: ids,
          destinationDir,
          preserveRelativeSubpath: preserveSubpath,
          collisionStrategy: 'rename',
          updateDatabasePath: false
        })

        setMoveSummary({
          manifestId: res.manifestId,
          movedCount: res.movedCount,
          totalBytesMoved: res.totalBytesMoved,
          errors: res.errors || []
        })

        photoDispatch({ type: 'REMOVE_PHOTOS', payload: ids })
        setSelectedIds(new Set())
        refreshPhotos()
        showToast(`Relocated ${res.movedCount} large files (${formatFileSize(res.totalBytesMoved)})`)
      }
    } catch (err: any) {
      console.error('Relocation failed:', err)
      showToast(`Error relocating files: ${err.message || err}`)
    } finally {
      setIsMoving(false)
    }
  }

  // Move selected to Trash
  const handleTrashSelected = async () => {
    if (selectedPhotos.length === 0) return
    const ids = selectedPhotos.map(p => p.id)
    const count = ids.length
    if (!confirm(`Move ${count} large files (${formatFileSize(selectedBytes)}) to Trash?`)) return

    try {
      if (window.photoVault?.trash) {
        await window.photoVault.trash(ids)
        photoDispatch({ type: 'REMOVE_PHOTOS', payload: ids })
        setSelectedIds(new Set())
        showToast(`Moved ${count} large files to Trash`)
        refreshPhotos()
      }
    } catch (err) {
      console.error('Failed to trash large files:', err)
      showToast('Failed to move files to Trash')
    }
  }

  // History & Undo
  const loadManifests = async () => {
    try {
      if (window.photoVault?.getLargeFileManifests) {
        const list = await window.photoVault.getLargeFileManifests()
        setManifests(list || [])
      }
    } catch {}
  }

  const handleOpenHistory = async () => {
    await loadManifests()
    setShowHistoryModal(true)
  }

  const handleUndoMove = async (manifestId: string) => {
    if (!confirm('Undo relocation and restore files to original paths?')) return

    try {
      setIsUndoing(true)
      if (window.photoVault?.undoLargeFileMove) {
        const res = await window.photoVault.undoLargeFileMove(manifestId)
        if (res.success) {
          showToast(`Restored ${res.restoredCount} files to original paths`)
          await loadManifests()
          refreshPhotos()
          if (moveSummary?.manifestId === manifestId) {
            setMoveSummary(null)
            setShowMoveModal(false)
          }
        } else {
          showToast(`Undo error: ${res.errors.join(', ')}`)
        }
      }
    } catch (err: any) {
      console.error('Failed undoing move:', err)
      showToast(`Failed to undo move: ${err.message || err}`)
    } finally {
      setIsUndoing(false)
    }
  }

  return (
    <div className="photos-page" style={{ padding: '20px 28px' }}>
      {/* ─── Sleek Minimal Header ─────────────────────────────────────────── */}
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
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 3px 10px rgba(245, 158, 11, 0.25)'
            }}
          >
            <HardDrive size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Large Files
              </h1>
              {sortedFiles.length > 0 && (
                <span
                  style={{
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#d97706',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '12px'
                  }}
                >
                  {sortedFiles.length} files • {formatFileSize(totalBytes)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedPhotos.length > 0 && (
            <>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleTrashSelected}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  padding: '6px 12px',
                  borderRadius: '8px'
                }}
              >
                <Trash2 size={14} /> Trash ({selectedPhotos.length})
              </button>

              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowMoveModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '6px 14px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                }}
              >
                <Folder size={14} /> Relocate ({formatFileSize(selectedBytes)})
              </button>
            </>
          )}

          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleOpenHistory}
            title="Relocation History & Undo"
            style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '6px 10px' }}
          >
            <History size={15} /> History
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { refreshPhotos(); showToast('Refreshed!') }}
            title="Rescan"
            style={{ display: 'flex', alignItems: 'center', padding: '6px 10px' }}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ─── Compact Visual Controls Bar ─────────────────────────────────── */}
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
        {/* Threshold Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {THRESHOLD_OPTIONS.map((opt) => {
            const isActive = minBytes === opt.bytes
            return (
              <button
                key={opt.label}
                type="button"
                className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setMinBytes(opt.bytes)}
                style={{
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontWeight: isActive ? 700 : 500
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>

        {/* Media Filters & Select All */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-secondary)', padding: '2px', borderRadius: '8px' }}>
            <button
              type="button"
              className={`btn ${mediaType === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMediaType('all')}
              style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px' }}
            >
              All
            </button>
            <button
              type="button"
              className={`btn ${mediaType === 'video' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMediaType('video')}
              style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Film size={12} /> Videos
            </button>
            <button
              type="button"
              className={`btn ${mediaType === 'image' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMediaType('image')}
              style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <ImageIcon size={12} /> Photos
            </button>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')}
            title="Sort by size"
            style={{ fontSize: '11px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <ArrowUpDown size={12} /> {sortOrder === 'desc' ? 'Largest First' : 'Smallest First'}
          </button>

          {sortedFiles.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleSelectAll}
              style={{ fontSize: '12px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {selectedIds.size === sortedFiles.length ? (
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
      {sortedFiles.length === 0 ? (
        <EmptyState
          icon={<HardDrive size={48} />}
          title="No Large Files Found"
          description={`No media files exceed ${formatFileSize(minBytes)}.`}
          actionLabel="Lower Threshold to 25 MB"
          onAction={() => setMinBytes(25 * 1024 * 1024)}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '14px',
            marginBottom: '40px'
          }}
        >
          {sortedFiles.map((photo) => {
            const isSelected = selectedIds.has(photo.id)
            const isVid = isVideoFile(photo.file_path)
            const sizeFormatted = formatFileSize(photo.file_size || 0)
            const isGigabyte = (photo.file_size || 0) >= 1024 * 1024 * 1024

            return (
              <div
                key={photo.id}
                onClick={() => handleTileClick(photo)}
                title={photo.filename}
                style={{
                  background: '#0b0f19',
                  border: isSelected ? '2.5px solid #f59e0b' : '1px solid var(--border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  boxShadow: isSelected ? '0 4px 18px rgba(245, 158, 11, 0.3)' : 'none'
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
                    top: '8px',
                    left: '8px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: isSelected ? '#f59e0b' : 'rgba(0, 0, 0, 0.45)',
                    border: '1.5px solid #ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    zIndex: 2
                  }}
                >
                  {isSelected && <Check size={16} strokeWidth={3} />}
                </div>

                {/* Video Badge */}
                {isVid && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '8px',
                      left: '8px',
                      background: 'rgba(0, 0, 0, 0.75)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Play size={9} fill="#fff" /> VIDEO
                  </div>
                )}

                {/* Highlighted Glowing Size Badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: isGigabyte
                      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                      : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    letterSpacing: '0.02em'
                  }}
                >
                  {sizeFormatted}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Relocation Modal ─────────────────────────────────────────────── */}
      {showMoveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            style={{
              background: 'var(--bg-primary, #ffffff)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Folder size={18} color="#d97706" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Relocate {selectedPhotos.length} Large Files ({formatFileSize(selectedBytes)})
                </h3>
              </div>
              {!isMoving && (
                <button
                  type="button"
                  onClick={() => setShowMoveModal(false)}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Modal Content */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginBottom: '6px' }}>
                  Destination Folder / External Drive
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    placeholder="Click Browse to select folder..."
                    value={destinationDir}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      fontSize: '12px'
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleBrowseDestination}
                    disabled={isMoving}
                    style={{ fontSize: '12px' }}
                  >
                    Browse...
                  </button>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={preserveSubpath}
                  onChange={(e) => setPreserveSubpath(e.target.checked)}
                  disabled={isMoving}
                />
                <span>Preserve subfolder hierarchy</span>
              </label>

              {/* Progress */}
              {isMoving && moveProgress && (
                <div style={{ background: 'var(--bg-secondary)', padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px', fontWeight: 600 }}>
                    <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                      {moveProgress.currentFile}
                    </span>
                    <span>{moveProgress.percentage}%</span>
                  </div>

                  <div style={{ width: '100%', height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${moveProgress.percentage}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #f59e0b 0%, #10b981 100%)',
                        transition: 'width 0.2s ease'
                      }}
                    />
                  </div>

                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    {formatFileSize(moveProgress.bytesMoved)} / {formatFileSize(moveProgress.totalBytes)} (Copy → Verify → Delete)
                  </div>
                </div>
              )}

              {/* Move Summary */}
              {moveSummary && (
                <div
                  style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 700, fontSize: '13px' }}>
                    <CheckCircle2 size={16} />
                    <span>Relocated {moveSummary.movedCount} Files ({formatFileSize(moveSummary.totalBytesMoved)})</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleUndoMove(moveSummary.manifestId)}
                      disabled={isUndoing}
                      style={{ fontSize: '11px', color: '#ef4444' }}
                    >
                      {isUndoing ? 'Undoing...' : 'Undo Move'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => { setShowMoveModal(false); setMoveSummary(null) }}
                      style={{ fontSize: '11px', marginLeft: 'auto' }}
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {!moveSummary && (
              <div
                style={{
                  padding: '12px 20px',
                  background: 'var(--bg-secondary)',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px'
                }}
              >
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowMoveModal(false)}
                  disabled={isMoving}
                  style={{ fontSize: '12px' }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleExecuteMove}
                  disabled={isMoving || !destinationDir}
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                  }}
                >
                  {isMoving ? 'Moving...' : 'Start Relocation'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Relocation History Modal ─────────────────────────────────────── */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}
        >
          <div
            style={{
              background: 'var(--bg-primary, #ffffff)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '75vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={18} color="var(--primary)" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Relocation History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {manifests.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  No relocation history yet.
                </div>
              ) : (
                manifests.map((m) => (
                  <div
                    key={m.manifestId}
                    style={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {m.totalFiles} files ({formatFileSize(m.totalBytes)})
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
                        To: {m.destinationDir}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>
                        {new Date(m.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <div>
                      {m.isUndone ? (
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', background: 'rgba(100, 116, 139, 0.12)', padding: '3px 8px', borderRadius: '4px' }}>
                          Restored
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => handleUndoMove(m.manifestId)}
                          disabled={isUndoing}
                          style={{ fontSize: '11px', padding: '4px 10px' }}
                        >
                          {isUndoing ? 'Undoing...' : 'Undo'}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
