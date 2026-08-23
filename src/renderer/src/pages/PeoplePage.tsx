import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  Users, UserPlus, Sparkles, Heart, Search, ChevronLeft,
  Edit2, Trash2, GitMerge, RefreshCw, Check, X, Camera,
  Plus, Filter, Loader2, ArrowUpDown, UserCheck, MoreVertical,
  Calendar, Star, CheckSquare, Square
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { getThumbnailUrl, formatDate, formatFileSize } from '../utils/helpers'
import PhotoGrid from '../components/PhotoGrid'
import EmptyState from '../components/EmptyState'
import {
  scanPhotosForFaces, stopScanning, ScanProgress,
  subscribeToFaceScan, setOnPersonFound
} from '../services/FaceScanner'

export interface Person {
  id: number
  name: string
  cover_photo_id: number | null
  created_at?: string
  photo_count?: number
  cover_thumbnail?: string | null
  cover_preview?: string | null
  cover_file_path?: string | null
  cover_face_base64?: string | null
  is_favorite?: number
}

export default function PeoplePage() {
  const { state: photoState, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const [people, setPeople] = useState<Person[]>([])
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [personPhotos, setPersonPhotos] = useState<Photo[]>([])
  const [isLoadingPersonPhotos, setIsLoadingPersonPhotos] = useState(false)
  const [personTab, setPersonTab] = useState<'all' | 'favorites'>('all')

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'photos' | 'name' | 'recent'>('photos')

  // Scan progress
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)

  // Modals & Renaming
  const [namingModalOpen, setNamingModalOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [personNameInput, setPersonNameInput] = useState('')
  const [isInlineEditingName, setIsInlineEditingName] = useState(false)
  const [inlineNameValue, setInlineNameValue] = useState('')

  // Merge suggestions modal
  const [mergeSuggestions, setMergeSuggestions] = useState<any[]>([])
  const [currentMergeIndex, setCurrentMergeIndex] = useState(0)
  const [showMergeModal, setShowMergeModal] = useState(false)

  // Merge with specific person picker modal
  const [showManualMergeModal, setShowManualMergeModal] = useState(false)
  const [targetMergePersonId, setTargetMergePersonId] = useState<number | null>(null)

  // Load people list
  useEffect(() => {
    loadPeople()
  }, [])

  async function loadPeople() {
    try {
      if (window.photoVault?.getPeople) {
        const list = await window.photoVault.getPeople()
        setPeople(list || [])
      }
    } catch (err) {
      console.error('Failed to load people:', err)
    }
  }

  // Subscribe to live face scanning progress
  useEffect(() => {
    setOnPersonFound(() => {
      loadPeople()
    })
    const unsubscribe = subscribeToFaceScan((progress) => {
      setScanProgress(progress)
      if (progress && !progress.isScanning && progress.scannedCount > 0) {
        showToast('Face scanning complete!')
        loadPeople()
      }
    })
    return () => {
      unsubscribe()
      setOnPersonFound(null)
    }
  }, [])

  // Load photos for selected person
  useEffect(() => {
    if (selectedPerson) {
      loadPersonPhotos(selectedPerson.id)
    }
  }, [selectedPerson?.id])

  async function loadPersonPhotos(personId: number) {
    setIsLoadingPersonPhotos(true)
    try {
      if (window.photoVault?.getPhotosByPerson) {
        const photos = await window.photoVault.getPhotosByPerson(personId)
        setPersonPhotos(photos || [])
      }
    } catch (err) {
      console.error('Failed to load person photos:', err)
      setPersonPhotos([])
    } finally {
      setIsLoadingPersonPhotos(false)
    }
  }

  // Handle select person
  const handleSelectPerson = (person: Person) => {
    setSelectedPerson(person)
    setInlineNameValue(person.name)
    setIsInlineEditingName(false)
    setPersonTab('all')
  }

  // Toggle favorite / pinned status
  const handleToggleFavorite = async (person: Person, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    try {
      if (window.photoVault?.togglePersonFavorite) {
        const isFav = await window.photoVault.togglePersonFavorite(person.id)
        setPeople(prev =>
          prev.map(p => (p.id === person.id ? { ...p, is_favorite: isFav ? 1 : 0 } : p))
        )
        if (selectedPerson && selectedPerson.id === person.id) {
          setSelectedPerson(prev => (prev ? { ...prev, is_favorite: isFav ? 1 : 0 } : null))
        }
        showToast(isFav ? `Pinned ${person.name} to Favorites` : `Removed from Favorites`)
      }
    } catch (err) {
      console.error('Failed to toggle favorite:', err)
    }
  }

  // Rename person
  const handleOpenRenameModal = (person: Person, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingPerson(person)
    setPersonNameInput(person.name)
    setNamingModalOpen(true)
  }

  const handleSaveRename = async () => {
    if (!personNameInput.trim()) return
    const trimmed = personNameInput.trim()
    try {
      if (editingPerson) {
        if (window.photoVault?.updatePersonName) {
          await window.photoVault.updatePersonName(editingPerson.id, trimmed)
          showToast(`Renamed to "${trimmed}"`)
          setPeople(prev =>
            prev.map(p => (p.id === editingPerson.id ? { ...p, name: trimmed } : p))
          )
          if (selectedPerson && selectedPerson.id === editingPerson.id) {
            setSelectedPerson(prev => (prev ? { ...prev, name: trimmed } : null))
            setInlineNameValue(trimmed)
          }
        }
      } else {
        if (window.photoVault?.createPerson) {
          await window.photoVault.createPerson(trimmed)
          showToast(`Added "${trimmed}" to People`)
          loadPeople()
        }
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || err}`)
    } finally {
      setNamingModalOpen(false)
      setEditingPerson(null)
      setPersonNameInput('')
    }
  }

  // Inline rename in Person Detail view
  const handleSaveInlineRename = async () => {
    if (!selectedPerson || !inlineNameValue.trim()) {
      setIsInlineEditingName(false)
      return
    }
    const trimmed = inlineNameValue.trim()
    if (trimmed === selectedPerson.name) {
      setIsInlineEditingName(false)
      return
    }
    try {
      if (window.photoVault?.updatePersonName) {
        await window.photoVault.updatePersonName(selectedPerson.id, trimmed)
        showToast(`Renamed to "${trimmed}"`)
        setSelectedPerson(prev => (prev ? { ...prev, name: trimmed } : null))
        setPeople(prev =>
          prev.map(p => (p.id === selectedPerson.id ? { ...p, name: trimmed } : p))
        )
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || err}`)
    } finally {
      setIsInlineEditingName(false)
    }
  }

  // Delete person profile
  const handleDeletePerson = async (person: Person, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    if (confirm(`Remove profile for "${person.name}"? The photos will remain in your library.`)) {
      try {
        if (window.photoVault?.deletePerson) {
          await window.photoVault.deletePerson(person.id)
          showToast(`Removed "${person.name}" profile`)
          setPeople(prev => prev.filter(p => p.id !== person.id))
          if (selectedPerson?.id === person.id) {
            setSelectedPerson(null)
          }
        }
      } catch (err: any) {
        showToast(`Error: ${err?.message || err}`)
      }
    }
  }

  // Face scanning actions
  const handleStartScan = () => {
    scanPhotosForFaces()
    showToast('Scanning library for faces...')
  }

  const handleStopScan = () => {
    stopScanning()
    showToast('Face scanning stopped')
  }

  const handleResetScan = async () => {
    if (
      confirm(
        'This will reset all detected face tags and rescan your library from scratch. Are you sure?'
      )
    ) {
      try {
        if (window.photoVault?.resetFaceScanData) {
          await window.photoVault.resetFaceScanData()
          setPeople([])
          setSelectedPerson(null)
          showToast('Face data reset. Starting fresh scan...')
          handleStartScan()
        }
      } catch (err: any) {
        showToast(`Error resetting faces: ${err?.message || err}`)
      }
    }
  }

  // Merge suggestions flow
  const handleFindMergeSuggestions = async () => {
    showToast('Analyzing faces for duplicates...')
    try {
      if (window.photoVault?.getMergeSuggestions) {
        const suggestions = await window.photoVault.getMergeSuggestions()
        if (!suggestions || suggestions.length === 0) {
          showToast('No duplicate faces detected!')
        } else {
          setMergeSuggestions(suggestions)
          setCurrentMergeIndex(0)
          setShowMergeModal(true)
        }
      }
    } catch (err: any) {
      showToast(`Merge check error: ${err?.message || err}`)
    }
  }

  const handleApproveMerge = async (primaryId: number, secondaryId: number) => {
    try {
      if (window.photoVault?.mergePeople) {
        await window.photoVault.mergePeople(primaryId, secondaryId)
        showToast('Profiles merged successfully!')
        if (currentMergeIndex < mergeSuggestions.length - 1) {
          setCurrentMergeIndex(prev => prev + 1)
        } else {
          setShowMergeModal(false)
          setMergeSuggestions([])
          loadPeople()
        }
      }
    } catch (err: any) {
      showToast(`Merge error: ${err?.message || err}`)
    }
  }

  const handleSkipMerge = () => {
    if (currentMergeIndex < mergeSuggestions.length - 1) {
      setCurrentMergeIndex(prev => prev + 1)
    } else {
      setShowMergeModal(false)
      setMergeSuggestions([])
      loadPeople()
    }
  }

  // Manual merge
  const handleExecuteManualMerge = async () => {
    if (!selectedPerson || !targetMergePersonId) return
    try {
      if (window.photoVault?.mergePeople) {
        await window.photoVault.mergePeople(selectedPerson.id, targetMergePersonId)
        showToast('Profiles merged successfully')
        setShowManualMergeModal(false)
        setTargetMergePersonId(null)
        loadPeople()
        loadPersonPhotos(selectedPerson.id)
      }
    } catch (err: any) {
      showToast(`Merge error: ${err?.message || err}`)
    }
  }

  // Filtered and sorted lists
  const filteredPeople = useMemo(() => {
    let list = people.filter(p => {
      if (!searchQuery.trim()) return true
      return (p.name || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
    })

    list = [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '')
      }
      if (sortBy === 'recent') {
        return (b.id || 0) - (a.id || 0)
      }
      // default: photos count
      return (b.photo_count || 0) - (a.photo_count || 0)
    })

    return list
  }, [people, searchQuery, sortBy])

  const favoritePeople = useMemo(() => {
    return filteredPeople.filter(p => p.is_favorite === 1)
  }, [filteredPeople])

  const displayedPersonPhotos = useMemo(() => {
    if (personTab === 'favorites') {
      return personPhotos.filter(p => p.is_favorite === 1)
    }
    return personPhotos
  }, [personPhotos, personTab])

  // Date span for person detail
  const personDateSpan = useMemo(() => {
    if (personPhotos.length === 0) return ''
    const dates = personPhotos
      .map(p => p.created_at?.split(' ')[0] || p.created_at?.split('T')[0])
      .filter(Boolean)
      .sort()
    if (dates.length === 0) return ''
    const earliest = dates[0]?.split('-')[0]
    const latest = dates[dates.length - 1]?.split('-')[0]
    if (!earliest) return ''
    return earliest === latest ? earliest : `${earliest} – ${latest}`
  }, [personPhotos])

  const totalFacesCount = useMemo(() => {
    return people.reduce((sum, p) => sum + (p.photo_count || 0), 0)
  }, [people])

  // Helper to render avatar image
  const renderAvatar = (person: Person, size = 110, ringColor?: string) => {
    const avatarUrl = person.cover_face_base64
      ? person.cover_face_base64
      : person.cover_thumbnail
        ? getThumbnailUrl(person.cover_thumbnail, person.cover_file_path || undefined)
        : null

    return (
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          overflow: 'hidden',
          backgroundColor: '#1e293b',
          border: ringColor ? `3px solid ${ringColor}` : '2px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={person.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block'
            }}
            loading="lazy"
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: `${Math.round(size * 0.4)}px`,
              fontWeight: 700
            }}
          >
            {(person.name || 'U')[0].toUpperCase()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="photos-page" style={{ padding: '20px 32px', minHeight: '100%' }}>
      {/* ─── Detail View: Person Photos ─────────────────────────────────── */}
      {selectedPerson ? (
        <div>
          {/* Back & Hero Header */}
          <div style={{ marginBottom: '24px' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelectedPerson(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: '16px',
                borderRadius: '8px'
              }}
            >
              <ChevronLeft size={18} /> People & Pets
            </button>

            {/* Apple Photos Style Hero Card */}
            <div
              style={{
                position: 'relative',
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)',
                backdropFilter: 'blur(16px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '24px',
                padding: '28px 32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '24px',
                boxShadow: '0 16px 36px rgba(0, 0, 0, 0.3)'
              }}
            >
              {/* Avatar + Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                {renderAvatar(selectedPerson, 100, selectedPerson.is_favorite === 1 ? '#ec4899' : '#3b82f6')}

                <div>
                  {/* Name Edit / Heading */}
                  {isInlineEditingName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="text"
                        value={inlineNameValue}
                        onChange={(e) => setInlineNameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveInlineRename()
                          if (e.key === 'Escape') setIsInlineEditingName(false)
                        }}
                        autoFocus
                        style={{
                          fontSize: '24px',
                          fontWeight: 800,
                          padding: '4px 12px',
                          borderRadius: '8px',
                          border: '2px solid var(--primary, #3b82f6)',
                          background: 'var(--bg-secondary, #1e293b)',
                          color: 'var(--text-primary, #ffffff)',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleSaveInlineRename}
                        style={{ padding: '6px 12px' }}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setIsInlineEditingName(false)}
                        style={{ padding: '6px 12px' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <h1
                        style={{
                          fontSize: '28px',
                          fontWeight: 800,
                          margin: 0,
                          color: 'var(--text-primary, #ffffff)',
                          letterSpacing: '-0.02em',
                          cursor: 'pointer'
                        }}
                        onClick={() => setIsInlineEditingName(true)}
                        title="Click to rename"
                      >
                        {selectedPerson.name}
                      </h1>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setIsInlineEditingName(true)}
                        style={{ padding: '4px', color: 'var(--text-secondary)' }}
                        title="Rename Person"
                      >
                        <Edit2 size={16} />
                      </button>
                    </div>
                  )}

                  {/* Badges / Metadata */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                    <span
                      style={{
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '3px 10px',
                        borderRadius: '12px'
                      }}
                    >
                      {personPhotos.length} photo{personPhotos.length === 1 ? '' : 's'}
                    </span>
                    {personDateSpan && (
                      <span
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '13px',
                          color: 'var(--text-secondary)',
                          fontWeight: 500
                        }}
                      >
                        <Calendar size={14} /> {personDateSpan}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={(e) => handleToggleFavorite(selectedPerson, e)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '8px 14px',
                    borderRadius: '10px',
                    background: selectedPerson.is_favorite === 1 ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255,255,255,0.05)',
                    color: selectedPerson.is_favorite === 1 ? '#ec4899' : 'var(--text-primary)'
                  }}
                >
                  <Heart
                    size={16}
                    fill={selectedPerson.is_favorite === 1 ? '#ec4899' : 'none'}
                    color={selectedPerson.is_favorite === 1 ? '#ec4899' : 'currentColor'}
                  />
                  {selectedPerson.is_favorite === 1 ? 'Favorited' : 'Favorite'}
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowManualMergeModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '8px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255,255,255,0.05)'
                  }}
                >
                  <GitMerge size={16} /> Merge with...
                </button>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={(e) => handleDeletePerson(selectedPerson, e)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    padding: '8px 14px',
                    borderRadius: '10px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: '#ef4444'
                  }}
                >
                  <Trash2 size={16} /> Remove Profile
                </button>
              </div>
            </div>
          </div>

          {/* Filter Sub-Tabs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '18px',
              borderBottom: '1px solid var(--border)',
              paddingBottom: '12px'
            }}
          >
            <button
              type="button"
              className={`btn ${personTab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPersonTab('all')}
              style={{ fontSize: '13px', padding: '6px 14px', borderRadius: '16px', fontWeight: 600 }}
            >
              All Photos ({personPhotos.length})
            </button>
            <button
              type="button"
              className={`btn ${personTab === 'favorites' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setPersonTab('favorites')}
              style={{
                fontSize: '13px',
                padding: '6px 14px',
                borderRadius: '16px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Heart size={14} fill={personTab === 'favorites' ? 'currentColor' : 'none'} />
              Favorites ({personPhotos.filter(p => p.is_favorite === 1).length})
            </button>
          </div>

          {/* Photos Grid */}
          {isLoadingPersonPhotos ? (
            <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Loader2 size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: 'var(--primary)' }} />
              <p>Loading photos...</p>
            </div>
          ) : displayedPersonPhotos.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <EmptyState
                icon={<Camera size={44} />}
                title={personTab === 'favorites' ? 'No Favorited Photos' : 'No Photos Available'}
                description={personTab === 'favorites' ? `You haven't marked any photos of ${selectedPerson.name} as favorite yet.` : `No photos found for ${selectedPerson.name}.`}
              />
            </div>
          ) : (
            <PhotoGrid photos={displayedPersonPhotos} showDateHeaders={true} />
          )}
        </div>
      ) : (
        /* ─── Main View: All People & Pets (Apple Photos Style) ──────────── */
        <div>
          {/* ── Top Header Bar ────────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
              flexWrap: 'wrap',
              gap: '14px'
            }}
          >
            {/* Title & Count */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  boxShadow: '0 4px 14px rgba(236, 72, 153, 0.35)'
                }}
              >
                <Users size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                    People & Pets
                  </h1>
                  {people.length > 0 && (
                    <span
                      style={{
                        background: 'rgba(236, 72, 153, 0.15)',
                        color: '#f472b6',
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '2px 9px',
                        borderRadius: '12px'
                      }}
                    >
                      {people.length} people • {totalFacesCount} faces
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', width: '220px' }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-secondary)'
                  }}
                />
                <input
                  type="text"
                  placeholder="Search people..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 12px 7px 34px',
                    borderRadius: '20px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Sort selector */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--bg-secondary)',
                  padding: '4px 10px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  fontSize: '12px'
                }}
              >
                <ArrowUpDown size={13} color="var(--text-secondary)" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="photos">Most Photos</option>
                  <option value="name">Name (A–Z)</option>
                  <option value="recent">Recently Added</option>
                </select>
              </div>

              {/* Merge Duplicates Button */}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleFindMergeSuggestions}
                style={{
                  fontSize: '13px',
                  padding: '7px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)'
                }}
                title="Scan for duplicate face clusters to merge"
              >
                <GitMerge size={15} /> Find Duplicates
              </button>

              {/* Add Person Button */}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setEditingPerson(null)
                  setPersonNameInput('')
                  setNamingModalOpen(true)
                }}
                style={{
                  fontSize: '13px',
                  padding: '7px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  borderRadius: '10px',
                  border: '1px solid var(--border)'
                }}
              >
                <UserPlus size={15} /> Add Person
              </button>

              {/* Scan Faces Button */}
              {scanProgress?.isScanning ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleStopScan}
                  style={{ fontSize: '13px', padding: '7px 14px', borderRadius: '10px' }}
                >
                  Stop Scan
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartScan}
                  style={{
                    fontSize: '13px',
                    padding: '7px 16px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                    boxShadow: '0 4px 12px rgba(236, 72, 153, 0.3)'
                  }}
                >
                  <Sparkles size={15} /> Scan Faces
                </button>
              )}
            </div>
          </div>

          {/* ── Live Scanner Progress Banner ──────────────────────────────── */}
          {scanProgress?.isScanning && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                border: '1px solid rgba(236, 72, 153, 0.25)',
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
                    background: 'rgba(236, 72, 153, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ec4899'
                  }}
                >
                  <Loader2 size={18} className="animate-spin" />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Scanning photo library for faces & clustering...
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Scanned {scanProgress.scannedCount} of {scanProgress.totalCount} photos (
                    {scanProgress.totalCount > 0
                      ? Math.round((scanProgress.scannedCount / scanProgress.totalCount) * 100)
                      : 0}
                    %)
                  </div>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={handleStopScan}
                style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px' }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── Content: Empty State or Apple Photos Grids ─────────────────── */}
          {people.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <EmptyState
                icon={<Users size={56} color="#ec4899" />}
                title="No People Identified Yet"
                description="PhotoSort uses on-device, private face detection to automatically group photos of family and friends."
                actionLabel="Scan Library for Faces"
                onAction={handleStartScan}
              />
            </div>
          ) : (
            <div>
              {/* ── Section 1: Favorites / Pinned (Apple Photos Hallmark) ──── */}
              {favoritePeople.length > 0 && (
                <div style={{ marginBottom: '36px' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '16px',
                      fontSize: '13px',
                      fontWeight: 800,
                      color: 'var(--text-secondary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase'
                    }}
                  >
                    <Heart size={14} fill="#ec4899" color="#ec4899" />
                    <span>FAVORITES</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                      ({favoritePeople.length})
                    </span>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                      gap: '20px'
                    }}
                  >
                    {favoritePeople.map((person) => (
                      <div
                        key={person.id}
                        onClick={() => handleSelectPerson(person)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                          padding: '16px 12px',
                          borderRadius: '20px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(236, 72, 153, 0.25)',
                          boxShadow: '0 8px 20px rgba(0, 0, 0, 0.2)',
                          transition: 'transform 0.2s ease, box-shadow 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-4px)'
                          e.currentTarget.style.boxShadow = '0 12px 28px rgba(236, 72, 153, 0.25)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.2)'
                        }}
                      >
                        {/* Pinned Heart Badge */}
                        <div
                          onClick={(e) => handleToggleFavorite(person, e)}
                          title="Unpin from Favorites"
                          style={{
                            position: 'absolute',
                            top: '10px',
                            right: '10px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'rgba(236, 72, 153, 0.2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 2
                          }}
                        >
                          <Heart size={13} fill="#ec4899" color="#ec4899" />
                        </div>

                        {/* Large Avatar */}
                        {renderAvatar(person, 100, '#ec4899')}

                        {/* Label & Count */}
                        <div style={{ textAlign: 'center', marginTop: '12px', width: '100%' }}>
                          <div
                            style={{
                              fontSize: '15px',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {person.name}
                          </div>
                          <div
                            style={{
                              fontSize: '12px',
                              color: 'var(--text-tertiary)',
                              marginTop: '2px',
                              fontWeight: 500
                            }}
                          >
                            {person.photo_count || 0} photos
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Section 2: All People Grid ────────────────────────────── */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px',
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: '8px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '13px',
                      fontWeight: 800,
                      color: 'var(--text-secondary)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase'
                    }}
                  >
                    PEOPLE ({filteredPeople.length})
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={handleResetScan}
                    style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '4px 8px' }}
                    title="Reset face detection embeddings"
                  >
                    <RefreshCw size={12} style={{ marginRight: '4px' }} /> Rescan Library
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                    gap: '16px',
                    marginBottom: '40px'
                  }}
                >
                  {filteredPeople.map((person) => {
                    const isFav = person.is_favorite === 1
                    return (
                      <div
                        key={person.id}
                        onClick={() => handleSelectPerson(person)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                          padding: '14px 10px',
                          borderRadius: '16px',
                          background: 'var(--bg-secondary, #1e293b)',
                          border: isFav ? '1.5px solid rgba(236, 72, 153, 0.4)' : '1px solid var(--border)',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-3px)'
                          e.currentTarget.style.boxShadow = '0 10px 24px rgba(0, 0, 0, 0.3)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      >
                        {/* Quick Action Overlay: Favorite Heart */}
                        <div
                          onClick={(e) => handleToggleFavorite(person, e)}
                          title={isFav ? 'Unpin from Favorites' : 'Pin to Favorites'}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            width: '22px',
                            height: '22px',
                            borderRadius: '50%',
                            background: isFav ? 'rgba(236, 72, 153, 0.25)' : 'rgba(0, 0, 0, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 2,
                            color: isFav ? '#ec4899' : 'rgba(255, 255, 255, 0.6)'
                          }}
                        >
                          <Heart size={12} fill={isFav ? '#ec4899' : 'none'} />
                        </div>

                        {/* Circular Avatar */}
                        {renderAvatar(person, 88)}

                        {/* Person Name */}
                        <div style={{ textAlign: 'center', marginTop: '10px', width: '100%' }}>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {person.name}
                          </div>
                          <div
                            style={{
                              fontSize: '11px',
                              color: 'var(--text-tertiary)',
                              marginTop: '2px',
                              fontWeight: 500
                            }}
                          >
                            {person.photo_count || 0} photos
                          </div>
                        </div>

                        {/* Card Hover Action Buttons */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '8px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                            paddingTop: '6px',
                            width: '100%',
                            justifyContent: 'center'
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={(e) => handleOpenRenameModal(person, e)}
                            style={{ padding: '3px 6px', fontSize: '11px' }}
                            title="Rename Person"
                          >
                            <Edit2 size={11} />
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={(e) => handleDeletePerson(person, e)}
                            style={{ padding: '3px 6px', fontSize: '11px', color: '#ef4444' }}
                            title="Delete Profile"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Modal 1: Add / Rename Person Modal ───────────────────────────── */}
      {namingModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setNamingModalOpen(false)}
        >
          <div
            style={{
              width: '380px',
              maxWidth: '90vw',
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              padding: '24px',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
              color: 'var(--text-primary)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800 }}>
              {editingPerson ? 'Rename Person' : 'Add New Person'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
              {editingPerson
                ? `Enter a new name for "${editingPerson.name}":`
                : 'Enter a name to create a new person profile:'}
            </p>

            <input
              type="text"
              value={personNameInput}
              onChange={(e) => setPersonNameInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
              placeholder="e.g. Sarah, Dad, Alex, Mom"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-tertiary, #0f172a)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                marginBottom: '20px',
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setNamingModalOpen(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveRename}
                disabled={!personNameInput.trim()}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Merge Suggestions Flow (Apple Photos Style) ─────────── */}
      {showMergeModal && mergeSuggestions.length > 0 && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              width: '560px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              borderRadius: '24px',
              border: '1px solid var(--border)',
              padding: '28px',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
              color: 'var(--text-primary)'
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitMerge size={20} color="#ec4899" />
                <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                  Merge Suggestions ({currentMergeIndex + 1} of {mergeSuggestions.length})
                </h3>
              </div>
              <span
                style={{
                  background: 'rgba(34, 197, 94, 0.15)',
                  color: '#22c55e',
                  fontSize: '12px',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: '12px'
                }}
              >
                {mergeSuggestions[currentMergeIndex]?.confidence || 85}% Match
              </span>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
              These two people profiles have very similar facial features. Are they the same person?
            </p>

            {/* Side by Side Comparison */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '28px',
                background: 'var(--bg-tertiary, #0f172a)',
                padding: '20px',
                borderRadius: '16px'
              }}
            >
              {/* Person A */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                {renderAvatar(mergeSuggestions[currentMergeIndex].personA, 90)}
                <div style={{ textAlign: 'center' }}>
                  <strong style={{ fontSize: '15px' }}>{mergeSuggestions[currentMergeIndex].personA.name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {mergeSuggestions[currentMergeIndex].personA.photo_count || 0} photos
                  </div>
                </div>
              </div>

              {/* Merge Arrow Icon */}
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)'
                }}
              >
                <GitMerge size={18} />
              </div>

              {/* Person B */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                {renderAvatar(mergeSuggestions[currentMergeIndex].personB, 90)}
                <div style={{ textAlign: 'center' }}>
                  <strong style={{ fontSize: '15px' }}>{mergeSuggestions[currentMergeIndex].personB.name}</strong>
                  <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                    {mergeSuggestions[currentMergeIndex].personB.photo_count || 0} photos
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowMergeModal(false)
                  setMergeSuggestions([])
                  loadPeople()
                }}
                style={{ fontSize: '13px' }}
              >
                Cancel
              </button>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSkipMerge}
                  style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '8px' }}
                >
                  Not Same / Skip
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    handleApproveMerge(
                      mergeSuggestions[currentMergeIndex].personA.id,
                      mergeSuggestions[currentMergeIndex].personB.id
                    )
                  }
                  style={{
                    fontSize: '13px',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)'
                  }}
                >
                  Yes, Merge Profiles
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 3: Manual Merge Picker Modal ──────────────────────────── */}
      {showManualMergeModal && selectedPerson && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setShowManualMergeModal(false)}
        >
          <div
            style={{
              width: '440px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              padding: '24px',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
              color: 'var(--text-primary)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 800 }}>
              Merge "{selectedPerson.name}" into Another Profile
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
              Select which person to merge with. All photos will be grouped together.
            </p>

            <div
              style={{
                maxHeight: '260px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                marginBottom: '20px'
              }}
            >
              {people
                .filter(p => p.id !== selectedPerson.id)
                .map(p => {
                  const isSelected = targetMergePersonId === p.id
                  return (
                    <div
                      key={p.id}
                      onClick={() => setTargetMergePersonId(p.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        background: isSelected ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-tertiary, #0f172a)',
                        border: isSelected ? '1.5px solid var(--primary, #3b82f6)' : '1px solid var(--border)',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {renderAvatar(p, 40)}
                        <div>
                          <strong style={{ fontSize: '14px' }}>{p.name}</strong>
                          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {p.photo_count || 0} photos
                          </div>
                        </div>
                      </div>
                      {isSelected && <Check size={16} color="var(--primary)" />}
                    </div>
                  )
                })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowManualMergeModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleExecuteManualMerge}
                disabled={!targetMergePersonId}
                style={{
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)'
                }}
              >
                Merge Profiles
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
