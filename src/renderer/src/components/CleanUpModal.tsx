import React, { useMemo, useEffect, useState } from 'react'
import {
  Sparkles, HardDrive, Share2, Monitor, Copy, X, ArrowRight,
  ShieldCheck, Check, Trash2, Zap, Film
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { formatFileSize, isVideoFile } from '../utils/helpers'
import { detectJunk } from '../utils/junkDetector'
import { detectScreenshot } from '../utils/screenshotDetector'

interface CleanUpModalProps {
  isOpen: boolean
  onClose: () => void
  importedCount?: number
}

export default function CleanUpModal({ isOpen, onClose, importedCount }: CleanUpModalProps) {
  const { state: photoState } = usePhotos()
  const { navigateTo } = useApp()

  const [allPhotos, setAllPhotos] = useState<Photo[]>(photoState.photos || [])
  const [duplicatesStats, setDuplicatesStats] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 })
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false)

  // Ensure full library is available for accurate analysis even if active view is filtered
  useEffect(() => {
    if (!isOpen) return
    let isMounted = true
    async function fetchAllPhotos() {
      if (photoState.photos && photoState.photos.length > 0 && !photoState.activeFilter?.isTrashed) {
        setAllPhotos(photoState.photos)
      }
      try {
        if (window.photoVault?.getPhotos) {
          const fetched = await window.photoVault.getPhotos({})
          if (isMounted && fetched && fetched.length > 0) {
            setAllPhotos(fetched)
          }
        }
      } catch (err) {
        console.error('Failed to load all photos for cleanup modal:', err)
      }
    }
    fetchAllPhotos()
    return () => {
      isMounted = false
    }
  }, [isOpen, photoState.photos, photoState.activeFilter])

  // Fast pre-calculation of exact duplicates from photo metadata (instant feedback)
  const fastDuplicateStats = useMemo(() => {
    const photos = allPhotos.length > 0 ? allPhotos : (photoState.photos || [])
    if (photos.length === 0) return { count: 0, bytes: 0 }

    const groups = new Map<string, Photo[]>()
    for (const p of photos) {
      const size = p.file_size || 0
      if (size <= 0) continue

      let key = ''
      if (p.perceptual_hash && p.perceptual_hash.length === 64 && p.perceptual_hash !== '0'.repeat(64)) {
        key = `hash_${p.perceptual_hash}`
      } else if (p.width && p.height) {
        key = `dim_${size}_${p.width}_${p.height}`
      } else {
        key = `size_${size}`
      }

      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(p)
    }

    let count = 0
    let bytes = 0
    for (const group of groups.values()) {
      if (group.length > 1) {
        const sorted = [...group].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))
        const redundant = sorted.slice(1)
        count += redundant.length
        bytes += redundant.reduce((sum, p) => sum + (p.file_size || 0), 0)
      }
    }

    return { count, bytes }
  }, [allPhotos, photoState.photos])

  // Fetch comprehensive duplicates and similar shots asynchronously via IPC
  useEffect(() => {
    if (!isOpen) return
    let isMounted = true
    async function loadDuplicates() {
      setIsLoadingDuplicates(true)
      try {
        if (window.photoVault?.getUtilitiesData) {
          const data = await window.photoVault.getUtilitiesData()
          if (!isMounted) return

          let count = 0
          let bytes = 0

          // 1. Process duplicateGroups (orchestrator results) if available
          if (Array.isArray(data.duplicateGroups) && data.duplicateGroups.length > 0) {
            for (const g of data.duplicateGroups) {
              if (g.items && g.items.length > 1) {
                count += g.items.length - 1
                if (typeof g.recoverableBytes === 'number' && g.recoverableBytes > 0) {
                  bytes += g.recoverableBytes
                } else {
                  const sorted = [...g.items].sort((a, b) => (b.fileSize || b.file_size || 0) - (a.fileSize || a.file_size || 0))
                  bytes += sorted.slice(1).reduce((acc, p) => acc + (p.fileSize || p.file_size || 0), 0)
                }
              }
            }
          }

          // 2. Process both exact duplicates AND similar photos
          if (count === 0) {
            const allGroups: Photo[][] = [
              ...(Array.isArray(data.duplicates) ? data.duplicates : []),
              ...(Array.isArray(data.similar) ? data.similar : [])
            ]
            for (const group of allGroups) {
              if (group.length > 1) {
                const sorted = [...group].sort((a, b) => (b.file_size || 0) - (a.file_size || 0))
                const redundant = sorted.slice(1)
                count += redundant.length
                bytes += redundant.reduce((acc, p) => acc + (p.file_size || 0), 0)
              }
            }
          }

          // Set authoritative stats or keep fast exact duplicate stats
          if (count > 0) {
            setDuplicatesStats({ count, bytes })
          } else if (fastDuplicateStats.count > 0) {
            setDuplicatesStats(fastDuplicateStats)
          }
        }
      } catch (err) {
        console.error('Failed to load duplicate stats:', err)
        if (fastDuplicateStats.count > 0) {
          setDuplicatesStats(fastDuplicateStats)
        }
      } finally {
        if (isMounted) setIsLoadingDuplicates(false)
      }
    }
    loadDuplicates()
    return () => {
      isMounted = false
    }
  }, [isOpen, fastDuplicateStats])

  const effectiveDuplicates = useMemo(() => {
    if (duplicatesStats.count > 0) return duplicatesStats
    if (fastDuplicateStats.count > 0) return fastDuplicateStats
    return { count: 0, bytes: 0 }
  }, [duplicatesStats, fastDuplicateStats])

  // Calculate clean-up suggestions from photos in library
  const cleanUpStats = useMemo(() => {
    const photos = allPhotos.length > 0 ? allPhotos : (photoState.photos || [])
    let largeCount = 0
    let largeBytes = 0
    let junkCount = 0
    let junkBytes = 0
    let screenshotCount = 0
    let screenshotBytes = 0

    const LARGE_THRESHOLD = 25 * 1024 * 1024 // 25 MB

    for (const p of photos) {
      const size = p.file_size || 0

      // Large Files (Videos or files >= 25 MB)
      if (size >= LARGE_THRESHOLD || (isVideoFile(p.file_path) && size >= 15 * 1024 * 1024)) {
        largeCount++
        largeBytes += size
      }

      // Social Media / WhatsApp
      const junk = detectJunk(p)
      if (junk.classification !== 'keep' || junk.isAppMedia || (junk as any).isJunk) {
        junkCount++
        junkBytes += size
      }

      // Screenshots
      const shot = detectScreenshot(p)
      if (shot.isScreenshot) {
        screenshotCount++
        screenshotBytes += size
      }
    }

    const totalRecoverableBytes = largeBytes + junkBytes + screenshotBytes + effectiveDuplicates.bytes
    const totalItems = largeCount + junkCount + screenshotCount + effectiveDuplicates.count

    return {
      large: { count: largeCount, bytes: largeBytes },
      junk: { count: junkCount, bytes: junkBytes },
      screenshots: { count: screenshotCount, bytes: screenshotBytes },
      duplicates: effectiveDuplicates,
      totalRecoverableBytes,
      totalItems
    }
  }, [allPhotos, photoState.photos, effectiveDuplicates])

  if (!isOpen) return null

  const handleNavigate = (view: any) => {
    onClose()
    navigateTo(view)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--bg-scrim, rgba(0, 0, 0, 0.65))',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '740px',
          maxWidth: '95vw',
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-elevated, #ffffff)',
          borderRadius: '24px',
          border: '1px solid var(--border)',
          padding: '30px 34px',
          boxShadow: 'var(--shadow-xl, 0 28px 64px rgba(0, 0, 0, 0.35))',
          color: 'var(--text-primary)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflowY: 'auto'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 16px rgba(59, 130, 246, 0.35)'
              }}
            >
              <Sparkles size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  {importedCount ? `Import Complete — Free Up Space` : `Clean Up Suggestions`}
                </h2>
                {importedCount ? (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '10px',
                      background: 'rgba(59, 130, 246, 0.12)',
                      color: 'var(--accent, #2563eb)'
                    }}
                  >
                    +{importedCount} Imported
                  </span>
                ) : null}
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Like Google Photos, PhotoSort analyzed your library to help you identify clutter and reclaim storage.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Close modal"
            style={{
              padding: '6px',
              borderRadius: '50%',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Hero Space Savings Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(139, 92, 246, 0.08) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.22)',
            borderRadius: '18px',
            padding: '16px 20px',
            marginBottom: '22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px'
          }}
        >
          <div>
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--accent, #3b82f6)' }}>
              Potential Reclaimable Storage
            </div>
            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--text-primary)', marginTop: '2px' }}>
              {isLoadingDuplicates && cleanUpStats.duplicates.count === 0 ? (
                <>
                  {formatFileSize(cleanUpStats.totalRecoverableBytes)}
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                    (+ analyzing duplicates...)
                  </span>
                </>
              ) : (
                <>
                  {formatFileSize(cleanUpStats.totalRecoverableBytes)}
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)', marginLeft: '8px' }}>
                    across {cleanUpStats.totalItems} clean-up candidates
                  </span>
                </>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(34, 197, 94, 0.12)',
              border: '1px solid rgba(34, 197, 94, 0.28)',
              color: '#16a34a',
              padding: '6px 12px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 700
            }}
          >
            <ShieldCheck size={16} /> 100% Safe Review
          </div>
        </div>

        {/* 4 Category Cards (Google Photos Style) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))',
            gap: '14px',
            marginBottom: '24px'
          }}
        >
          {/* 1. Large Files & Videos */}
          <div
            onClick={() => handleNavigate('large-files')}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '18px',
              padding: '18px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#8b5cf6'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = 'var(--shadow-md)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(139, 92, 246, 0.15)',
                    color: '#8b5cf6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <HardDrive size={20} />
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '10px',
                    background: 'rgba(139, 92, 246, 0.14)',
                    color: '#8b5cf6',
                    border: '1px solid rgba(139, 92, 246, 0.25)'
                  }}
                >
                  {formatFileSize(cleanUpStats.large.bytes)}
                </span>
              </div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Large Videos & Photos</h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {cleanUpStats.large.count} media files taking up significant space (&gt;25MB).
              </p>
            </div>
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#8b5cf6'
              }}
            >
              Review Large Files <ArrowRight size={14} />
            </div>
          </div>

          {/* 2. WhatsApp & Social Media Junk */}
          <div
            onClick={() => handleNavigate('junk')}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '18px',
              padding: '18px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#10b981'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = 'var(--shadow-md)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Share2 size={20} />
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.14)',
                    color: '#059669',
                    border: '1px solid rgba(16, 185, 129, 0.25)'
                  }}
                >
                  {formatFileSize(cleanUpStats.junk.bytes)}
                </span>
              </div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>WhatsApp & Social Media</h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {cleanUpStats.junk.count} forwarded memes, stickers, and status clips.
              </p>
            </div>
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#059669'
              }}
            >
              Review Social Media <ArrowRight size={14} />
            </div>
          </div>

          {/* 3. Screenshots */}
          <div
            onClick={() => handleNavigate('screenshots')}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '18px',
              padding: '18px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#f59e0b'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = 'var(--shadow-md)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Monitor size={20} />
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '10px',
                    background: 'rgba(245, 158, 11, 0.14)',
                    color: '#d97706',
                    border: '1px solid rgba(245, 158, 11, 0.25)'
                  }}
                >
                  {formatFileSize(cleanUpStats.screenshots.bytes)}
                </span>
              </div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Screenshots & Screen Grabs</h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {cleanUpStats.screenshots.count} captured device and desktop screenshots.
              </p>
            </div>
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#d97706'
              }}
            >
              Review Screenshots <ArrowRight size={14} />
            </div>
          </div>

          {/* 4. Duplicates & Similar */}
          <div
            onClick={() => handleNavigate('duplicates')}
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: '18px',
              padding: '18px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = '#3b82f6'
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = 'var(--shadow-md)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#3b82f6',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Copy size={20} />
                </div>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: '10px',
                    background: 'rgba(59, 130, 246, 0.14)',
                    color: '#2563eb',
                    border: '1px solid rgba(59, 130, 246, 0.25)'
                  }}
                >
                  {isLoadingDuplicates && cleanUpStats.duplicates.count === 0
                    ? 'Scanning...'
                    : formatFileSize(cleanUpStats.duplicates.bytes)}
                </span>
              </div>
              <h4 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Duplicate & Similar Shots</h4>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                {isLoadingDuplicates && cleanUpStats.duplicates.count === 0
                  ? 'Analyzing library for duplicate and similar captures...'
                  : `${cleanUpStats.duplicates.count} redundant copies and burst captures.`}
              </p>
            </div>
            <div
              style={{
                marginTop: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#2563eb'
              }}
            >
              Review Duplicates <ArrowRight size={14} />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid var(--border)',
            paddingTop: '18px',
            flexWrap: 'wrap',
            gap: '12px'
          }}
        >
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            All deletion actions require your explicit confirmation in each tool.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              style={{
                fontSize: '13px',
                padding: '8px 18px',
                borderRadius: '10px',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                cursor: 'pointer'
              }}
            >
              Skip to Photos
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleNavigate('large-files')}
              style={{
                fontSize: '13px',
                fontWeight: 700,
                padding: '9px 20px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Start Clean Up <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
