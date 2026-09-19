import React, { useState, useMemo, useEffect } from 'react'
import {
  FileText, CheckSquare, Square,
  Trash2, ShieldCheck, Loader2, Check, Sparkles,
  Car, CreditCard, Activity, GraduationCap, Briefcase,
  Home, Plane, Receipt, Building2, Scale, ShieldAlert,
  CheckCircle2
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import EmptyState from '../components/EmptyState'
import { formatFileSize, getThumbnailUrl } from '../utils/helpers'

const DOC_CATEGORIES = [
  'All Documents',
  'Government & Identity',
  'Vehicle',
  'Banking & Finance',
  'Medical',
  'Education',
  'Employment',
  'Property',
  'Travel',
  'Utility Bills',
  'Business & Commerce',
  'Legal'
]

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'All Documents': <FileText size={13} />,
  'Government & Identity': <ShieldCheck size={13} />,
  'Vehicle': <Car size={13} />,
  'Banking & Finance': <CreditCard size={13} />,
  'Medical': <Activity size={13} />,
  'Education': <GraduationCap size={13} />,
  'Employment': <Briefcase size={13} />,
  'Property': <Home size={13} />,
  'Travel': <Plane size={13} />,
  'Utility Bills': <Receipt size={13} />,
  'Business & Commerce': <Building2 size={13} />,
  'Legal': <Scale size={13} />
}

interface ScanProgressState {
  completed: number
  total: number
  percent: number
  currentFile: string
  status: string
  phase: 'prefilter' | 'ocr' | 'done'
  isComplete: boolean
  isScanning: boolean
  docsFound: number
}

