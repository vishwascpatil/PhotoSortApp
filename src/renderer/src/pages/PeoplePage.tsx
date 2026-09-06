import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  Users, UserPlus, Sparkles, Heart, Search, ChevronLeft,
  Edit2, Trash2, GitMerge, RefreshCw, Check, X, Camera,
  Plus, Filter, Loader2, ArrowUpDown, UserCheck, MoreVertical,
  Calendar, Star, CheckSquare, Square, UserMinus, Zap, CheckCheck,
  ShieldCheck, AlertCircle, Eye
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

export interface MergeSuggestionItem {
  personA: Person
  personB: Person
  confidence: number
  distance: number
  samplePhotosA?: { id: number; file_path: string; thumbnail_path: string | null; preview_path: string | null }[]
  samplePhotosB?: { id: number; file_path: string; thumbnail_path: string | null; preview_path: string | null }[]
}

export default function PeoplePage() {
  const { state: photoState, dispatch: photoDispatch, refreshPhotos } = usePhotos()
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

  // Merge review modal & state
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestionItem[]>([])
  const [reviewQueue, setReviewQueue] = useState<MergeSuggestionItem[]>([])
  const [currentMergeIndex, setCurrentMergeIndex] = useState(0)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set())
  const [isAnalyzingDuplicates, setIsAnalyzingDuplicates] = useState(false)

  // Photos for the currently reviewed merge pair
  const [primaryPhotos, setPrimaryPhotos] = useState<Photo[]>([])
  const [secondaryPhotos, setSecondaryPhotos] = useState<Photo[]>([])
  const [excludedPhotoIds, setExcludedPhotoIds] = useState<Set<number>>(new Set())
  const [isLoadingReviewPhotos, setIsLoadingReviewPhotos] = useState(false)

  // Context menu for individual photos in Person view
  const [photoContextMenu, setPhotoContextMenu] = useState<{ x: number; y: number; photoId: number } | null>(null)

  // Active suggestions that have not been dismissed in this session
  const activeSuggestions = useMemo(() => {
    return mergeSuggestions.filter(
      s => !dismissedPairs.has(`${s.personA.id}-${s.personB.id}`) && !dismissedPairs.has(`${s.personB.id}-${s.personA.id}`)
    )
  }, [mergeSuggestions, dismissedPairs])

  // Fetch photos for the pair currently under review
  useEffect(() => {
    if (showMergeModal && reviewQueue[currentMergeIndex]) {
      const current = reviewQueue[currentMergeIndex]
      setExcludedPhotoIds(new Set())
      loadReviewPhotos(current.personA.id, current.personB.id)
    }
  }, [showMergeModal, currentMergeIndex, reviewQueue])

  async function loadReviewPhotos(primaryId: number, secondaryId: number) {
    setIsLoadingReviewPhotos(true)
    try {
      if (window.photoVault?.getPhotosByPerson) {
        const [pPhotos, sPhotos] = await Promise.all([
          window.photoVault.getPhotosByPerson(primaryId),
          window.photoVault.getPhotosByPerson(secondaryId)
        ])
        setPrimaryPhotos(pPhotos || [])
        setSecondaryPhotos(sPhotos || [])
      }
    } catch (err) {
      console.error('Failed to load review photos:', err)
    } finally {
      setIsLoadingReviewPhotos(false)
    }
  }

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
      refreshSuggestions()
    } catch (err) {
      console.error('Failed to load people:', err)
    }
  }

  async function refreshSuggestions() {
    try {
      if (window.photoVault?.getMergeSuggestions) {
        const suggestions = await window.photoVault.getMergeSuggestions()
        setMergeSuggestions(suggestions || [])
      }
    } catch (err) {
      console.error('Failed to load merge suggestions:', err)
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

  // Open the interactive Merge Review flow
  const handleOpenMergeReview = (filter90Only = false) => {
    const highMatches = activeSuggestions.filter(s => s.confidence >= 90)
    const listToReview = (filter90Only && highMatches.length > 0)
      ? highMatches
      : (highMatches.length > 0 ? highMatches : activeSuggestions)

    if (listToReview.length === 0) {
      showToast('No duplicate faces detected!')
      return
    }

    setReviewQueue(listToReview)
    setCurrentMergeIndex(0)
    setExcludedPhotoIds(new Set())
    setShowMergeModal(true)
  }

  // Toggle excluding a photo from being merged into target
  const handleToggleExcludePhoto = (photoId: number) => {
    setExcludedPhotoIds(prev => {
      const next = new Set(prev)
      if (next.has(photoId)) {
        next.delete(photoId)
      } else {
        next.add(photoId)
      }
      return next
    })
  }

  // User accepts merge for the current pair
  const handleAcceptAndMerge = async () => {
    const current = reviewQueue[currentMergeIndex]
    if (!current) return

    const primaryId = current.personA.id
    const secondaryId = current.personB.id
    const includedCount = secondaryPhotos.length - excludedPhotoIds.size

    try {
      // 1. Remove any excluded photos from Person B before merging
      if (excludedPhotoIds.size > 0 && window.photoVault?.removePhotoFromPerson) {
        for (const photoId of excludedPhotoIds) {
          await window.photoVault.removePhotoFromPerson(secondaryId, photoId)
        }
      }

      // 2. If there are included photos remaining, merge Person B into Person A
      if (includedCount > 0 && window.photoVault?.mergePeople) {
        await window.photoVault.mergePeople(primaryId, secondaryId)
        showToast(`Merged ${includedCount} photo${includedCount === 1 ? '' : 's'} into "${current.personA.name}"!`)
      } else {
        showToast(`All photos excluded. Profiles kept separate.`)
      }

      // 3. Remove secondaryId from suggestions & reviewQueue
      const updatedQueue = reviewQueue.filter(
        (s, idx) => idx !== currentMergeIndex && s.personA.id !== secondaryId && s.personB.id !== secondaryId
      )
      setReviewQueue(updatedQueue)

      const updatedSuggestions = mergeSuggestions.filter(
        s => s.personA.id !== secondaryId && s.personB.id !== secondaryId
      )
      setMergeSuggestions(updatedSuggestions)

      // Reload people & person photos if currently viewed
      await loadPeople()
      if (selectedPerson && (selectedPerson.id === primaryId || selectedPerson.id === secondaryId)) {
        loadPersonPhotos(primaryId)
      }

      // Check if more pairs to review
      if (updatedQueue.length === 0 || currentMergeIndex >= updatedQueue.length) {
        setShowMergeModal(false)
        showToast('All duplicate reviews completed!')
      }
    } catch (err: any) {
      showToast(`Merge error: ${err?.message || err}`)
    }
  }

  // User skips / keeps current pair separate
  const handleSkipMerge = () => {
    const current = reviewQueue[currentMergeIndex]
    if (current) {
      setDismissedPairs(prev => new Set(prev).add(`${current.personA.id}-${current.personB.id}`))
    }
    if (currentMergeIndex < reviewQueue.length - 1) {
      setCurrentMergeIndex(prev => prev + 1)
    } else {
      setShowMergeModal(false)
      showToast('All duplicate suggestions reviewed')
    }
  }

  // Delete unwanted face profile directly from merge review flow
  const handleDeleteUnwantedFace = async (personToDelete: Person, options?: { deleteBoth?: boolean }) => {
    const current = reviewQueue[currentMergeIndex]
    if (!current) return

    const deleteBoth = options?.deleteBoth || false
    const promptMsg = deleteBoth
      ? `Delete BOTH face profiles ("${current.personA.name}" and "${current.personB.name}")?\n\nThese unwanted faces will be permanently removed from your People library and will never appear in duplicate comparisons. Photos will remain safe in your library.`
      : `Delete unwanted face profile "${personToDelete.name}"?\n\nThis face will be permanently removed from your People library and will never appear in duplicate comparisons. Photos will remain safe in your library.`

    if (!window.confirm(promptMsg)) return

    try {
      const idsToDelete: number[] = deleteBoth
        ? [current.personA.id, current.personB.id]
        : [personToDelete.id]

      for (const pId of idsToDelete) {
        if (window.photoVault?.deletePerson) {
          await window.photoVault.deletePerson(pId)
        }
      }

      showToast(
        deleteBoth
          ? `Deleted unwanted face profiles "${current.personA.name}" & "${current.personB.name}"`
          : `Deleted unwanted face "${personToDelete.name}"`
      )

      // Filter out any suggestions involving the deleted person(s)
      const idsSet = new Set(idsToDelete)
      const updatedQueue = reviewQueue.filter(
        s => !idsSet.has(s.personA.id) && !idsSet.has(s.personB.id)
      )
      setReviewQueue(updatedQueue)

      const updatedSuggestions = mergeSuggestions.filter(
        s => !idsSet.has(s.personA.id) && !idsSet.has(s.personB.id)
      )
      setMergeSuggestions(updatedSuggestions)

      // Reload people library
      await loadPeople()
      if (selectedPerson && idsSet.has(selectedPerson.id)) {
        setSelectedPerson(null)
      }

      // Check if queue has more items or clamp index
      if (updatedQueue.length === 0) {
        setShowMergeModal(false)
        showToast('All duplicate reviews completed!')
      } else if (currentMergeIndex >= updatedQueue.length) {
        setCurrentMergeIndex(Math.max(0, updatedQueue.length - 1))
      }
    } catch (err: any) {
      showToast(`Error deleting face: ${err?.message || err}`)
    }
  }

  // Remove single photo from duplicate face during review
  const handleRemovePhotoDirectlyFromReview = async (photoId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const current = reviewQueue[currentMergeIndex]
    if (!current) return
    try {
      if (window.photoVault?.removePhotoFromPerson) {
        await window.photoVault.removePhotoFromPerson(current.personB.id, photoId)
        showToast('Removed face from this photo')
        setSecondaryPhotos(prev => prev.filter(p => p.id !== photoId))
        setExcludedPhotoIds(prev => {
          const next = new Set(prev)
          next.delete(photoId)
          return next
        })
        loadPeople()
      }
    } catch (err: any) {
      showToast(`Error removing photo: ${err?.message || err}`)
    }
  }

  // Remove photo(s) from a person profile
  const handleRemoveSelectedFromPerson = async () => {
    if (!selectedPerson || photoState.selectedIds.size === 0) return

    const count = photoState.selectedIds.size
    const confirmMsg = `Remove ${count} photo${count === 1 ? '' : 's'} from "${selectedPerson.name}"?\n\nThe photos will remain in your library but will be unlinked from this person.`
    if (!window.confirm(confirmMsg)) return

    try {
      const ids = Array.from(photoState.selectedIds)
      for (const photoId of ids) {
        if (window.photoVault?.removePhotoFromPerson) {
          await window.photoVault.removePhotoFromPerson(selectedPerson.id, photoId)
        }
      }
      photoDispatch({ type: 'DESELECT_ALL' })
      showToast(`Removed ${count} photo${count === 1 ? '' : 's'} from "${selectedPerson.name}"`)
      await loadPersonPhotos(selectedPerson.id)
      await loadPeople()
    } catch (err: any) {
      showToast(`Error removing photos: ${err?.message || err}`)
    }
  }

  const handleRemoveSinglePhotoFromPerson = async (photoId: number) => {
    if (!selectedPerson) return
    try {
      if (window.photoVault?.removePhotoFromPerson) {
        await window.photoVault.removePhotoFromPerson(selectedPerson.id, photoId)
        showToast(`Removed photo from "${selectedPerson.name}"`)
        setPhotoContextMenu(null)
        await loadPersonPhotos(selectedPerson.id)
        await loadPeople()
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || err}`)
    }
  }

  const handleSetAsCoverPhoto = async (photoId: number) => {
    if (!selectedPerson) return
    try {
      if (window.photoVault?.setPersonCoverPhoto) {
        await window.photoVault.setPersonCoverPhoto(selectedPerson.id, photoId)
        showToast(`Updated cover photo for "${selectedPerson.name}"`)
        setPhotoContextMenu(null)
        await loadPeople()
        setSelectedPerson(prev => (prev ? { ...prev, cover_photo_id: photoId } : null))
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || err}`)
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

                {photoState.selectedIds.size > 0 && (
                  <button
                    type="button"
                    className="btn"
                    onClick={handleRemoveSelectedFromPerson}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '13px',
                      fontWeight: 600,
                      padding: '8px 14px',
                      borderRadius: '10px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      color: '#ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    <UserMinus size={16} /> Remove ({photoState.selectedIds.size}) from Group
                  </button>
                )}

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
            <PhotoGrid
              photos={displayedPersonPhotos}
              showDateHeaders={true}
              onContextMenu={(e, photoId) => {
                e.preventDefault()
                setPhotoContextMenu({ x: e.clientX, y: e.clientY, photoId })
              }}
            />
          )}

          {/* ─── Floating Selection Bar for Person Photos ──────────────────── */}
          {photoState.selectedIds.size > 0 && (
            <div
              style={{
                position: 'fixed',
                bottom: '28px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 18px',
                borderRadius: '20px',
                background: 'rgba(15, 23, 42, 0.92)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
                color: '#ffffff'
              }}
            >
              <span style={{ fontSize: '13px', fontWeight: 600 }}>
                {photoState.selectedIds.size} photo{photoState.selectedIds.size === 1 ? '' : 's'} selected
              </span>
              <div style={{ width: '1px', height: '16px', background: 'rgba(255, 255, 255, 0.2)' }} />
              <button
                type="button"
                className="btn"
                onClick={handleRemoveSelectedFromPerson}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '12px',
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <UserMinus size={15} /> Remove from {selectedPerson.name}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => photoDispatch({ type: 'DESELECT_ALL' })}
                style={{ padding: '6px 10px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}
              >
                Deselect All
              </button>
            </div>
          )}

          {/* ─── Photo Context Menu ────────────────────────────────────────── */}
          {photoContextMenu && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000
              }}
              onClick={() => setPhotoContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault()
                setPhotoContextMenu(null)
              }}
            >
              <div
                style={{
                  position: 'fixed',
                  top: `${Math.min(window.innerHeight - 120, photoContextMenu.y)}px`,
                  left: `${Math.min(window.innerWidth - 240, photoContextMenu.x)}px`,
                  background: 'var(--bg-secondary, #1e293b)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '6px',
                  boxShadow: '0 16px 36px rgba(0, 0, 0, 0.55)',
                  minWidth: '220px',
                  zIndex: 10001
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleSetAsCoverPhoto(photoContextMenu.photoId)}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    padding: '8px 12px',
                    fontSize: '13px',
                    gap: '8px'
                  }}
                >
                  <Camera size={15} color="var(--primary)" /> Set as Key / Cover Photo
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleRemoveSinglePhotoFromPerson(photoContextMenu.photoId)}
                  style={{
                    width: '100%',
                    justifyContent: 'flex-start',
                    padding: '8px 12px',
                    fontSize: '13px',
                    gap: '8px',
                    color: '#ef4444'
                  }}
                >
                  <UserMinus size={15} /> Remove from "{selectedPerson.name}"
                </button>
              </div>
            </div>
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
                onClick={() => handleOpenMergeReview(false)}
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

          {/* ── Apple-Style Duplicate Faces Review Banner ─────────────────── */}
          {activeSuggestions.length > 0 && (
            <div
              style={{
                marginBottom: '28px',
                padding: '16px 20px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.12) 0%, rgba(139, 92, 246, 0.12) 100%)',
                border: '1px solid rgba(236, 72, 153, 0.35)',
                backdropFilter: 'blur(16px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px',
                boxShadow: '0 12px 32px rgba(236, 72, 153, 0.12)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 4px 16px rgba(236, 72, 153, 0.4)'
                  }}
                >
                  <Sparkles size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {activeSuggestions.length} Potential Duplicate {activeSuggestions.length === 1 ? 'Person' : 'People'} Found
                    </h4>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        background: 'rgba(34, 197, 94, 0.18)',
                        color: '#22c55e',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      }}
                    >
                      {activeSuggestions[0]?.confidence || 95}% Top Match
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    Multiple detected face groups have closely matching 128D facial features and likely belong to the same person.
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleOpenMergeReview(activeSuggestions.some(s => s.confidence >= 90))}
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    padding: '9px 20px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(236, 72, 153, 0.35)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <Zap size={15} color="#fef08a" fill="#fef08a" />
                  {activeSuggestions.some(s => s.confidence >= 90)
                    ? `Merge 90%+ Matches (${activeSuggestions.filter(s => s.confidence >= 90).length})`
                    : `Merge Similar Faces (${activeSuggestions.length})`}
                </button>
              </div>
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

      {/* ─── Modal 2: Apple-Style Face Comparison & Exclude-Before-Merge Reviewer ──────────────── */}
      {showMergeModal && reviewQueue.length > 0 && currentMergeIndex < reviewQueue.length && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}
          onClick={() => {
            setShowMergeModal(false)
            loadPeople()
          }}
        >
          <div
            style={{
              width: '780px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              borderRadius: '24px',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              padding: '28px 32px',
              boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
              color: 'var(--text-primary)',
              display: 'flex',
              flexDirection: 'column',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
                flexShrink: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    boxShadow: '0 4px 14px rgba(236, 72, 153, 0.35)'
                  }}
                >
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>
                    Review Duplicate Face Merge
                  </h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Pair {currentMergeIndex + 1} of {reviewQueue.length}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Match % Pill */}
                {(() => {
                  const conf = reviewQueue[currentMergeIndex].confidence
                  const isHigh = conf >= 90
                  const isMed = conf >= 78
                  return (
                    <span
                      style={{
                        background: isHigh
                          ? 'rgba(34, 197, 94, 0.18)'
                          : isMed
                          ? 'rgba(59, 130, 246, 0.18)'
                          : 'rgba(245, 158, 11, 0.18)',
                        color: isHigh ? '#22c55e' : isMed ? '#60a5fa' : '#f59e0b',
                        border: `1px solid ${isHigh ? 'rgba(34, 197, 94, 0.35)' : isMed ? 'rgba(59, 130, 246, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                        fontSize: '13px',
                        fontWeight: 700,
                        padding: '4px 12px',
                        borderRadius: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: isHigh ? '#22c55e' : isMed ? '#60a5fa' : '#f59e0b'
                        }}
                      />
                      {conf}% Face Match
                    </span>
                  )
                })()}

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowMergeModal(false)
                    loadPeople()
                  }}
                  style={{ padding: '6px', borderRadius: '50%', color: 'var(--text-secondary)' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* ─── Multi-Pair Strip Navigator (Quick Jump & Quick Delete) ─── */}
            {reviewQueue.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  overflowX: 'auto',
                  padding: '4px 2px 10px 2px',
                  marginBottom: '8px',
                  flexShrink: 0
                }}
              >
                {reviewQueue.map((item, idx) => {
                  const isCurrent = idx === currentMergeIndex
                  return (
                    <div
                      key={`${item.personA.id}-${item.personB.id}-${idx}`}
                      onClick={() => {
                        setCurrentMergeIndex(idx)
                        setExcludedPhotoIds(new Set())
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '10px',
                        background: isCurrent ? 'rgba(236, 72, 153, 0.18)' : 'rgba(255, 255, 255, 0.04)',
                        border: isCurrent ? '1.5px solid #ec4899' : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        fontSize: '12px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span style={{ fontWeight: isCurrent ? 700 : 500, color: isCurrent ? '#ffffff' : 'var(--text-secondary)' }}>
                        {item.personA.name} & {item.personB.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '1px 5px',
                          borderRadius: '6px',
                          background: item.confidence >= 90 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          color: item.confidence >= 90 ? '#22c55e' : '#60a5fa'
                        }}
                      >
                        {item.confidence}%
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteUnwantedFace(item.personB)
                        }}
                        title={`Delete unwanted face "${item.personB.name}"`}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'rgba(239, 68, 68, 0.75)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '4px'
                        }}
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Scrollable Body Content */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '6px', marginBottom: '16px' }}>
              {/* ─── Why All Photos Are Merging: Biometric Match Explanation ─── */}
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.22)',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  marginBottom: '18px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px'
                }}
              >
                <ShieldCheck size={20} color="#60a5fa" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: '#60a5fa' }}>Why are these photos merging?</strong>{' '}
                  128D ResNet facial embedding analysis indicates a{' '}
                  <strong style={{ color: '#22c55e' }}>{reviewQueue[currentMergeIndex].confidence}% match</strong>{' '}
                  (Euclidean distance: {reviewQueue[currentMergeIndex].distance}). Facial landmarks across eye spacing, nose bridge, and jawline geometry align between these profiles.
                </div>
              </div>

              {/* ─── Profile Overview: Target (Keeper) vs Duplicate ─── */}
              {(() => {
                const current = reviewQueue[currentMergeIndex]
                const pA = current.personA
                const pB = current.personB
                return (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto 1fr',
                      alignItems: 'center',
                      gap: '16px',
                      marginBottom: '20px',
                      background: 'rgba(15, 23, 42, 0.65)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      padding: '16px 20px',
                      borderRadius: '18px'
                    }}
                  >
                    {/* Primary Target Profile */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      {renderAvatar(pA, 54, '#3b82f6')}
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Target Profile (Keeper)
                        </div>
                        <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{pA.name}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {primaryPhotos.length || pA.photo_count || 0} existing photos
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteUnwantedFace(pA)}
                          title={`Delete "${pA.name}" profile completely (removes this face if unwanted)`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={10} /> Delete Profile
                        </button>
                      </div>
                    </div>

                    {/* Arrow / Direction */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px',
                        color: '#ec4899'
                      }}
                    >
                      <GitMerge size={20} />
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                        Merge In
                      </span>
                    </div>

                    {/* Secondary Duplicate Profile */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                      {renderAvatar(pB, 54, '#ec4899')}
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#f472b6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Duplicate Profile
                        </div>
                        <strong style={{ fontSize: '15px', color: 'var(--text-primary)' }}>{pB.name}</strong>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {secondaryPhotos.length || pB.photo_count || 0} photos to merge
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteUnwantedFace(pB)}
                          title={`Delete "${pB.name}" profile completely (removes this unwanted face from library and comparisons)`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '5px',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 7px',
                            borderRadius: '6px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.35)',
                            cursor: 'pointer'
                          }}
                        >
                          <Trash2 size={10} /> Delete Unwanted Face
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })()}

              {/* ─── Interactive Photo Selection Grid: Exclude or Include Faces ─── */}
              {(() => {
                const current = reviewQueue[currentMergeIndex]
                const includedCount = secondaryPhotos.length - excludedPhotoIds.size
                return (
                  <div style={{ marginBottom: '20px' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}
                    >
                      <div>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          Photos from "{current.personB.name}" to be merged:
                        </span>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Click any photo to exclude/remove a face if it doesn't belong to this person.
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '12px',
                            background: includedCount > 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: includedCount > 0 ? '#22c55e' : '#ef4444'
                          }}
                        >
                          {includedCount} of {secondaryPhotos.length} included
                        </span>

                        {excludedPhotoIds.size > 0 && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => setExcludedPhotoIds(new Set())}
                            style={{ fontSize: '11px', padding: '2px 8px', color: '#60a5fa' }}
                          >
                            Include All
                          </button>
                        )}
                      </div>
                    </div>

                    {isLoadingReviewPhotos ? (
                      <div style={{ padding: '30px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px auto', color: 'var(--primary)' }} />
                        <div style={{ fontSize: '13px' }}>Loading photos for review...</div>
                      </div>
                    ) : secondaryPhotos.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                        No photos found for this duplicate profile.
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
                          gap: '12px',
                          background: 'rgba(15, 23, 42, 0.4)',
                          padding: '14px',
                          borderRadius: '16px',
                          border: '1px solid rgba(255, 255, 255, 0.06)'
                        }}
                      >
                        {secondaryPhotos.map(photo => {
                          const isExcluded = excludedPhotoIds.has(photo.id)
                          return (
                            <div
                              key={photo.id}
                              onClick={() => handleToggleExcludePhoto(photo.id)}
                              style={{
                                position: 'relative',
                                width: '100%',
                                aspectRatio: '1/1',
                                borderRadius: '12px',
                                overflow: 'hidden',
                                cursor: 'pointer',
                                border: isExcluded ? '2.5px solid #ef4444' : '2.5px solid #22c55e',
                                opacity: isExcluded ? 0.4 : 1,
                                filter: isExcluded ? 'grayscale(80%)' : 'none',
                                transition: 'all 0.2s ease',
                                boxShadow: isExcluded ? 'none' : '0 4px 12px rgba(34, 197, 94, 0.2)'
                              }}
                              title={isExcluded ? 'Click to re-include in merge' : 'Click to exclude / remove this face from merge'}
                            >
                              <img
                                src={getThumbnailUrl(photo.thumbnail_path, photo.file_path)}
                                alt={photo.filename}
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  display: 'block'
                                }}
                              />

                              {/* Top-Left Trash Button: Unlink face from this photo immediately */}
                              <button
                                type="button"
                                onClick={(e) => handleRemovePhotoDirectlyFromReview(photo.id, e)}
                                title="Permanently unlink face detection from this photo"
                                style={{
                                  position: 'absolute',
                                  top: '6px',
                                  left: '6px',
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  background: 'rgba(15, 23, 42, 0.85)',
                                  backdropFilter: 'blur(4px)',
                                  border: '1px solid rgba(255, 255, 255, 0.2)',
                                  color: '#ef4444',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
                                  cursor: 'pointer',
                                  zIndex: 2,
                                  padding: 0
                                }}
                              >
                                <Trash2 size={11} />
                              </button>

                              {/* Top-Right Badge: Checkmark or Excluded X */}
                              <div
                                style={{
                                  position: 'absolute',
                                  top: '6px',
                                  right: '6px',
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  background: isExcluded ? '#ef4444' : '#22c55e',
                                  color: '#ffffff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
                                }}
                              >
                                {isExcluded ? <X size={13} strokeWidth={3} /> : <Check size={13} strokeWidth={3} />}
                              </div>

                              {/* Bottom Label Overlay */}
                              <div
                                style={{
                                  position: 'absolute',
                                  bottom: 0,
                                  left: 0,
                                  right: 0,
                                  padding: '3px 4px',
                                  background: isExcluded ? 'rgba(239, 68, 68, 0.85)' : 'rgba(0, 0, 0, 0.65)',
                                  backdropFilter: 'blur(4px)',
                                  color: '#ffffff',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  letterSpacing: '0.02em'
                                }}
                              >
                                {isExcluded ? '✕ Excluded' : '✓ Will Merge'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* ─── Reference Photos from Target Profile (for side-by-side comparison) ─── */}
              {primaryPhotos.length > 0 && (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    borderRadius: '16px',
                    padding: '14px 16px'
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    Reference photos in target profile "{reviewQueue[currentMergeIndex].personA.name}" ({primaryPhotos.length} total):
                  </div>
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                    {primaryPhotos.slice(0, 8).map(photo => (
                      <img
                        key={photo.id}
                        src={getThumbnailUrl(photo.thumbnail_path, photo.file_path)}
                        alt="Reference"
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '8px',
                          objectFit: 'cover',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          flexShrink: 0
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Navigation & Actions */}
            {(() => {
              const current = reviewQueue[currentMergeIndex]
              const includedCount = secondaryPhotos.length - excludedPhotoIds.size
              return (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    flexShrink: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setShowMergeModal(false)
                        loadPeople()
                      }}
                      style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
                    >
                      Close
                    </button>
                    {reviewQueue.length > 1 && (
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        ({reviewQueue.length - currentMergeIndex - 1} remaining)
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Delete Unwanted Face Actions */}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleDeleteUnwantedFace(current.personB)}
                      title={`Permanently delete unwanted face profile "${current.personB.name}"`}
                      style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        padding: '8px 14px',
                        borderRadius: '10px',
                        background: 'rgba(239, 68, 68, 0.12)',
                        color: '#f87171',
                        border: '1px solid rgba(239, 68, 68, 0.28)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={14} /> Delete Unwanted Face
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => handleDeleteUnwantedFace(current.personB, { deleteBoth: true })}
                      title="Neither face is wanted (e.g. background strangers or statues). Delete both profiles."
                      style={{
                        fontSize: '12px',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        color: 'var(--text-tertiary)'
                      }}
                    >
                      Delete Both
                    </button>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleSkipMerge}
                      style={{ fontSize: '13px', padding: '8px 16px', borderRadius: '10px' }}
                    >
                      Keep Separate
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAcceptAndMerge}
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        padding: '9px 22px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)',
                        boxShadow: '0 4px 14px rgba(236, 72, 153, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <Check size={16} /> Accept & Merge ({includedCount} Photo{includedCount === 1 ? '' : 's'})
                    </button>
                  </div>
                </div>
              )
            })()}
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
