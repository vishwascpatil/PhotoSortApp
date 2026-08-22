import React, { useState, useMemo, useEffect } from 'react'
import {
  FileText, Search, RefreshCw, CheckSquare, Square,
  Trash2, ShieldCheck, Loader2, Check, Sparkles, Filter,
  Eye, Download, AlertCircle, CheckCircle2
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import EmptyState from '../components/EmptyState'
import { formatFileSize, formatDate, getThumbnailUrl } from '../utils/helpers'

const DOC_CATEGORIES = [
  'All Documents',
  'Government & Identity',
  'Banking & Finance',
  'Medical',
  'Education',
  'Employment',
  'Property',
  'Utility Bills',
  'Business & Commerce',
  'Legal',
  'Travel',
  'Unknown / Other'
]

export default function DocumentsPage() {
  const { state: photoState, dispatch: photoDispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const [activeCategory, setActiveCategory] = useState<string>('All Documents')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ completed: number; total: number } | null>(null)

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

  // Filter documents
  const documentPhotos = useMemo(() => {
    return photoState.photos.filter((p) => {
      const isDoc =
        p.is_document === 1 ||
        (p.mime_type && (p.mime_type.includes('pdf') || p.mime_type.includes('text') || p.mime_type.includes('document'))) ||
        (p.filename && (
          p.filename.toLowerCase().includes('doc') ||
          p.filename.toLowerCase().includes('scan') ||
          p.filename.toLowerCase().includes('receipt') ||
          p.filename.toLowerCase().includes('aadhaar') ||
          p.filename.toLowerCase().includes('aadhar') ||
          p.filename.toLowerCase().includes('adhar') ||
          p.filename.toLowerCase().includes('pan_card') ||
          p.filename.toLowerCase().includes('pancard') ||
          p.filename.toLowerCase().includes('passport') ||
          p.filename.toLowerCase().includes('license') ||
          p.filename.toLowerCase().includes('invoice') ||
          p.filename.toLowerCase().includes('bill')
        ))

      if (!isDoc) return false

      // Category filter
      if (activeCategory !== 'All Documents') {
        const cat = p.document_category || 'Unknown / Other'
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
        (p.mime_type && (p.mime_type.includes('pdf') || p.mime_type.includes('text') || p.mime_type.includes('document'))) ||
        (p.filename && (
          p.filename.toLowerCase().includes('doc') ||
          p.filename.toLowerCase().includes('scan') ||
          p.filename.toLowerCase().includes('receipt') ||
          p.filename.toLowerCase().includes('aadhaar') ||
          p.filename.toLowerCase().includes('aadhar') ||
          p.filename.toLowerCase().includes('adhar') ||
          p.filename.toLowerCase().includes('pan') ||
          p.filename.toLowerCase().includes('invoice')
        ))

      if (isDoc) {
        counts['All Documents']++
        const cat = p.document_category || 'Unknown / Other'
        counts[cat] = (counts[cat] || 0) + 1
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

  // Scan library for documents using the new backend detection module
  const handleRunDocumentScan = async () => {
    if (isScanning) return
    setIsScanning(true)
    setScanProgress({ completed: 0, total: photoState.photos.length })

    try {
      if (window.photoVault?.detectDocumentBatch) {
        const filePaths = photoState.photos.map(p => p.file_path)
        const results = await window.photoVault.detectDocumentBatch(filePaths)

        // Update database with classification results
        for (const res of results) {
          const photo = photoState.photos.find(p => p.file_path === res.filePath)
          if (photo && res.classification !== 'not_a_document') {
            await window.photoVault.saveDocumentScan(
              photo.id,
              res.extractedText || '',
              true,
              res.category || res.classification
            )
          }
        }

        showToast(`Document scan complete! Identified ${results.filter(r => r.classification !== 'not_a_document').length} documents.`)
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
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Search in Documents */}
          <div style={{ position: 'relative', width: '220px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search in text/type..."
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

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRunDocumentScan}
            disabled={isScanning}
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
            {isScanning ? 'Scanning...' : 'Scan Documents'}
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

            return (
              <button
                key={cat}
                type="button"
                className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveCategory(cat)}
                style={{
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: '16px',
                  fontWeight: isActive ? 700 : 500
                }}
              >
                {cat} ({count})
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
          description={searchQuery ? 'No documents match your search query.' : 'Click "Scan Documents" to run intelligent OCR & ID card detection on your photo library.'}
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

                {/* Category Pill Overlaid */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '10px',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    letterSpacing: '0.02em'
                  }}
                >
                  {catLabel}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
