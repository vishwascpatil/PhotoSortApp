import React, { useState, useMemo, useEffect } from 'react'
import {
  FileText, Search, RefreshCw, CheckSquare, Square,
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
  const { showToast } = useApp()

  const [activeCategory, setActiveCategory] = useState<string>('All Documents')
  const [searchQuery, setSearchQuery] = useState<string>('')
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

      // Search query filter (matches filename, extracted text, or category)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchName = (p.filename || '').toLowerCase().includes(q)
        const matchCat = (p.document_category || '').toLowerCase().includes(q)
        const matchText = (p.extracted_text || '').toLowerCase().includes(q)
        if (!matchName && !matchCat && !matchText) return false
      }

      return true
    })
  }, [photoState.photos, activeCategory, searchQuery])

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
    photoDispatch({ type: 'SET_VIEWER', payload: photo.id })
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 3px 10px rgba(59, 130, 246, 0.25)'
            }}
          >
            <FileText size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Documents
              </h1>
              {documentPhotos.length > 0 && (
                <span
                  style={{
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: '#2563eb',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '12px'
                  }}
                >
                  {documentPhotos.length} documents • {formatFileSize(totalBytes)}
                </span>
              )}
            </div>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
              165 verified document types across 11 categories • Anti-meme precision filtering
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Search in Documents */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '12px'
              }}
            />
          </div>

          {selectedPhotos.length > 0 && (
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
          )}

          {/* Clean False Positives Button */}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleCleanFalsePositives}
            disabled={isCleaning || isScanning}
            title="Purge noise, memes, OTPs and verify real documents"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '6px 12px',
              border: '1px solid var(--border)',
              borderRadius: '8px'
            }}
          >
            {isCleaning ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
            {isCleaning ? 'Cleaning...' : 'Clean False Positives'}
          </button>

          {/* Scan Documents Button */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunDocumentScan}
            disabled={isScanning || isCleaning}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
            }}
          >
            {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {isScanning ? (scanProgress ? `Scanning ${scanProgress.percent}%` : 'Scanning...') : 'Scan Documents'}
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { refreshPhotos(); showToast('Documents refreshed!') }}
            title="Refresh"
            style={{ display: 'flex', alignItems: 'center', padding: '6px 10px' }}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* ─── Live Progressive Scan Banner (0% to 100%) ─────────────────── */}
      {scanProgress && (
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
                {scanProgress.status || (scanProgress.isComplete
                  ? `Scan Complete! Analyzed all ${scanProgress.total.toLocaleString()} items (${scanProgress.docsFound} verified documents found)`
                  : `Analyzing library media for documents...`)}
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

          {/* Progress Track & Fill Bar */}
          <div
            style={{
              width: '100%',
              height: '6px',
              borderRadius: '3px',
              background: 'rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              marginBottom: '8px'
            }}
          >
            <div
              style={{
                width: `${scanProgress.percent}%`,
                height: '100%',
                background: scanProgress.isComplete
                  ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(90deg, #3b82f6 0%, #6366f1 100%)',
                borderRadius: '3px',
                transition: 'width 0.15s ease-out'
              }}
            />
          </div>

          {/* Bottom Subtitle with Current File & Cancel */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%' }}>
              {scanProgress.currentFile}
            </span>
            {!scanProgress.isComplete && (
              <button
                type="button"
                onClick={handleStopScan}
                className="btn btn-ghost"
                style={{ fontSize: '11px', padding: '2px 8px', color: '#ef4444', fontWeight: 600 }}
              >
                Stop Scan
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Category Filter Pills Bar ───────────────────────────────────── */}
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
            if (cat !== 'All Documents' && count === 0) return null
            const isActive = activeCategory === cat
            const icon = CATEGORY_ICONS[cat] || <FileText size={13} />

            return (
              <button
                key={cat}
                type="button"
                className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveCategory(cat)}
                style={{
                  fontSize: '12px',
                  padding: '5px 12px',
                  borderRadius: '16px',
                  fontWeight: isActive ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
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
            className="btn btn-ghost"
            onClick={handleSelectAll}
            style={{ fontSize: '12px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            {selectedIds.size === documentPhotos.length ? (
              <CheckSquare size={15} color="var(--primary)" />
            ) : (
              <Square size={15} />
            )}
            {selectedIds.size > 0 ? `${selectedIds.size} Selected` : 'Select All'}
          </button>
        )}
      </div>

      {/* ─── Media-First Documents Grid ──────────────────────────────────── */}
      {documentPhotos.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={48} />}
          title="No Documents Found"
          description={searchQuery ? 'No documents match your search query.' : 'Click "Scan Documents" to run intelligent 165-type precision document OCR on your photo library.'}
          actionLabel={searchQuery ? 'Clear Search' : 'Scan Library for Documents'}
          onAction={searchQuery ? () => setSearchQuery('') : handleRunDocumentScan}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: '12px',
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
                  borderRadius: '12px',
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
                    top: '8px',
                    left: '8px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '6px',
                    background: isSelected ? '#3b82f6' : 'rgba(0, 0, 0, 0.45)',
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

                {/* Category Badge Overlaid */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '3px 8px',
                    borderRadius: '10px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    letterSpacing: '0.02em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {CATEGORY_ICONS[catLabel] || <FileText size={10} />}
                  <span>{catLabel}</span>
                </div>

                {/* Bottom Scrim with Filename */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    padding: '16px 8px 6px',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    pointerEvents: 'none'
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
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