export default function DocumentsPage() {
  const { state: photoState, dispatch: photoDispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast, state: appState } = useApp()

  // Grid density from AppContext (controlled by topbar icon)
  const gridDensity = appState.gridDensity || 'dense'
  const isDense = gridDensity === 'dense'
  const isComfortable = gridDensity === 'comfortable'
  const isMedium = gridDensity === 'medium'

  const minTileWidth = isComfortable ? 240 : isMedium ? 160 : 100
  const gridGap = isComfortable ? '14px' : isMedium ? '10px' : '6px'
  const tileRadius = isComfortable ? '12px' : isMedium ? '8px' : '6px'
  const checkboxSize = isComfortable ? 24 : isMedium ? 20 : 16
  const checkIconSize = isComfortable ? 16 : isMedium ? 13 : 10
  const badgeFontSize = isComfortable ? '10px' : isMedium ? '9px' : '8px'
  const badgePadding = isComfortable ? '3px 8px' : isMedium ? '2px 6px' : '2px 5px'

  const [activeCategory, setActiveCategory] = useState<string>('All Documents')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isScanning, setIsScanning] = useState(false)
  const [isCleaning, setIsCleaning] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgressState | null>(null)

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

  // Subscribe to live progressive scan events
  useEffect(() => {
    if (window.photoVault?.onDocDetectProgress) {
      const unsub = window.photoVault.onDocDetectProgress((p: ScanProgressState) => {
        setScanProgress(p)
        if (p.isScanning) {
          setIsScanning(true)
        }
        if (p.isComplete) {
          refreshPhotos()
          setTimeout(() => {
            setScanProgress(null)
            setIsScanning(false)
          }, 2500)
        }
      })
      return unsub
    }
  }, [refreshPhotos])

  // Filter documents - STRICT: only actual verified documents or document MIME types
  const documentPhotos = useMemo(() => {
    return photoState.photos.filter((p) => {
      const isDoc =
        p.is_document === 1 ||
        (p.mime_type && (p.mime_type.includes('pdf') || p.mime_type.includes('text') || p.mime_type.includes('document')))

      if (!isDoc) return false

      // Category filter
      if (activeCategory !== 'All Documents') {
        const cat = p.document_category
        if (cat !== activeCategory) return false
      }

      return true
    })
  }, [photoState.photos, activeCategory])

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 'All Documents': 0 }
    for (const cat of DOC_CATEGORIES) {
      counts[cat] = 0
    }

    for (const p of photoState.photos) {
      const isDoc =
        p.is_document === 1 ||
        (p.mime_type && (p.mime_type.includes('pdf') || p.mime_type.includes('text') || p.mime_type.includes('document')))

      if (isDoc) {
        counts['All Documents']++
        if (p.document_category && counts[p.document_category] !== undefined) {
          counts[p.document_category]++
        }
      }
    }

    return counts
  }, [photoState.photos])

  // Auto-reset active category if its count becomes 0
  useEffect(() => {
    if (activeCategory !== 'All Documents' && (categoryCounts[activeCategory] || 0) === 0) {
      setActiveCategory('All Documents')
    }
  }, [categoryCounts, activeCategory])

  const totalBytes = useMemo(() => {
    return documentPhotos.reduce((acc, p) => acc + (p.file_size || 0), 0)
  }, [documentPhotos])

  const selectedPhotos = useMemo(() => {
    return documentPhotos.filter(p => selectedIds.has(p.id))
  }, [documentPhotos, selectedIds])

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
    if (selectedIds.size === documentPhotos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(documentPhotos.map(p => p.id)))
    }
  }

  const handleTileClick = (photo: Photo) => {
    photoDispatch({
      type: 'SET_VIEWER_SCOPED',
      payload: { photoId: photo.id, photos: documentPhotos }
    })
  }

  // Clean false positives from library
  const handleCleanFalsePositives = async () => {
    if (isCleaning) return
    setIsCleaning(true)
    try {
      if (window.photoVault?.cleanFalsePositiveDocuments) {
        const res = await window.photoVault.cleanFalsePositiveDocuments()
        showToast(`Cleaned ${res.cleared} false positives! ${res.kept} verified documents kept.`)
        await refreshPhotos()
      }
    } catch (err: any) {
      console.error('Failed to clean documents:', err)
      showToast(`Clean failed: ${err.message || err}`)
    } finally {
      setIsCleaning(false)
    }
  }

  // Scan library for documents using the two-phase progressive engine
  const handleRunDocumentScan = async () => {
    if (isScanning) return
    setIsScanning(true)

    const total = photoState.photos.length || 1425
    setScanProgress({
      completed: 0,
      total,
      percent: 0,
      currentFile: photoState.photos[0]?.filename || '',
      status: `Phase 1/2: Pre-filtering ${total.toLocaleString()} photos with fast edge analysis...`,
      phase: 'prefilter',
      isComplete: false,
      isScanning: true,
      docsFound: 0
    })

    try {
      if (window.photoVault?.startDocumentScan) {
        const res = await window.photoVault.startDocumentScan(true)
        showToast(
          res.docsFound > 0
            ? `Scan finished! Analyzed ${res.total.toLocaleString()} items (${res.docsFound} verified documents found).`
            : `Scan finished! No new documents detected.`
        )
        refreshPhotos()
      }
    } catch (err: any) {
      console.error('Document scan failed:', err)
      showToast(`Scan error: ${err.message || err}`)
    } finally {
      setIsScanning(false)
      setScanProgress(null)
    }
  }

  const handleStopScan = async () => {
    try {
      if (window.photoVault?.stopDocumentScan) {
        await window.photoVault.stopDocumentScan()
        showToast('Scan stopped')
      }
    } catch (err) {
      console.error('Failed to stop scan:', err)
    } finally {
      setIsScanning(false)
      setScanProgress(null)
    }
  }

  // Move selected to Trash
  const handleTrashSelected = async () => {
    if (selectedPhotos.length === 0) return
    const ids = selectedPhotos.map(p => p.id)
    const count = ids.length
    if (!confirm(`Move ${count} documents (${formatFileSize(selectedBytes)}) to Trash?`)) return

    try {
      if (window.photoVault?.trash) {
        await window.photoVault.trash(ids)
        photoDispatch({ type: 'REMOVE_PHOTOS', payload: ids })
        setSelectedIds(new Set())
        showToast(`Moved ${count} documents to Trash`)
        refreshPhotos()
      }
    } catch (err) {
      console.error('Failed to trash documents:', err)
      showToast('Failed to move documents to Trash')
    }
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
        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          {selectedPhotos.length > 0 && (
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
              <span>Trash ({selectedPhotos.length})</span>
            </button>
          )}

          {/* Clean False Positives Button */}
          <button
            type="button"
            className="apple-secondary-btn"
            onClick={handleCleanFalsePositives}
            disabled={isCleaning || isScanning}
            title="Purge noise, memes, OTPs and verify real documents"
          >
            {isCleaning ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
            <span>{isCleaning ? 'Cleaning...' : 'Clean False Positives'}</span>
          </button>

          {/* Scan Documents Button */}
          <button
            type="button"
            className="apple-primary-btn"
            onClick={handleRunDocumentScan}
            disabled={isScanning || isCleaning}
          >
            {isScanning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Scanning Documents...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Scan Documents</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Live Scanner Progress Banner ──────────────────────────────── */}
      {(isScanning || scanProgress?.isScanning) && (
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
                Scanning photo library for documents...
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Scanned {scanProgress?.completed || 0} of {scanProgress?.total || (photoState.photos.length || 0)} photos (
                {scanProgress && scanProgress.total > 0
                  ? Math.round((scanProgress.completed / scanProgress.total) * 100)
                  : 0}
                %){scanProgress && scanProgress.docsFound > 0 ? ` • ${scanProgress.docsFound} documents found` : ''}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="apple-secondary-btn"
            onClick={handleStopScan}
            style={{ fontSize: '12px', padding: '4px 10px' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ─── Category Filter Pills Bar ───────────────────────────────────── */}
      {(categoryCounts['All Documents'] || 0) > 0 && (
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {DOC_CATEGORIES.map((cat) => {
              const count = categoryCounts[cat] || 0
              if (count === 0) return null
              const isActive = activeCategory === cat
              const icon = CATEGORY_ICONS[cat] || <FileText size={13} />

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    fontSize: '12px',
                    padding: '5px 14px',
                    borderRadius: '99px',
                    fontWeight: isActive ? 600 : 500,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    border: isActive ? '1px solid transparent' : '1px solid var(--border)',
                    background: isActive ? 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' : 'var(--bg-secondary)',
                    color: isActive ? '#ffffff' : 'var(--text-secondary)',
                    boxShadow: isActive ? '0 2px 8px rgba(99, 102, 241, 0.25)' : 'none'
                  }}
                >
                  {icon}
                  <span>{cat}</span>
                  <span style={{
                    fontSize: '11px',
                    opacity: isActive ? 0.9 : 0.6,
                    fontWeight: 600
                  }}>
                    ({count})
                  </span>
                </button>
              )
            })}
          </div>

          {documentPhotos.length > 0 && (
            <button
              type="button"
              className="apple-secondary-btn"
              onClick={handleSelectAll}
              style={{ fontSize: '12px', padding: '5px 12px', gap: '6px' }}
            >
              {selectedIds.size === documentPhotos.length ? (
                <CheckSquare size={14} color="#6366f1" />
              ) : (
                <Square size={14} />
              )}
              <span>{selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Select All'}</span>
            </button>
          )}
        </div>
      )}

      {/* ─── Media-First Documents Grid ──────────────────────────────────── */}
      {documentPhotos.length === 0 ? (
        <EmptyState
          icon={
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                  <linearGradient id="docIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4f46e5" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#7c3aed" />
                  </linearGradient>
                </defs>
              </svg>
              <FileText
                size={46}
                strokeWidth={1.8}
                stroke="url(#docIconGrad)"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
              />
            </div>
          }
          title={
            <>
              No <span className="title-sort-gradient">Documents</span> Found
            </>
          }
          description="Detected documents, receipts, IDs, and screenshots of papers will appear here automatically."
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
          {documentPhotos.map((photo) => {
            const isSelected = selectedIds.has(photo.id)
            const catLabel = photo.document_category || 'Document'

            return (
              <div
                key={photo.id}
                onClick={() => handleTileClick(photo)}
                title={`${photo.filename}\nCategory: ${catLabel}\n${photo.extracted_text ? `Text: ${photo.extracted_text.slice(0, 100)}...` : ''}`}
                style={{
                  background: '#0b0f19',
                  border: isSelected ? '2.5px solid #3b82f6' : '1px solid var(--border)',
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
                {/* Document Image Thumbnail */}
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
                    top: isDense ? '4px' : '8px',
                    left: isDense ? '4px' : '8px',
                    width: `${checkboxSize}px`,
                    height: `${checkboxSize}px`,
                    borderRadius: isDense ? '4px' : '6px',
                    background: isSelected ? '#3b82f6' : 'rgba(0, 0, 0, 0.45)',
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

                {/* Category Badge Overlaid */}
                <div
                  style={{
                    position: 'absolute',
                    top: isDense ? '4px' : '8px',
                    right: isDense ? '4px' : '8px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: badgeFontSize,
                    padding: badgePadding,
                    borderRadius: isDense ? '6px' : '10px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    letterSpacing: '0.02em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {CATEGORY_ICONS[catLabel] || <FileText size={isDense ? 8 : 10} />}
                  <span>{catLabel}</span>
                </div>

                {/* Bottom Scrim with Filename */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: isDense ? '10px 4px 4px' : isMedium ? '14px 6px 5px' : '16px 8px 6px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    pointerEvents: 'none'
                  }}
                >
                  <span
                    style={{
                      fontSize: isDense ? '9px' : isMedium ? '10px' : '11px',
                      color: '#f1f5f9',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    {photo.filename}
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
