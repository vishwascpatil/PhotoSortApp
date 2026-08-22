import React, { useState, useMemo, useEffect } from 'react'
import {
  Flame, MessageSquare, Film, ImageIcon, CheckSquare,
  Square, Trash2, RefreshCw, CheckCircle2,
  Play, Check, AlertCircle, Sparkles, ShieldCheck
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import EmptyState from '../components/EmptyState'
import { formatFileSize, getThumbnailUrl, isVideoFile } from '../utils/helpers'
import { detectJunk, JunkCategory, JunkDetection } from '../utils/junkDetector'

export default function JunkPage() {
  const { state: photoState, dispatch: photoDispatch, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const [activeTab, setActiveTab] = useState<JunkCategory>('all')
  const [mediaTypeFilter, setMediaTypeFilter] = useState<'all' | 'video' | 'image'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [classifiedMap, setClassifiedMap] = useState<Map<number, JunkDetection>>(new Map())

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

  // Classify photos using fast heuristic + background IPC
  useEffect(() => {
    const map = new Map<number, JunkDetection>()
    for (const photo of photoState.photos) {
      map.set(photo.id, detectJunk(photo))
    }
    setClassifiedMap(map)
  }, [photoState.photos])

  // Filter junk items
  const junkCandidates = useMemo(() => {
    return photoState.photos.filter((p) => {
      const info = classifiedMap.get(p.id) || detectJunk(p)
      if (info.classification === 'keep') return false

      const isVid = isVideoFile(p.file_path)
      if (mediaTypeFilter === 'video' && !isVid) return false
      if (mediaTypeFilter === 'image' && isVid) return false

      if (activeTab === 'all') return true
      if (activeTab === 'high-confidence') return info.classification === 'junk'
      if (activeTab === 'uncertain') return info.classification === 'uncertain'
      if (activeTab === 'whatsapp') return info.category === 'whatsapp'
      if (activeTab === 'stickers') return info.category === 'sticker'
      if (activeTab === 'telegram') return info.category === 'telegram'
      if (activeTab === 'facebook') return info.category === 'facebook'
      return true
    })
  }, [photoState.photos, classifiedMap, activeTab, mediaTypeFilter])

  // Aggregate stats
  const totalBytes = useMemo(() => {
    return junkCandidates.reduce((acc, p) => acc + (p.file_size || 0), 0)
  }, [junkCandidates])

  const selectedPhotos = useMemo(() => {
    return junkCandidates.filter(p => selectedIds.has(p.id))
  }, [junkCandidates, selectedIds])

  const selectedBytes = useMemo(() => {
    return selectedPhotos.reduce((acc, p) => acc + (p.file_size || 0), 0)
  }, [selectedPhotos])

  // Tab counts
  const tabCounts = useMemo(() => {
    let highConf = 0
    let uncertain = 0
    let whatsapp = 0
    let stickers = 0
    let telegram = 0
    let facebook = 0

    for (const p of photoState.photos) {
      const info = classifiedMap.get(p.id) || detectJunk(p)
      if (info.classification === 'keep') continue

      if (info.classification === 'junk') highConf++
      if (info.classification === 'uncertain') uncertain++
      if (info.category === 'whatsapp') whatsapp++
      if (info.category === 'sticker') stickers++
      if (info.category === 'telegram') telegram++
      if (info.category === 'facebook') facebook++
    }

    return {
      all: highConf + uncertain,
      highConf,
      uncertain,
      whatsapp,
      stickers,
      telegram,
      facebook
    }
  }, [photoState.photos, classifiedMap])

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
    if (selectedIds.size === junkCandidates.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(junkCandidates.map(p => p.id)))
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
    if (!confirm(`Move ${count} junk items (${formatFileSize(selectedBytes)}) to Trash?`)) return

    try {
      if (window.photoVault?.trash) {
        await window.photoVault.trash(ids)
        photoDispatch({ type: 'REMOVE_PHOTOS', payload: ids })
        setSelectedIds(new Set())
        showToast(`Moved ${count} junk items to Trash`)
        refreshPhotos()
      }
    } catch (err) {
      console.error('Failed to trash junk items:', err)
      showToast('Failed to move items to Trash')
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
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 3px 10px rgba(239, 68, 68, 0.25)'
            }}
          >
            <Flame size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                Junk Media
              </h1>
              {junkCandidates.length > 0 && (
                <span
                  style={{
                    background: 'rgba(239, 68, 68, 0.12)',
                    color: '#ef4444',
                    fontWeight: 700,
                    fontSize: '12px',
                    padding: '2px 8px',
                    borderRadius: '12px'
                  }}
                >
                  {junkCandidates.length} items • {formatFileSize(totalBytes)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          )}

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { refreshPhotos(); showToast('Scanned library refreshed!') }}
            title="Rescan"
            style={{ display: 'flex', alignItems: 'center', padding: '6px 10px' }}
          >
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

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
        {/* Category Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('all')}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '16px', fontWeight: activeTab === 'all' ? 700 : 500 }}
          >
            All Junk ({tabCounts.all})
          </button>

          <button
            type="button"
            className={`btn ${activeTab === 'high-confidence' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('high-confidence')}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '16px', fontWeight: activeTab === 'high-confidence' ? 700 : 500 }}
          >
            High Confidence ({tabCounts.highConf})
          </button>

          <button
            type="button"
            className={`btn ${activeTab === 'uncertain' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('uncertain')}
            style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '16px', fontWeight: activeTab === 'uncertain' ? 700 : 500 }}
          >
            Review Queue ({tabCounts.uncertain})
          </button>

          {tabCounts.whatsapp > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'whatsapp' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('whatsapp')}
              style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '16px', fontWeight: activeTab === 'whatsapp' ? 700 : 500 }}
            >
              WhatsApp ({tabCounts.whatsapp})
            </button>
          )}

          {tabCounts.stickers > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'stickers' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('stickers')}
              style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '16px', fontWeight: activeTab === 'stickers' ? 700 : 500 }}
            >
              Stickers ({tabCounts.stickers})
            </button>
          )}

          {tabCounts.telegram > 0 && (
            <button
              type="button"
              className={`btn ${activeTab === 'telegram' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('telegram')}
              style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '16px', fontWeight: activeTab === 'telegram' ? 700 : 500 }}
            >
              Telegram ({tabCounts.telegram})
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

          {junkCandidates.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleSelectAll}
              style={{ fontSize: '12px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              {selectedIds.size === junkCandidates.length ? (
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
      {junkCandidates.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={48} />}
          title="No Junk Media Found"
          description="Your library is free of forwarded messaging junk and meme clutter."
          actionLabel="View All Photos"
          onAction={() => photoDispatch({ type: 'SET_VIEW', payload: 'photos' })}
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
          {junkCandidates.map((photo) => {
            const isSelected = selectedIds.has(photo.id)
            const isVid = isVideoFile(photo.file_path)
            const info = classifiedMap.get(photo.id) || detectJunk(photo)
            const isSticker = info.category === 'sticker'
            const isHighConfidence = info.classification === 'junk'

            return (
              <div
                key={photo.id}
                onClick={() => handleTileClick(photo)}
                title={`${photo.filename}\nScore: ${info.score}%\n${info.reason}`}
                style={{
                  background: '#0b0f19',
                  border: isSelected ? '2.5px solid #ef4444' : '1px solid var(--border)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  boxShadow: isSelected ? '0 4px 18px rgba(239, 68, 68, 0.3)' : 'none'
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
                    background: isSelected ? '#ef4444' : 'rgba(0, 0, 0, 0.45)',
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

                {/* Classification / Category Pill */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    background: isHighConfidence
                      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                      : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '10px',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                    letterSpacing: '0.02em',
                    textTransform: 'uppercase'
                  }}
                >
                  {isSticker ? 'Sticker' : `${info.score}% Junk`}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
