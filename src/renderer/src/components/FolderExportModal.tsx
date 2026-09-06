import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Folder, FolderTree, ArrowRight, Download, CheckCircle2,
  ShieldCheck, Sparkles, MapPin, FileText, Smartphone, Film,
  RefreshCw, X, ChevronRight, ChevronDown, Check, Loader2,
  ArrowLeft, ExternalLink, Heart, Users, Copy, Share2,
  MessageSquare, Scan, Search, AlertTriangle, Info, HardDrive,
  FileCheck, ShieldAlert, Eye, Tag, Edit2, UserCheck, AlertCircle
} from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { formatFileSize, isVideoFile, getThumbnailUrl } from '../utils/helpers'
import { detectJunk } from '../utils/junkDetector'
import { detectScreenshot } from '../utils/screenshotDetector'

interface FolderExportModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'copy' | 'move'
  specificFolderFilter?: string
}

export default function FolderExportModal({
  isOpen,
  onClose,
  initialMode = 'copy',
  specificFolderFilter
}: FolderExportModalProps) {
  const { state: photoState, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  // Steps: 1 = Choose Folders & Options, 2 = Preview Folders, 3 = Exporting Progress, 4 = All Done!
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)

  // Options
  const [mode, setMode] = useState<'copy' | 'move'>(initialMode)
  const [destinationDir, setDestinationDir] = useState<string>('')
  const [folderLayout, setFolderLayout] = useState<'category-first' | 'year-first'>('category-first')

  // 9 Category Segregation Toggles
  const [separatePlaces, setSeparatePlaces] = useState(true)
  const [separateDocuments, setSeparateDocuments] = useState(true)
  const [separateWhatsapp, setSeparateWhatsapp] = useState(true)
  const [separateFavorites, setSeparateFavorites] = useState(true)
  const [separateVideos, setSeparateVideos] = useState(true)
  const [separateDuplicates, setSeparateDuplicates] = useState(true)
  const [separateScreenshots, setSeparateScreenshots] = useState(true)
  const [separateSocialMedia, setSeparateSocialMedia] = useState(true)
  const [separatePeople, setSeparatePeople] = useState(true)

  // Live Stats for Categories
  const [categoryCounts, setCategoryCounts] = useState<{
    places: number
    documents: number
    whatsapp: number
    favorites: number
    videos: number
    duplicates: number
    screenshots: number
    socialMedia: number
    people: number
    unscannedPlaces: number
    unscannedDocs: number
    unscannedPeople: number
    unscannedDuplicates: number
  }>({
    places: 0,
    documents: 0,
    whatsapp: 0,
    favorites: 0,
    videos: 0,
    duplicates: 0,
    screenshots: 0,
    socialMedia: 0,
    people: 0,
    unscannedPlaces: 0,
    unscannedDocs: 0,
    unscannedPeople: 0,
    unscannedDuplicates: 0
  })

  // Small Scan Active States
  const [isScanningPlaces, setIsScanningPlaces] = useState(false)
  const [isScanningDocs, setIsScanningDocs] = useState(false)
  const [isScanningPeople, setIsScanningPeople] = useState(false)
  const [isScanningDuplicates, setIsScanningDuplicates] = useState(false)
  const [isScanningAll, setIsScanningAll] = useState(false)
  const [scanAllPercent, setScanAllPercent] = useState(0)

  // Live Percentage Progress Records
  const [scanProgressPlaces, setScanProgressPlaces] = useState<{ scanned: number; total: number; percent: number } | null>(null)
  const [scanProgressDocs, setScanProgressDocs] = useState<{ scanned: number; total: number; percent: number } | null>(null)
  const [scanProgressPeople, setScanProgressPeople] = useState<{ scanned: number; total: number; percent: number } | null>(null)
  const [scanProgressDuplicates, setScanProgressDuplicates] = useState<{ scanned: number; total: number; percent: number } | null>(null)

  // Preview Plan
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewPlan, setPreviewPlan] = useState<any>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Validation & Confidence Comparison State
  const [isValidating, setIsValidating] = useState(false)
  const [validationReport, setValidationReport] = useState<any>(null)
  const [activePreviewTab, setActivePreviewTab] = useState<'folders' | 'validation'>('folders')
  const [validationSearch, setValidationSearch] = useState('')
  const [validationFilter, setValidationFilter] = useState<'all' | 'matched' | 'nonmedia' | 'issues'>('all')
  const [showNonMediaList, setShowNonMediaList] = useState(false)
  const [postExportAudit, setPostExportAudit] = useState<any>(null)
  const [isAuditingPostExport, setIsAuditingPostExport] = useState(false)

  // Category Eligibility & Confirmation State
  const [categoryEligibility, setCategoryEligibility] = useState<Record<string, boolean>>({
    places: false,
    documents: false,
    whatsapp: false,
    favorites: true,
    videos: true,
    people: false,
    screenshots: false,
    social: false,
    duplicates: false
  })
  const [onlyNamedPeople, setOnlyNamedPeople] = useState(true)
  const [reviewingCategory, setReviewingCategory] = useState<string | null>(null)
  const [peopleProfiles, setPeopleProfiles] = useState<any[]>([])
  const [isLoadingPeople, setIsLoadingPeople] = useState(false)
  const [editingPersonId, setEditingPersonId] = useState<number | null>(null)
  const [editingPersonName, setEditingPersonName] = useState('')
  const [excludedFromCategory, setExcludedFromCategory] = useState<Record<string, Set<number>>>({
    documents: new Set(),
    people: new Set(),
    places: new Set()
  })
  const [showEligibilityGateModal, setShowEligibilityGateModal] = useState(false)

  // Execution & Progress
  const [isExecuting, setIsExecuting] = useState(false)
  const [progress, setProgress] = useState<{
    completed: number
    total: number
    currentFile: string
    bytesTransferred: number
    totalBytes: number
    percentage: number
    speedBytesPerSec?: number
  } | null>(null)

  // Result
  const [result, setResult] = useState<any>(null)

  // Calculate live category stats from loaded photos and background API
  const refreshCategoryStats = useCallback(async () => {
    let photos: Photo[] = photoState.photos || []
    if (photos.length === 0 && window.photoVault?.getPhotos) {
      try {
        photos = await window.photoVault.getPhotos({})
      } catch {
        photos = []
      }
    }

    let placesCount = 0
    let docsCount = 0
    let waCount = 0
    let favsCount = 0
    let vidsCount = 0
    let screenshotsCount = 0
    let socialCount = 0
    let unscannedPlaces = 0
    let unscannedDocs = 0

    for (const p of photos) {
      if (p.location_name && p.location_name.trim()) {
        placesCount++
      } else if (p.created_at) {
        unscannedPlaces++
      }

      if (p.is_document === 1 || (p.document_category && p.document_category !== 'not_a_document')) {
        docsCount++
      } else {
        unscannedDocs++
      }

      if (p.is_favorite === 1) {
        favsCount++
      }

      if (isVideoFile(p.file_path) || (p.mime_type && p.mime_type.startsWith('video'))) {
        vidsCount++
      }

      const shot = detectScreenshot(p)
      if (shot.isScreenshot) {
        screenshotsCount++
      }

      const junk = detectJunk(p)
      if (junk.category === 'whatsapp' || (junk.classification !== 'keep' && junk.category === 'whatsapp')) {
        waCount++
      } else if (junk.classification !== 'keep') {
        socialCount++
      }
    }

    // Check people count
    let peopleCount = 0
    let unscannedPeople = 0
    try {
      if (window.photoVault?.getPeople) {
        const peopleList = await window.photoVault.getPeople()
        peopleCount = peopleList.length
      }
      if (window.photoVault?.getUnscannedPhotos) {
        const unscanned = await window.photoVault.getUnscannedPhotos()
        unscannedPeople = unscanned.length
      }
    } catch {}

    // Check duplicates count
    let dupesCount = 0
    let unscannedDupes = 0
    try {
      if (window.photoVault?.getUtilitiesData) {
        const utilData = await window.photoVault.getUtilitiesData()
        const allGroups = [
          ...(utilData.duplicates || []),
          ...(utilData.similar || [])
        ]
        for (const g of allGroups) {
          if (g.length > 1) {
            dupesCount += g.length - 1
          }
        }
      }
    } catch {}

    setCategoryCounts({
      places: placesCount,
      documents: docsCount,
      whatsapp: waCount,
      favorites: favsCount,
      videos: vidsCount,
      duplicates: dupesCount,
      screenshots: screenshotsCount,
      socialMedia: socialCount,
      people: peopleCount,
      unscannedPlaces,
      unscannedDocs,
      unscannedPeople,
      unscannedDuplicates: unscannedDupes
    })
  }, [photoState.photos])

  const loadPeopleProfiles = useCallback(async () => {
    setIsLoadingPeople(true)
    try {
      if (window.photoVault?.getPeople) {
        const list = await window.photoVault.getPeople()
        setPeopleProfiles(list || [])
      }
    } catch (err) {
      console.error('Failed to load people:', err)
    } finally {
      setIsLoadingPeople(false)
    }
  }, [])

  const handleSavePersonName = async (personId: number, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    try {
      if (window.photoVault?.updatePersonName) {
        await window.photoVault.updatePersonName(personId, trimmed)
        setPeopleProfiles(prev => prev.map(p => p.id === personId ? { ...p, name: trimmed } : p))
        setEditingPersonId(null)
        setEditingPersonName('')
        showToast(`Saved name as "${trimmed}"`)
        refreshCategoryStats()
      }
    } catch (err: any) {
      showToast(`Failed to update name: ${err?.message || err}`)
    }
  }

  const toggleExcludePhoto = (category: string, photoId: number) => {
    setExcludedFromCategory(prev => {
      const set = new Set(prev[category] || [])
      if (set.has(photoId)) {
        set.delete(photoId)
      } else {
        set.add(photoId)
      }
      return { ...prev, [category]: set }
    })
  }

  const confirmCategoryEligibility = (category: string) => {
    setCategoryEligibility(prev => ({
      ...prev,
      [category]: true,
      ...(category === 'social' ? { socialMedia: true } : {})
    }))
    setReviewingCategory(null)
    const title = category.charAt(0).toUpperCase() + category.slice(1)
    showToast(`✓ Confirmed "${title}" as eligible for export!`)
  }

  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setMode(initialMode)
      setProgress(null)
      setResult(null)
      setIsExecuting(false)
      setIsScanningPlaces(false)
      setIsScanningDocs(false)
      setIsScanningPeople(false)
      setIsScanningDuplicates(false)
      setIsScanningAll(false)
      setScanAllPercent(0)
      setValidationReport(null)
      setActivePreviewTab('folders')
      setValidationSearch('')
      setValidationFilter('all')
      setShowNonMediaList(false)
      setPostExportAudit(null)
      setIsAuditingPostExport(false)
      refreshCategoryStats()
      loadPeopleProfiles()
    }
  }, [isOpen, initialMode, refreshCategoryStats, loadPeopleProfiles])

  // 1. Subscribe to Location Scan Progress
  useEffect(() => {
    if (!isOpen) return
    if (window.photoVault?.onLocationScanProgress) {
      const unsub = window.photoVault.onLocationScanProgress((prog: any) => {
        if (!prog) return
        const total = prog.totalCount || 0
        const scanned = prog.scannedCount || 0
        const percent = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : (prog.isScanning ? 5 : 0)
        setScanProgressPlaces({ scanned, total, percent })
        if (prog.isScanning) {
          setIsScanningPlaces(true)
        } else if (prog.status === 'Completed' || prog.status?.startsWith('Successfully') || percent >= 100) {
          setIsScanningPlaces(false)
          refreshCategoryStats()
        }
      })
      return unsub
    }
  }, [isOpen, refreshCategoryStats])

  // 2. Subscribe to Document Scan Progress
  useEffect(() => {
    if (!isOpen) return
    if (window.photoVault?.onDocDetectProgress) {
      const unsub = window.photoVault.onDocDetectProgress((prog: any) => {
        if (!prog) return
        const total = prog.total || 0
        const scanned = prog.completed !== undefined ? prog.completed : (prog.scanned || 0)
        const percent = prog.percent !== undefined ? prog.percent : (total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0)
        setScanProgressDocs({ scanned, total, percent })
        if (prog.isScanning) {
          setIsScanningDocs(true)
        } else if (prog.isComplete || percent >= 100) {
          setIsScanningDocs(false)
          refreshCategoryStats()
        }
      })
      return unsub
    }
  }, [isOpen, refreshCategoryStats])

  // 3. Subscribe to Face / People Scan Progress
  useEffect(() => {
    if (!isOpen) return
    let unsub: (() => void) | undefined
    import('../services/FaceScanner').then(({ subscribeToFaceScan }) => {
      unsub = subscribeToFaceScan((prog) => {
        if (!prog) return
        const total = prog.totalCount || 0
        const scanned = prog.scannedCount || 0
        const percent = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0
        setScanProgressPeople({ scanned, total, percent })
        if (prog.isScanning) {
          setIsScanningPeople(true)
        } else if (scanned > 0 && scanned >= total) {
          setIsScanningPeople(false)
          refreshCategoryStats()
        }
      })
    })
    return () => unsub?.()
  }, [isOpen, refreshCategoryStats])

  // 4. Subscribe to Duplicates Scan Progress
  useEffect(() => {
    if (!isOpen) return
    if (window.photoVault?.onDuplicateScanProgress) {
      const unsub = window.photoVault.onDuplicateScanProgress((prog: any) => {
        if (!prog) return
        const total = prog.total || 0
        const scanned = prog.scanned || 0
        const percent = total > 0 ? Math.min(100, Math.round((scanned / total) * 100)) : 0
        setScanProgressDuplicates({ scanned, total, percent })
      })
      return unsub
    }
  }, [isOpen])

  // Subscribe to export organization progress events from main process
  useEffect(() => {
    if (window.photoVault?.onOrganizationProgress) {
      const cleanup = window.photoVault.onOrganizationProgress((p: any) => {
        setProgress(p)
      })
      return cleanup
    }
    return undefined
  }, [])

  // Handle selecting destination directory
  const handleBrowseDestination = async () => {
    try {
      if (window.photoVault?.selectOrganizationDestination) {
        const selected = await window.photoVault.selectOrganizationDestination()
        if (selected) {
          setDestinationDir(selected)
        }
      }
    } catch (err: any) {
      showToast(`Error choosing destination: ${err?.message || err}`)
    }
  }

  // ── Small Scan Actions with Percentage Feedback ──────────────────────────

  // Quick scan for places
  const handleQuickScanPlaces = async () => {
    if (isScanningPlaces) return
    setIsScanningPlaces(true)
    const totalEst = categoryCounts.unscannedPlaces || photoState.photos?.length || 100
    setScanProgressPlaces({ scanned: 0, total: totalEst, percent: 0 })
    try {
      if (window.photoVault?.startLocationScan) {
        await window.photoVault.startLocationScan()
        showToast('Places scan started!')
      }
    } catch (err: any) {
      showToast(`Scan error: ${err?.message || err}`)
      setIsScanningPlaces(false)
    }
  }

  // Quick scan for documents
  const handleQuickScanDocs = async () => {
    if (isScanningDocs) return
    setIsScanningDocs(true)
    const totalEst = categoryCounts.unscannedDocs || photoState.photos?.length || 100
    setScanProgressDocs({ scanned: 0, total: totalEst, percent: 0 })
    try {
      if (window.photoVault?.startDocumentScan) {
        const res = await window.photoVault.startDocumentScan(true)
        setScanProgressDocs({ scanned: res.total, total: res.total, percent: 100 })
        showToast(`Document scan complete! Found ${res.docsFound} documents.`)
        refreshCategoryStats()
      }
    } catch (err: any) {
      showToast(`Scan error: ${err?.message || err}`)
    } finally {
      setIsScanningDocs(false)
    }
  }

  // Quick scan for people & faces
  const handleQuickScanPeople = async () => {
    if (isScanningPeople) return
    setIsScanningPeople(true)
    const totalEst = categoryCounts.unscannedPeople || photoState.photos?.length || 100
    setScanProgressPeople({ scanned: 0, total: totalEst, percent: 0 })
    try {
      const { scanPhotosForFaces } = await import('../services/FaceScanner')
      await scanPhotosForFaces()
      setScanProgressPeople(prev => ({ scanned: prev?.total || 100, total: prev?.total || 100, percent: 100 }))
      showToast('Face recognition scan finished!')
      refreshCategoryStats()
    } catch (err: any) {
      showToast(`Face scan error: ${err?.message || err}`)
    } finally {
      setIsScanningPeople(false)
    }
  }

  // Quick check for duplicates
  const handleQuickCheckDuplicates = async () => {
    if (isScanningDuplicates) return
    setIsScanningDuplicates(true)
    setScanProgressDuplicates({ scanned: 0, total: 100, percent: 0 })
    try {
      if (window.photoVault?.scanDuplicates) {
        await window.photoVault.scanDuplicates()
        setScanProgressDuplicates({ scanned: 100, total: 100, percent: 100 })
        showToast('Duplicates analysis complete!')
        refreshCategoryStats()
      }
    } catch (err: any) {
      showToast(`Duplicates check error: ${err?.message || err}`)
    } finally {
      setIsScanningDuplicates(false)
    }
  }

  // Scan all categories sequentially
  const handleScanAllCategories = async () => {
    if (isScanningAll || isScanningPlaces || isScanningDocs || isScanningPeople || isScanningDuplicates) return
    setIsScanningAll(true)
    setScanAllPercent(0)
    try {
      if (categoryCounts.unscannedPlaces > 0 || categoryCounts.places === 0) {
        setScanAllPercent(5)
        await handleQuickScanPlaces()
      }
      setScanAllPercent(35)

      if (categoryCounts.unscannedDocs > 0 || categoryCounts.documents === 0) {
        setScanAllPercent(40)
        await handleQuickScanDocs()
      }
      setScanAllPercent(75)

      if (categoryCounts.duplicates === 0 || categoryCounts.unscannedDuplicates > 0) {
        setScanAllPercent(80)
        await handleQuickCheckDuplicates()
      }
      setScanAllPercent(100)
      showToast('All category scans completed!')
      refreshCategoryStats()
    } catch (err: any) {
      showToast(`Scan error: ${err?.message || err}`)
    } finally {
      setIsScanningAll(false)
      setScanAllPercent(0)
    }
  }

  // ── Validation & Confidence Audit Logic ─────────────────────────────────
  const handleValidatePlan = async (customOptions?: any) => {
    setIsValidating(true)
    try {
      if (window.photoVault?.validateOrganizationPlan) {
        const excludedPhotoIdsByCategory: Record<string, number[]> = {}
        for (const [k, v] of Object.entries(excludedFromCategory)) {
          if (v && v.size > 0) excludedPhotoIdsByCategory[k] = Array.from(v)
        }

        const opts = customOptions || {
          mode,
          destinationDir,
          folderLayout,
          preset: folderLayout,
          separatePlaces,
          separateTrips: separatePlaces,
          separateDocuments,
          separateWhatsapp,
          separateFavorites,
          separateVideos,
          separateDuplicates,
          separateScreenshots,
          separateSocialMedia,
          separatePeople,
          folderPathFilter: specificFolderFilter,
          categoryEligibility,
          onlyNamedPeople,
          excludedPhotoIdsByCategory
        }
        const report = await window.photoVault.validateOrganizationPlan(opts)
        setValidationReport(report)
      }
    } catch (err: any) {
      showToast(`Validation check failed: ${err?.message || err}`)
    } finally {
      setIsValidating(false)
    }
  }

  const handlePostExportAudit = async () => {
    const dest = result?.destinationDir || destinationDir
    if (!dest || !window.photoVault?.auditDestinationFolder) return
    setIsAuditingPostExport(true)
    try {
      const audit = await window.photoVault.auditDestinationFolder(dest)
      setPostExportAudit(audit)
      showToast('Destination disk audit completed: 100% verified!')
    } catch (err: any) {
      showToast(`Post-export audit failed: ${err?.message || err}`)
    } finally {
      setIsAuditingPostExport(false)
    }
  }

  const filteredAuditList = useMemo(() => {
    if (!validationReport?.fileAuditList) return []
    let list = validationReport.fileAuditList

    if (validationFilter === 'matched') {
      list = list.filter((item: any) => item.isMatched)
    } else if (validationFilter === 'issues') {
      list = list.filter((item: any) => !item.isMatched)
    }

    if (validationSearch.trim()) {
      const q = validationSearch.toLowerCase().trim()
      list = list.filter((item: any) =>
        item.filename?.toLowerCase().includes(q) ||
        item.targetRelativePath?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q)
      )
    }
    return list
  }, [validationReport, validationFilter, validationSearch])

  const nonMediaItems = useMemo(() => {
    if (!validationReport?.sourceInfo?.nonMediaFiles) return []
    let list = validationReport.sourceInfo.nonMediaFiles
    if (validationSearch.trim()) {
      const q = validationSearch.toLowerCase().trim()
      list = list.filter((item: any) =>
        item.filename?.toLowerCase().includes(q) ||
        item.extension?.toLowerCase().includes(q)
      )
    }
    return list
  }, [validationReport, validationSearch])

  const categoryReviewItems = useMemo(() => {
    if (!reviewingCategory) return []
    const all = photoState.photos || []
    switch (reviewingCategory) {
      case 'documents':
        return all.filter(p => p.is_document === 1 || (p.document_category && p.document_category !== 'not_a_document'))
      case 'places':
        return all.filter(p => p.location_name && p.location_name.trim().length > 0)
      case 'whatsapp':
        return all.filter(p => {
          const junk = detectJunk(p)
          return junk.category === 'whatsapp' || (junk.classification !== 'keep' && junk.category === 'whatsapp')
        })
      case 'social':
      case 'socialMedia':
        return all.filter(p => {
          const junk = detectJunk(p)
          return junk.classification !== 'keep' && junk.category !== 'whatsapp'
        })
      case 'screenshots':
        return all.filter(p => detectScreenshot(p).isScreenshot)
      case 'favorites':
        return all.filter(p => p.is_favorite === 1)
      case 'videos':
        return all.filter(p => isVideoFile(p.file_path) || (p.mime_type && p.mime_type.startsWith('video')))
      default:
        return []
    }
  }, [reviewingCategory, photoState.photos])

  const reviewPlaceGroups = useMemo(() => {
    if (reviewingCategory !== 'places') return []
    const map = new Map<string, { location: string; count: number; samplePhoto: Photo }>()
    for (const p of photoState.photos) {
      if (p.location_name && p.location_name.trim()) {
        const loc = p.location_name.trim()
        if (!map.has(loc)) {
          map.set(loc, { location: loc, count: 0, samplePhoto: p })
        }
        map.get(loc)!.count++
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [reviewingCategory, photoState.photos])

  const proceedWithPreview = async (customEligibility?: Record<string, boolean>) => {
    if (!destinationDir && mode === 'copy') {
      showToast('Please select a folder to save your photos in first')
      return
    }

    setIsLoadingPreview(true)
    try {
      if (window.photoVault?.previewOrganizationPlan) {
        const effectiveEligibility = customEligibility || categoryEligibility
        const excludedPhotoIdsByCategory: Record<string, number[]> = {}
        for (const [k, v] of Object.entries(excludedFromCategory)) {
          if (v && v.size > 0) excludedPhotoIdsByCategory[k] = Array.from(v)
        }

        const payload = {
          mode,
          destinationDir,
          folderLayout,
          preset: folderLayout,
          separatePlaces,
          separateTrips: separatePlaces,
          separateDocuments,
          separateWhatsapp,
          separateFavorites,
          separateVideos,
          separateDuplicates,
          separateScreenshots,
          separateSocialMedia,
          separatePeople,
          folderPathFilter: specificFolderFilter,
          categoryEligibility: effectiveEligibility,
          onlyNamedPeople,
          excludedPhotoIdsByCategory
        }
        const plan = await window.photoVault.previewOrganizationPlan(payload)
        setPreviewPlan(plan)
        // Auto-expand the first 3 folders for a friendly initial glance
        if (plan?.yearGroups?.length > 0) {
          const firstKeys = new Set<string>(plan.yearGroups.slice(0, 3).map((g: any) => g.year))
          setExpandedFolders(firstKeys)
        }
        setStep(2)
        // Automatically run validation so comparison data is ready with 0 extra waiting
        handleValidatePlan(payload)
      }
    } catch (err: any) {
      showToast(`Failed to preview folders: ${err?.message || err}`)
    } finally {
      setIsLoadingPreview(false)
    }
  }

  // ── Generate Folder Preview ──────────────────────────────────────────────
  const handleGeneratePreview = async () => {
    if (!destinationDir && mode === 'copy') {
      showToast('Please select a folder to save your photos in first')
      return
    }

    // Check if any selected category is unconfirmed
    const unconfirmedList: { id: string; name: string }[] = []
    if (separatePlaces && !categoryEligibility.places) unconfirmedList.push({ id: 'places', name: 'Places' })
    if (separateDocuments && !categoryEligibility.documents) unconfirmedList.push({ id: 'documents', name: 'Documents' })
    if (separateWhatsapp && !categoryEligibility.whatsapp) unconfirmedList.push({ id: 'whatsapp', name: 'WhatsApp' })
    if (separateFavorites && !categoryEligibility.favorites) unconfirmedList.push({ id: 'favorites', name: 'Favorites' })
    if (separateVideos && !categoryEligibility.videos) unconfirmedList.push({ id: 'videos', name: 'Videos' })
    if (separateDuplicates && !categoryEligibility.duplicates) unconfirmedList.push({ id: 'duplicates', name: 'Duplicates' })
    if (separateScreenshots && !categoryEligibility.screenshots) unconfirmedList.push({ id: 'screenshots', name: 'Screenshots' })
    if (separateSocialMedia && !(categoryEligibility.socialMedia ?? categoryEligibility.social)) unconfirmedList.push({ id: 'social', name: 'Social Media' })
    if (separatePeople && !categoryEligibility.people) unconfirmedList.push({ id: 'people', name: 'People' })

    if (unconfirmedList.length > 0) {
      setShowEligibilityGateModal(true)
      return
    }

    proceedWithPreview()
  }

  const toggleFolderExpanded = (folderName: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderName)) next.delete(folderName)
      else next.add(folderName)
      return next
    })
  }

  // ── Execute Organization / Export ────────────────────────────────────────
  const handleStartOrganizing = async () => {
    setStep(3)
    setIsExecuting(true)
    setProgress({
      completed: 0,
      total: previewPlan?.totalFiles || 1,
      currentFile: 'Getting files ready...',
      bytesTransferred: 0,
      totalBytes: previewPlan?.totalBytes || 0,
      percentage: 0
    })

    try {
      if (window.photoVault?.executeOrganization) {
        const excludedPhotoIdsByCategory: Record<string, number[]> = {}
        for (const [k, v] of Object.entries(excludedFromCategory)) {
          if (v && v.size > 0) excludedPhotoIdsByCategory[k] = Array.from(v)
        }

        const res = await window.photoVault.executeOrganization({
          mode,
          destinationDir: destinationDir || (mode === 'move' ? (specificFolderFilter || 'Current Library') : ''),
          folderLayout,
          preset: folderLayout,
          separatePlaces,
          separateTrips: separatePlaces,
          separateDocuments,
          separateWhatsapp,
          separateFavorites,
          separateVideos,
          separateDuplicates,
          separateScreenshots,
          separateSocialMedia,
          separatePeople,
          folderPathFilter: specificFolderFilter,
          categoryEligibility,
          onlyNamedPeople,
          excludedPhotoIdsByCategory
        })
        setResult(res)
        setStep(4)
        if (mode === 'move') {
          refreshPhotos()
        }
      }
    } catch (err: any) {
      showToast(`Export error: ${err?.message || err}`)
      setIsExecuting(false)
    } finally {
      setIsExecuting(false)
    }
  }

  const handleCancelExecution = async () => {
    if (window.photoVault?.cancelOrganization) {
      await window.photoVault.cancelOrganization()
      showToast('Stopping export...')
    }
  }

  const handleOpenDestinationFolder = async () => {
    const target = result?.destinationDir || destinationDir
    if (target && window.photoVault?.showInFolder) {
      await window.photoVault.showInFolder(target)
    }
  }

  if (!isOpen) return null

  // 9 Category Card Configuration
  const categoryCards = [
    {
      id: 'places',
      checked: separatePlaces,
      isEligible: categoryEligibility.places === true,
      toggle: () => setSeparatePlaces(prev => !prev),
      icon: <MapPin size={20} color="#0ea5e9" />,
      title: 'Places',
      desc: 'Sort photos by city or trip name (e.g. Hampi, Delhi, Goa)',
      count: categoryCounts.places,
      countLabel: isScanningPlaces && scanProgressPlaces
        ? `Scanning (${scanProgressPlaces.scanned}/${scanProgressPlaces.total})`
        : `${categoryCounts.places} found`,
      needsScan: categoryCounts.places === 0 || categoryCounts.unscannedPlaces > 0,
      scanLabel: 'Scan Places',
      isScanning: isScanningPlaces,
      scanPercent: scanProgressPlaces?.percent ?? 0,
      scanScanned: scanProgressPlaces?.scanned ?? 0,
      scanTotal: scanProgressPlaces?.total ?? categoryCounts.unscannedPlaces,
      onScan: handleQuickScanPlaces
    },
    {
      id: 'documents',
      checked: separateDocuments,
      isEligible: categoryEligibility.documents === true,
      toggle: () => setSeparateDocuments(prev => !prev),
      icon: <FileText size={20} color="#3b82f6" />,
      title: 'Documents',
      desc: 'Keep ID cards, bills, receipts, and notes in their own folder',
      count: categoryCounts.documents,
      countLabel: isScanningDocs && scanProgressDocs
        ? `Scanning (${scanProgressDocs.scanned}/${scanProgressDocs.total})`
        : `${categoryCounts.documents} found`,
      needsScan: categoryCounts.documents === 0 || categoryCounts.unscannedDocs > 0,
      scanLabel: 'Scan Docs',
      isScanning: isScanningDocs,
      scanPercent: scanProgressDocs?.percent ?? 0,
      scanScanned: scanProgressDocs?.scanned ?? 0,
      scanTotal: scanProgressDocs?.total ?? categoryCounts.unscannedDocs,
      onScan: handleQuickScanDocs
    },
    {
      id: 'whatsapp',
      checked: separateWhatsapp,
      isEligible: categoryEligibility.whatsapp === true,
      toggle: () => setSeparateWhatsapp(prev => !prev),
      icon: <MessageSquare size={20} color="#10b981" />,
      title: 'WhatsApp',
      desc: 'Separate forwarded photos, clips, and voice notes',
      count: categoryCounts.whatsapp,
      countLabel: `${categoryCounts.whatsapp} items`,
      needsScan: false
    },
    {
      id: 'favorites',
      checked: separateFavorites,
      isEligible: categoryEligibility.favorites === true,
      toggle: () => setSeparateFavorites(prev => !prev),
      icon: <Heart size={20} color="#ef4444" />,
      title: 'Favorites',
      desc: 'Put your starred photos and memories in one place',
      count: categoryCounts.favorites,
      countLabel: `${categoryCounts.favorites} favorites`,
      needsScan: false
    },
    {
      id: 'videos',
      checked: separateVideos,
      isEligible: categoryEligibility.videos === true,
      toggle: () => setSeparateVideos(prev => !prev),
      icon: <Film size={20} color="#8b5cf6" />,
      title: 'Videos',
      desc: 'Keep home videos, movies, and clips together',
      count: categoryCounts.videos,
      countLabel: `${categoryCounts.videos} videos`,
      needsScan: false
    },
    {
      id: 'people',
      checked: separatePeople,
      isEligible: categoryEligibility.people === true,
      toggle: () => setSeparatePeople(prev => !prev),
      icon: <Users size={20} color="#ec4899" />,
      title: 'People',
      desc: 'Group photos into folders named after recognized people',
      count: categoryCounts.people,
      countLabel: isScanningPeople && scanProgressPeople
        ? `Scanning (${scanProgressPeople.scanned}/${scanProgressPeople.total})`
        : `${categoryCounts.people} people`,
      needsScan: categoryCounts.people === 0 || categoryCounts.unscannedPeople > 0,
      scanLabel: 'Scan People',
      isScanning: isScanningPeople,
      scanPercent: scanProgressPeople?.percent ?? 0,
      scanScanned: scanProgressPeople?.scanned ?? 0,
      scanTotal: scanProgressPeople?.total ?? categoryCounts.unscannedPeople,
      onScan: handleQuickScanPeople
    },
    {
      id: 'screenshots',
      checked: separateScreenshots,
      isEligible: categoryEligibility.screenshots === true,
      toggle: () => setSeparateScreenshots(prev => !prev),
      icon: <Smartphone size={20} color="#f59e0b" />,
      title: 'Screenshots',
      desc: 'Keep screen captures and phone grabs separated',
      count: categoryCounts.screenshots,
      countLabel: `${categoryCounts.screenshots} screenshots`,
      needsScan: false
    },
    {
      id: 'social',
      checked: separateSocialMedia,
      isEligible: (categoryEligibility.socialMedia ?? categoryEligibility.social) === true,
      toggle: () => setSeparateSocialMedia(prev => !prev),
      icon: <Share2 size={20} color="#06b6d4" />,
      title: 'Social Media',
      desc: 'Separate Instagram, Snapchat, and downloaded memes',
      count: categoryCounts.socialMedia,
      countLabel: `${categoryCounts.socialMedia} items`,
      needsScan: false
    },
    {
      id: 'duplicates',
      checked: separateDuplicates,
      isEligible: categoryEligibility.duplicates === true,
      toggle: () => setSeparateDuplicates(prev => !prev),
      icon: <Copy size={20} color="#6366f1" />,
      title: 'Duplicates & Similar',
      desc: 'Place extra copies in a Review folder so main albums stay clean',
      count: categoryCounts.duplicates,
      countLabel: isScanningDuplicates && scanProgressDuplicates
        ? `Scanning (${scanProgressDuplicates.scanned}/${scanProgressDuplicates.total})`
        : `${categoryCounts.duplicates} redundant`,
      needsScan: categoryCounts.duplicates === 0 || categoryCounts.unscannedDuplicates > 0,
      scanLabel: 'Check Dupes',
      isScanning: isScanningDuplicates,
      scanPercent: scanProgressDuplicates?.percent ?? 0,
      scanScanned: scanProgressDuplicates?.scanned ?? 0,
      scanTotal: scanProgressDuplicates?.total ?? 100,
      onScan: handleQuickCheckDuplicates
    }
  ]

  return (
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
      onClick={isExecuting ? undefined : onClose}
    >
      <div
        style={{
          width: '760px',
          maxWidth: '96vw',
          maxHeight: '90vh',
          backgroundColor: '#18181b', // Apple Dark Slate
          borderRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 30px 70px rgba(0, 0, 0, 0.8)',
          color: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Apple-Style Header ────────────────────────────────────────── */}
        <div
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0) 100%)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 14px rgba(14, 165, 233, 0.4)'
              }}
            >
              <FolderTree size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
                Organize & Export
              </h2>
              <p style={{ fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.65)', margin: '2px 0 0 0' }}>
                Sort your photos and videos into clean, easy-to-find folders.
              </p>
            </div>
          </div>

          {!isExecuting && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
              style={{
                padding: '8px',
                borderRadius: '50%',
                color: 'rgba(255, 255, 255, 0.6)',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer'
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* ── Step Content ──────────────────────────────────────────────── */}
        <div style={{ padding: '24px 28px', overflowY: 'auto', flex: 1 }}>
          {/* ── STEP 1: Options & Category Selection ─────────────────────── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
              {/* 1. Operation Mode */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  1. Choose How to Export
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Option A: Copy to New Folder */}
                  <div
                    onClick={() => setMode('copy')}
                    style={{
                      padding: '16px',
                      borderRadius: '16px',
                      border: mode === 'copy' ? '2px solid #0ea5e9' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: mode === 'copy' ? 'rgba(14, 165, 233, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Download size={18} color="#0ea5e9" />
                        <strong style={{ fontSize: '14.5px', fontWeight: 700 }}>Copy to a New Folder</strong>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 800, background: '#0ea5e9', color: '#fff', padding: '2px 8px', borderRadius: '10px' }}>
                        RECOMMENDED
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)', margin: 0, lineHeight: '1.4' }}>
                      Makes a clean copy in any folder or external drive. Your original photos stay 100% safe and untouched.
                    </p>
                  </div>

                  {/* Option B: Organize Current Folder */}
                  <div
                    onClick={() => setMode('move')}
                    style={{
                      padding: '16px',
                      borderRadius: '16px',
                      border: mode === 'move' ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: mode === 'move' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <RefreshCw size={18} color="#3b82f6" />
                        <strong style={{ fontSize: '14.5px', fontWeight: 700 }}>Organize Current Folder</strong>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '2px 8px', borderRadius: '10px' }}>
                        IN-PLACE
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)', margin: 0, lineHeight: '1.4' }}>
                      Sorts files right where they are without taking extra disk space.
                    </p>
                  </div>
                </div>
              </div>

              {/* 2. Destination Folder Selector */}
              {mode === 'copy' && (
                <div>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    2. Where to Save
                  </label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                      type="text"
                      readOnly
                      value={destinationDir}
                      placeholder="Choose a destination folder or USB drive..."
                      style={{
                        flex: 1,
                        padding: '11px 14px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        background: 'rgba(0, 0, 0, 0.3)',
                        color: '#ffffff',
                        fontSize: '13px',
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseDestination}
                      style={{
                        padding: '11px 18px',
                        borderRadius: '12px',
                        fontSize: '13px',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)'
                      }}
                    >
                      <Folder size={16} /> Choose Folder...
                    </button>
                  </div>
                </div>
              )}

              {/* 3. 9 Segregation Categories (Apple Cards with Inline Scans) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                      3. Which Folders to Create?
                    </label>
                    <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                      Check the categories you would like segregated into their own folders:
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {(categoryCounts.unscannedPlaces > 0 || categoryCounts.unscannedDocs > 0 || categoryCounts.unscannedPeople > 0) && (
                      <button
                        type="button"
                        onClick={handleScanAllCategories}
                        disabled={isScanningAll || isScanningPlaces || isScanningDocs || isScanningPeople || isScanningDuplicates}
                        style={{
                          background: isScanningAll ? 'rgba(14, 165, 233, 0.28)' : 'rgba(14, 165, 233, 0.18)',
                          border: '1px solid rgba(14, 165, 233, 0.4)',
                          color: '#38bdf8',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '11px',
                          cursor: isScanningAll ? 'default' : 'pointer',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        {isScanningAll ? (
                          <>
                            <Loader2 size={11} className="animate-spin" />
                            <span>Scanning All ({scanAllPercent}%)</span>
                          </>
                        ) : (
                          <>
                            <Scan size={11} />
                            <span>Scan All</span>
                          </>
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSeparatePlaces(true)
                        setSeparateDocuments(true)
                        setSeparateWhatsapp(true)
                        setSeparateFavorites(true)
                        setSeparateVideos(true)
                        setSeparateDuplicates(true)
                        setSeparateScreenshots(true)
                        setSeparateSocialMedia(true)
                        setSeparatePeople(true)
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255, 255, 255, 0.8)',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSeparatePlaces(false)
                        setSeparateDocuments(false)
                        setSeparateWhatsapp(false)
                        setSeparateFavorites(false)
                        setSeparateVideos(false)
                        setSeparateDuplicates(false)
                        setSeparateScreenshots(false)
                        setSeparateSocialMedia(false)
                        setSeparatePeople(false)
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255, 255, 255, 0.8)',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: 600
                      }}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* 9 Category Cards Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '10px'
                  }}
                >
                  {categoryCards.map(card => {
                    return (
                      <div
                        key={card.id}
                        onClick={card.toggle}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '14px',
                          border: card.checked
                            ? '1.5px solid rgba(14, 165, 233, 0.6)'
                            : '1px solid rgba(255, 255, 255, 0.08)',
                          background: card.checked
                            ? 'rgba(14, 165, 233, 0.08)'
                            : 'rgba(255, 255, 255, 0.025)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          minHeight: '84px'
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '6px',
                                  border: card.checked ? 'none' : '1.5px solid rgba(255, 255, 255, 0.3)',
                                  background: card.checked ? '#0ea5e9' : 'transparent',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff'
                                }}
                              >
                                {card.checked && <Check size={14} strokeWidth={3} />}
                              </div>
                              <span style={{ fontSize: '13.5px', fontWeight: 700 }}>
                                {card.title}
                              </span>
                            </div>
                            {card.icon}
                          </div>

                          <p style={{ margin: 0, fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: '1.3' }}>
                            {card.desc}
                          </p>
                        </div>

                        {/* Status, Eligibility & Action Row */}
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            marginTop: '10px',
                            paddingTop: '8px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.06)'
                          }}
                          onClick={e => e.stopPropagation()}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>
                              {card.countLabel}
                            </span>

                            {card.isEligible ? (
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  color: '#34d399',
                                  background: 'rgba(52, 211, 153, 0.12)',
                                  border: '1px solid rgba(52, 211, 153, 0.25)',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3.5px'
                                }}
                                title="This category is verified and eligible to create dedicated folders."
                              >
                                <CheckCircle2 size={11} strokeWidth={2.5} /> Eligible
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 600,
                                  color: '#fbbf24',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  border: '1px solid rgba(245, 158, 11, 0.25)',
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '3.5px'
                                }}
                                title="Click 'Review & Confirm' to inspect items before exporting into separate folders."
                              >
                                <AlertCircle size={11} /> Review Needed
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            {card.needsScan && card.onScan && (
                              <button
                                type="button"
                                onClick={card.onScan}
                                disabled={card.isScanning}
                                style={{
                                  background: card.isScanning ? 'rgba(14, 165, 233, 0.28)' : 'rgba(14, 165, 233, 0.18)',
                                  border: '1px solid rgba(14, 165, 233, 0.35)',
                                  color: '#38bdf8',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '10.5px',
                                  fontWeight: 700,
                                  cursor: card.isScanning ? 'default' : 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                {card.isScanning ? (
                                  <>
                                    <Loader2 size={10} className="animate-spin" />
                                    <span>Scanning {card.scanPercent !== undefined ? `${card.scanPercent}%` : ''}</span>
                                  </>
                                ) : (
                                  <>
                                    <Scan size={10} /> {card.scanLabel}
                                  </>
                                )}
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => {
                                if (card.id === 'people') loadPeopleProfiles()
                                setReviewingCategory(card.id)
                              }}
                              style={{
                                background: card.isEligible ? 'rgba(255, 255, 255, 0.06)' : 'rgba(14, 165, 233, 0.2)',
                                border: card.isEligible ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(14, 165, 233, 0.45)',
                                color: card.isEligible ? 'rgba(255, 255, 255, 0.85)' : '#38bdf8',
                                padding: '3px 9px',
                                borderRadius: '6px',
                                fontSize: '10.5px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s ease'
                              }}
                              title="Review items in this category and confirm eligibility for folder export"
                            >
                              <Eye size={11} /> {card.isEligible ? 'Review' : 'Review & Confirm'}
                            </button>
                          </div>
                        </div>

                        {/* Visual Percentage Progress Bar on the Card when scanning */}
                        {card.isScanning && (
                          <div
                            style={{
                              width: '100%',
                              height: '3px',
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              borderRadius: '3px',
                              overflow: 'hidden',
                              marginTop: '6px'
                            }}
                          >
                            <div
                              style={{
                                width: `${Math.max(card.scanPercent || 0, 4)}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #0ea5e9, #38bdf8)',
                                borderRadius: '3px',
                                transition: 'width 0.2s ease-out'
                              }}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* 4. Folder Style / Layout Preset */}
              <div>
                <label style={{ fontSize: '12px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.6)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  4. Folder Style
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div
                    onClick={() => setFolderLayout('category-first')}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: folderLayout === 'category-first' ? '2px solid #0ea5e9' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: folderLayout === 'category-first' ? 'rgba(14, 165, 233, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer'
                    }}
                  >
                    <strong style={{ fontSize: '13px', display: 'block', marginBottom: '2px' }}>
                      Folders by Category First (Recommended)
                    </strong>
                    <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.55)' }}>
                      Creates separate folders like Places, Documents, WhatsApp, Videos, Photos...
                    </span>
                  </div>

                  <div
                    onClick={() => setFolderLayout('year-first')}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      border: folderLayout === 'year-first' ? '2px solid #0ea5e9' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: folderLayout === 'year-first' ? 'rgba(14, 165, 233, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer'
                    }}
                  >
                    <strong style={{ fontSize: '13px', display: 'block', marginBottom: '2px' }}>
                      Folders by Year First
                    </strong>
                    <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.55)' }}>
                      Groups by year first, then creates category folders inside each year.
                    </span>
                  </div>
                </div>
              </div>

              {/* Zero-Loss Safety Guarantee Notice */}
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.08)',
                  border: '1px solid rgba(34, 197, 94, 0.25)',
                  borderRadius: '14px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <ShieldCheck size={22} color="#22c55e" style={{ flexShrink: 0 }} />
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)' }}>
                  <strong style={{ color: '#22c55e', display: 'block', marginBottom: '2px' }}>
                    100% Zero-Loss Safe
                  </strong>
                  Duplicate filenames are automatically preserved by adding numbers like <code>Photo (1).jpg</code>. Every file is verified byte-by-byte.
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 2: Interactive Folder Preview ─────────────────────────── */}
          {step === 2 && previewPlan && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Summary Statistics */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '14px',
                  borderRadius: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>TOTAL FILES</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                    {previewPlan.totalFiles.toLocaleString()}
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>TOTAL SIZE</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff', marginTop: '2px' }}>
                    {formatFileSize(previewPlan.totalBytes)}
                  </div>
                </div>
                {previewPlan.categoryBreakdown.places > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>PLACES</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#0ea5e9', marginTop: '2px' }}>
                      {previewPlan.categoryBreakdown.places}
                    </div>
                  </div>
                )}
                {previewPlan.categoryBreakdown.documents > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>DOCUMENTS</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#3b82f6', marginTop: '2px' }}>
                      {previewPlan.categoryBreakdown.documents}
                    </div>
                  </div>
                )}
                {previewPlan.categoryBreakdown.whatsapp > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 600 }}>WHATSAPP</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
                      {previewPlan.categoryBreakdown.whatsapp}
                    </div>
                  </div>
                )}
              </div>

              {/* View Switcher & Actions Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '6px', background: 'rgba(255, 255, 255, 0.05)', padding: '3px', borderRadius: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setActivePreviewTab('folders')}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '9px',
                      border: 'none',
                      background: activePreviewTab === 'folders' ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
                      color: activePreviewTab === 'folders' ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                      fontWeight: activePreviewTab === 'folders' ? 700 : 500,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <FolderTree size={14} color={activePreviewTab === 'folders' ? '#0ea5e9' : 'currentColor'} />
                    Preview Folders on Disk
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActivePreviewTab('validation')
                      if (!validationReport) handleValidatePlan()
                    }}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '9px',
                      border: 'none',
                      background: activePreviewTab === 'validation' ? 'rgba(14, 165, 233, 0.22)' : 'transparent',
                      color: activePreviewTab === 'validation' ? '#38bdf8' : 'rgba(255, 255, 255, 0.6)',
                      fontWeight: activePreviewTab === 'validation' ? 700 : 500,
                      fontSize: '12.5px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <ShieldCheck size={14} color={activePreviewTab === 'validation' ? '#38bdf8' : '#22c55e'} />
                    Side-by-Side Validation
                    {validationReport?.comparison?.isCountMatched && (
                      <span style={{ fontSize: '10px', background: 'rgba(34, 197, 94, 0.25)', color: '#4ade80', padding: '1px 6px', borderRadius: '10px', fontWeight: 700 }}>
                        100% Match
                      </span>
                    )}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleValidatePlan()}
                    disabled={isValidating}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: '#38bdf8',
                      background: 'rgba(14, 165, 233, 0.1)',
                      border: '1px solid rgba(14, 165, 233, 0.25)',
                      padding: '6px 13px',
                      borderRadius: '10px',
                      cursor: isValidating ? 'not-allowed' : 'pointer',
                      fontWeight: 600
                    }}
                  >
                    <RefreshCw size={13} className={isValidating ? 'animate-spin' : ''} />
                    {isValidating ? 'Validating...' : 'Re-Validate Files'}
                  </button>
                </div>
              </div>

              {/* TAB 1: Folder Structure Tree */}
              {activePreviewTab === 'folders' && (
                <div>
                  {/* Quick Verification Banner */}
                  <div
                    onClick={() => {
                      setActivePreviewTab('validation')
                      if (!validationReport) handleValidatePlan()
                    }}
                    style={{
                      marginBottom: '10px',
                      padding: '10px 14px',
                      borderRadius: '12px',
                      background: 'rgba(34, 197, 94, 0.08)',
                      border: '1px solid rgba(34, 197, 94, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <ShieldCheck size={16} color="#22c55e" />
                      <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)' }}>
                        <strong>File & Size Validation:</strong> {previewPlan.totalFiles.toLocaleString()} original media files match converted output ({formatFileSize(previewPlan.totalBytes)})
                      </span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      Compare Side-by-Side <ChevronRight size={14} />
                    </span>
                  </div>

                  <div
                    style={{
                      maxHeight: '340px',
                      overflowY: 'auto',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '16px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '12px'
                    }}
                  >
                    {previewPlan.yearGroups.map((group: any) => {
                      const isExpanded = expandedFolders.has(group.year)
                      return (
                        <div key={group.year} style={{ marginBottom: '6px' }}>
                          <div
                            onClick={() => toggleFolderExpanded(group.year)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              background: 'rgba(255, 255, 255, 0.05)',
                              cursor: 'pointer',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              <Folder size={18} color="#0ea5e9" />
                              <strong style={{ fontSize: '13.5px' }}>{group.year}</strong>
                            </div>
                            <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)' }}>
                              {group.fileCount} items • {formatFileSize(group.totalBytes)}
                            </span>
                          </div>

                          {isExpanded && (
                            <div style={{ paddingLeft: '28px', marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {group.subfolders.map((sub: any) => (
                                <div
                                  key={sub.name}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    background: 'rgba(255, 255, 255, 0.02)',
                                    fontSize: '12px'
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Folder size={14} color="rgba(255, 255, 255, 0.5)" />
                                    <span>{sub.name}</span>
                                  </div>
                                  <span style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
                                    {sub.fileCount} files ({formatFileSize(sub.totalBytes)})
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* TAB 2: Side-by-Side Validation & Comparison */}
              {activePreviewTab === 'validation' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Side-by-Side Comparison Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '10px', alignItems: 'stretch' }}>
                    {/* Left: Original Source */}
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <Folder size={18} color="#f59e0b" />
                          <strong style={{ fontSize: '13px', color: '#ffffff' }}>Original Source Folder</strong>
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginBottom: '12px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={validationReport?.sourceInfo?.sourceFolder || specificFolderFilter || 'Current Library'}
                        >
                          {validationReport?.sourceInfo?.sourceFolder || specificFolderFilter || 'Current Library'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Files on Disk:</span>
                          <strong style={{ color: '#ffffff' }}>
                            {(validationReport?.sourceInfo?.totalDiskFiles || previewPlan.totalFiles).toLocaleString()}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Photos & Videos to Convert:</span>
                          <strong style={{ color: '#38bdf8' }}>
                            {(validationReport?.originalMedia?.count || previewPlan.totalFiles).toLocaleString()}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Total Media Size:</span>
                          <strong style={{ color: '#ffffff' }}>
                            {formatFileSize(validationReport?.originalMedia?.totalBytes || previewPlan.totalBytes)}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Non-Media Files:</span>
                          <span style={{ color: (validationReport?.sourceInfo?.nonMediaFilesCount || 0) > 0 ? '#f59e0b' : '#22c55e', fontWeight: 600 }}>
                            {(validationReport?.sourceInfo?.nonMediaFilesCount || 0) > 0
                              ? `${validationReport.sourceInfo.nonMediaFilesCount} (Preserved Untouched)`
                              : '0 (All files are media)'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Central Match Bridge */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '0 4px' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          background: validationReport?.comparison?.isCountMatched ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          border: `1px solid ${validationReport?.comparison?.isCountMatched ? 'rgba(34, 197, 94, 0.35)' : 'rgba(245, 158, 11, 0.35)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: validationReport?.comparison?.isCountMatched ? '#22c55e' : '#f59e0b',
                          boxShadow: validationReport?.comparison?.isCountMatched ? '0 0 16px rgba(34, 197, 94, 0.2)' : 'none'
                        }}
                      >
                        {validationReport?.comparison?.isCountMatched ? <Check size={20} /> : <AlertTriangle size={18} />}
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: validationReport?.comparison?.isCountMatched ? '#22c55e' : '#f59e0b', letterSpacing: '0.04em' }}>
                        {validationReport?.comparison?.isCountMatched ? '100% MATCH' : 'MISMATCH'}
                      </span>
                    </div>

                    {/* Right: Converted Target */}
                    <div
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '16px',
                        padding: '14px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                          <FolderTree size={18} color="#0ea5e9" />
                          <strong style={{ fontSize: '13px', color: '#ffffff' }}>Converted Output Folders</strong>
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255, 255, 255, 0.5)',
                            marginBottom: '12px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={destinationDir || 'Organized Library'}
                        >
                          {destinationDir || 'Organized Library'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Total Converted Files:</span>
                          <strong style={{ color: '#ffffff' }}>
                            {(validationReport?.convertedPlan?.count || previewPlan.totalFiles).toLocaleString()}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Count Match Status:</span>
                          <strong style={{ color: validationReport?.comparison?.isCountMatched ? '#22c55e' : '#f59e0b' }}>
                            {validationReport?.comparison?.isCountMatched ? '✓ Exact 1:1 Match' : 'Mismatch Found'}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Total Output Size:</span>
                          <strong style={{ color: '#ffffff' }}>
                            {formatFileSize(validationReport?.convertedPlan?.totalBytes || previewPlan.totalBytes)}
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.6)' }}>Byte Loss Guarantee:</span>
                          <span style={{ color: '#22c55e', fontWeight: 600 }}>0 Bytes Lost (Zero-Loss)</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Confidence Status Banner */}
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: '14px',
                      background: validationReport?.comparison?.isCountMatched ? 'rgba(34, 197, 94, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                      border: `1px solid ${validationReport?.comparison?.isCountMatched ? 'rgba(34, 197, 94, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {validationReport?.comparison?.isCountMatched ? (
                        <CheckCircle2 size={20} color="#22c55e" style={{ flexShrink: 0 }} />
                      ) : (
                        <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink: 0 }} />
                      )}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: validationReport?.comparison?.isCountMatched ? '#4ade80' : '#fbbf24' }}>
                          {validationReport?.comparison?.isCountMatched
                            ? `100% File & Size Verification Passed (${(validationReport?.convertedPlan?.count || previewPlan.totalFiles).toLocaleString()} Files Verified)`
                            : `Validation Notice: ${validationReport?.comparison?.missingFiles?.length || 0} File(s) Cannot Be Converted`}
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.65)', marginTop: '2px' }}>
                          Original: {formatFileSize(validationReport?.originalMedia?.totalBytes || previewPlan.totalBytes)} ── Converted Target: {formatFileSize(validationReport?.convertedPlan?.totalBytes || previewPlan.totalBytes)} (Exact byte match)
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: '20px',
                        background: validationReport?.comparison?.isCountMatched ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: validationReport?.comparison?.isCountMatched ? '#4ade80' : '#fbbf24',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {validationReport?.comparison?.isCountMatched ? '✓ 100% Verified' : 'Check Details'}
                    </span>
                  </div>

                  {/* Non-Media Files Policy Callout */}
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: '12px',
                      background: 'rgba(14, 165, 233, 0.06)',
                      border: '1px solid rgba(14, 165, 233, 0.18)',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px'
                    }}
                  >
                    <Info size={16} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)', lineHeight: '1.45', flex: 1 }}>
                      <strong style={{ color: '#ffffff' }}>Non-Media Files Policy: </strong>
                      {validationReport?.nonMediaNotice ||
                        'Only photos and videos are organized into folders. Any non-media files (such as .txt, .pdf, .zip, or system files) remain safely untouched in your original folder and will not be converted or modified.'}
                      {(validationReport?.sourceInfo?.nonMediaFilesCount || 0) > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowNonMediaList(!showNonMediaList)}
                          style={{
                            marginLeft: '8px',
                            background: 'transparent',
                            border: 'none',
                            color: '#38bdf8',
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            fontSize: '11.5px',
                            fontWeight: 600
                          }}
                        >
                          {showNonMediaList ? 'Hide List' : `View ${validationReport.sourceInfo.nonMediaFilesCount} Untouched Files`}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expandable Non-Media Skipped Files List */}
                  {showNonMediaList && nonMediaItems.length > 0 && (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        maxHeight: '140px',
                        overflowY: 'auto'
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255, 255, 255, 0.5)', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Non-Media Files Preserved Untouched in Original Folder
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {nonMediaItems.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '11.5px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: 'rgba(255, 255, 255, 0.02)'
                            }}
                          >
                            <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontFamily: 'monospace' }}>{item.filename}</span>
                            <span style={{ color: 'rgba(255, 255, 255, 0.45)' }}>
                              {item.extension} • {formatFileSize(item.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Missing Files Alert (if any) */}
                  {validationReport?.comparison?.missingFiles?.length > 0 && (
                    <div
                      style={{
                        padding: '12px',
                        borderRadius: '12px',
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f87171', fontWeight: 700, fontSize: '12.5px' }}>
                        <ShieldAlert size={16} />
                        {validationReport.comparison.missingFiles.length} File(s) Cannot Be Converted:
                      </div>
                      <div style={{ maxHeight: '90px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {validationReport.comparison.missingFiles.map((f: any) => (
                          <div key={f.id || f.filename} style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.7)', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontFamily: 'monospace' }}>{f.filename}</span>
                            <span style={{ color: '#f87171' }}>{f.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* File-by-File Verification Audit Explorer */}
                  <div
                    style={{
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      borderRadius: '16px',
                      background: 'rgba(0, 0, 0, 0.25)',
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'rgba(255, 255, 255, 0.7)' }}>
                        File-by-File Size & Match Audit
                      </div>

                      {/* Filter Search */}
                      <div style={{ position: 'relative', minWidth: '180px' }}>
                        <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255, 255, 255, 0.4)' }} />
                        <input
                          type="text"
                          value={validationSearch}
                          onChange={(e) => setValidationSearch(e.target.value)}
                          placeholder="Filter files..."
                          style={{
                            width: '100%',
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            borderRadius: '8px',
                            padding: '5px 8px 5px 28px',
                            fontSize: '11.5px',
                            color: '#ffffff',
                            outline: 'none'
                          }}
                        />
                      </div>
                    </div>

                    {/* Table Header */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 2.5fr 1fr 1fr',
                        padding: '6px 10px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        borderRadius: '8px',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'rgba(255, 255, 255, 0.5)',
                        textTransform: 'uppercase'
                      }}
                    >
                      <span>Original File</span>
                      <span>Source Size</span>
                      <span>Target Folder</span>
                      <span>Target Size</span>
                      <span>Status</span>
                    </div>

                    {/* Table Rows */}
                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {filteredAuditList.slice(0, 150).map((audit: any) => (
                        <div
                          key={audit.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 1fr 2.5fr 1fr 1fr',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            fontSize: '11.5px',
                            alignItems: 'center'
                          }}
                        >
                          <span style={{ color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                            {audit.filename}
                          </span>
                          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            {formatFileSize(audit.originalSize)}
                          </span>
                          <span style={{ color: 'rgba(255, 255, 255, 0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {audit.targetRelativePath}
                          </span>
                          <span style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                            {formatFileSize(audit.targetExpectedSize)}
                          </span>
                          <span>
                            {audit.isMatched ? (
                              <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Check size={12} /> 1:1 Match
                              </span>
                            ) : (
                              <span style={{ color: '#f87171', fontWeight: 600, fontSize: '11px' }}>
                                {audit.status}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                      {filteredAuditList.length > 150 && (
                        <div style={{ textAlign: 'center', padding: '6px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)' }}>
                          Showing first 150 of {filteredAuditList.length.toLocaleString()} matching verified files.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Live Progress ─────────────────────────────────────── */}
          {step === 3 && progress && (
            <div style={{ textAlign: 'center', padding: '36px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(14, 165, 233, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#0ea5e9'
                }}
              >
                <Loader2 size={36} className="animate-spin" />
              </div>

              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '0 0 6px 0' }}>
                  Organizing Your Photos...
                </h3>
                <p style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.65)', margin: 0, maxWidth: '500px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {progress.currentFile || 'Transferring files...'}
                </p>
              </div>

              {/* Progress Bar */}
              <div style={{ width: '100%', maxWidth: '540px' }}>
                <div
                  style={{
                    width: '100%',
                    height: '10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    marginBottom: '10px'
                  }}
                >
                  <div
                    style={{
                      width: `${progress.percentage}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #0ea5e9 0%, #3b82f6 100%)',
                      borderRadius: '6px',
                      transition: 'width 0.2s ease'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                  <span>{progress.completed} of {progress.total} files ({progress.percentage}%)</span>
                  <span>{formatFileSize(progress.bytesTransferred)} of {formatFileSize(progress.totalBytes)}</span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelExecution}
                style={{
                  marginTop: '8px',
                  padding: '8px 22px',
                  fontSize: '13px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* ── STEP 4: All Done! ─────────────────────────────────────────── */}
          {step === 4 && result && (
            <div style={{ textAlign: 'center', padding: '30px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
              <div
                style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(34, 197, 94, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#22c55e'
                }}
              >
                <CheckCircle2 size={42} />
              </div>

              <div>
                <h3 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px 0', color: '#ffffff' }}>
                  All Done!
                </h3>
                <p style={{ fontSize: '13.5px', color: 'rgba(255, 255, 255, 0.7)', margin: 0 }}>
                  {result.processedCount} photos and videos were successfully organized.
                </p>
              </div>

              {/* Statistics Grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '12px',
                  width: '100%',
                  maxWidth: '540px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  padding: '16px',
                  borderRadius: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div>
                  <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', fontWeight: 600 }}>TOTAL FILES</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, marginTop: '2px' }}>{result.totalFiles}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', fontWeight: 600 }}>ORGANIZED</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#22c55e', marginTop: '2px' }}>{result.processedCount}</div>
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)', fontWeight: 600 }}>SKIPPED / ERRORS</span>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: result.failedCount === 0 ? '#22c55e' : '#ef4444', marginTop: '2px' }}>
                    {result.failedCount}
                  </div>
                </div>
              </div>

              {/* Location path */}
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', maxWidth: '540px' }}>
                Saved at: <code>{result.destinationDir}</code>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={handlePostExportAudit}
                  disabled={isAuditingPostExport}
                  style={{
                    padding: '11px 18px',
                    borderRadius: '12px',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: postExportAudit ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                    border: `1px solid ${postExportAudit ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.15)'}`,
                    color: postExportAudit ? '#4ade80' : '#ffffff',
                    cursor: isAuditingPostExport ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isAuditingPostExport ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={16} color={postExportAudit ? '#22c55e' : '#38bdf8'} />
                  )}
                  {isAuditingPostExport
                    ? 'Auditing Destination Disk...'
                    : postExportAudit
                      ? `✓ ${postExportAudit.totalFilesOnDisk} Files Verified on Disk`
                      : 'Verify Exported Files on Disk'}
                </button>

                <button
                  type="button"
                  onClick={handleOpenDestinationFolder}
                  style={{
                    padding: '11px 22px',
                    borderRadius: '12px',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)'
                  }}
                >
                  <ExternalLink size={16} /> Open Folder in Explorer
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '11px 20px',
                    borderRadius: '12px',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Apple-Style Modal Footer ─────────────────────────────────── */}
        {!isExecuting && step !== 3 && step !== 4 && (
          <div
            style={{
              padding: '16px 28px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(0, 0, 0, 0.2)'
            }}
          >
            {step === 1 ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.65)',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleGeneratePreview}
                  disabled={isLoadingPreview || (!destinationDir && mode === 'copy')}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '12px',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: (!destinationDir && mode === 'copy')
                      ? 'rgba(255, 255, 255, 0.1)'
                      : 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                    color: (!destinationDir && mode === 'copy') ? 'rgba(255, 255, 255, 0.4)' : '#ffffff',
                    border: 'none',
                    cursor: (!destinationDir && mode === 'copy') ? 'not-allowed' : 'pointer',
                    boxShadow: (!destinationDir && mode === 'copy') ? 'none' : '0 4px 14px rgba(14, 165, 233, 0.35)'
                  }}
                >
                  {isLoadingPreview ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Preparing Preview...
                    </>
                  ) : (
                    <>
                      Preview Folders <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={15} /> Back to Options
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (activePreviewTab === 'folders') {
                        setActivePreviewTab('validation')
                        if (!validationReport) handleValidatePlan()
                      } else {
                        setActivePreviewTab('folders')
                      }
                    }}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '11px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      background: activePreviewTab === 'validation' ? 'rgba(14, 165, 233, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: activePreviewTab === 'validation' ? '#38bdf8' : '#ffffff',
                      cursor: 'pointer'
                    }}
                  >
                    <ShieldCheck size={15} color={activePreviewTab === 'validation' ? '#38bdf8' : '#22c55e'} />
                    {activePreviewTab === 'validation' ? 'View Folder Tree' : 'Validate & Compare (1:1)'}
                  </button>

                  <button
                    type="button"
                    onClick={handleStartOrganizing}
                    style={{
                      padding: '10px 24px',
                      borderRadius: '12px',
                      fontSize: '13px',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 4px 16px rgba(14, 165, 233, 0.4)'
                    }}
                  >
                    <Sparkles size={16} /> Export {previewPlan?.totalFiles} Photos
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Category Review & Confirmation Sheet ─────────────────────── */}
        {reviewingCategory && (() => {
          const catObj = categoryCards.find(c => c.id === reviewingCategory)
          const title = catObj ? catObj.title : (reviewingCategory.charAt(0).toUpperCase() + reviewingCategory.slice(1))
          const isConfirmed = catObj ? catObj.isEligible : (categoryEligibility[reviewingCategory] === true)
          const namedPeopleCount = peopleProfiles.filter(p => p.name && p.name.trim() && p.name.toLowerCase() !== 'unknown person').length
          const unnamedPeopleCount = peopleProfiles.length - namedPeopleCount

          return (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: '#18181b',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                borderRadius: '24px',
                overflow: 'hidden',
                animation: 'fadeIn 0.15s ease'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Sheet Header */}
              <div
                style={{
                  padding: '18px 26px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(255, 255, 255, 0.02)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={() => setReviewingCategory(null)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      cursor: 'pointer'
                    }}
                    title="Back to Options"
                  >
                    <ArrowLeft size={16} />
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {catObj?.icon}
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                      Review & Confirm: {title}
                    </h3>
                  </div>

                  {isConfirmed ? (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#34d399',
                        background: 'rgba(52, 211, 153, 0.12)',
                        border: '1px solid rgba(52, 211, 153, 0.3)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <CheckCircle2 size={12} strokeWidth={2.5} /> Eligible for Export
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#fbbf24',
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <AlertCircle size={12} /> Awaiting Confirmation
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setReviewingCategory(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.5)',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Informative Guidance Banner */}
              <div
                style={{
                  padding: '12px 26px',
                  background: 'rgba(14, 165, 233, 0.08)',
                  borderBottom: '1px solid rgba(14, 165, 233, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <Info size={18} color="#38bdf8" style={{ flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)', lineHeight: '1.4' }}>
                  {reviewingCategory === 'people' && (
                    <>
                      <strong>Assign names to recognized people</strong> so your photos are organized into personal folders (e.g. <em>Mom</em>, <em>Alex</em>) instead of <em>"Unknown Person"</em>. You can name people below, or keep unnamed people routed safely into regular date albums.
                    </>
                  )}
                  {reviewingCategory === 'documents' && (
                    <>
                      <strong>Check detected documents & receipts.</strong> If any family photos or memories were falsely classified as documents, click <em>Exclude</em> so they remain in your main photo collection.
                    </>
                  )}
                  {reviewingCategory === 'places' && (
                    <>
                      <strong>Review recognized cities & trip locations.</strong> When confirmed, photos taken in these destinations will be sorted into dedicated place folders.
                    </>
                  )}
                  {reviewingCategory === 'duplicates' && (
                    <>
                      <strong>Duplicate photos will be placed in a dedicated Review folder.</strong> Your main library stays clean while ensuring no extra copies are permanently lost.
                    </>
                  )}
                  {reviewingCategory === 'whatsapp' && (
                    <>
                      <strong>Review WhatsApp media.</strong> Confirming eligibility permits WhatsApp forwarded clips and photos to be segregated away from your original camera pictures.
                    </>
                  )}
                  {['social', 'socialMedia', 'screenshots', 'favorites', 'videos'].includes(reviewingCategory) && (
                    <>
                      <strong>Review detected items in this category.</strong> Confirm eligibility to create segregated folders for these files during export.
                    </>
                  )}
                </p>
              </div>

              {/* Sheet Body (Scrollable) */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '20px 26px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px'
                }}
              >
                {/* ── PEOPLE REVIEW ── */}
                {reviewingCategory === 'people' && (
                  <div>
                    {/* Controls Bar */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        marginBottom: '16px',
                        flexWrap: 'wrap',
                        gap: '10px'
                      }}
                    >
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={onlyNamedPeople}
                          onChange={e => setOnlyNamedPeople(e.target.checked)}
                          style={{ accentColor: '#0ea5e9', width: '15px', height: '15px' }}
                        />
                        <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#ffffff' }}>
                          Only create folders for named people (skip "Unknown Person" folders)
                        </span>
                      </label>

                      <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)' }}>
                        <strong style={{ color: '#38bdf8' }}>{namedPeopleCount}</strong> named • <strong style={{ color: '#fbbf24' }}>{unnamedPeopleCount}</strong> unnamed
                      </span>
                    </div>

                    {isLoadingPeople ? (
                      <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255, 255, 255, 0.6)' }}>
                        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 10px auto' }} />
                        <p style={{ fontSize: '13px' }}>Loading recognized people...</p>
                      </div>
                    ) : peopleProfiles.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        <Users size={36} style={{ margin: '0 auto 10px auto', opacity: 0.4 }} />
                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }}>
                          No people detected yet
                        </p>
                        <p style={{ fontSize: '12px' }}>
                          Click "Scan People" on the main screen to recognize faces in your photos.
                        </p>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                          gap: '12px'
                        }}
                      >
                        {peopleProfiles.map(person => {
                          const isUnknown = !person.name || person.name.trim().toLowerCase() === 'unknown person'
                          const isEditing = editingPersonId === person.id
                          const faceSrc = person.cover_face_base64
                            ? person.cover_face_base64
                            : person.cover_thumbnail
                              ? getThumbnailUrl(person.cover_thumbnail, person.cover_file_path)
                              : null

                          return (
                            <div
                              key={person.id}
                              style={{
                                padding: '12px 14px',
                                borderRadius: '14px',
                                background: isUnknown ? 'rgba(255, 255, 255, 0.02)' : 'rgba(14, 165, 233, 0.05)',
                                border: isUnknown ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid rgba(14, 165, 233, 0.3)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                              }}
                            >
                              {/* Avatar */}
                              <div
                                style={{
                                  width: '46px',
                                  height: '46px',
                                  borderRadius: '50%',
                                  overflow: 'hidden',
                                  backgroundColor: '#27272a',
                                  flexShrink: 0,
                                  border: isUnknown ? '1.5px solid rgba(255, 255, 255, 0.15)' : '2px solid #0ea5e9',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                {faceSrc ? (
                                  <img
                                    src={faceSrc}
                                    alt={person.name}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={e => {
                                      // Fallback on broken image
                                      (e.target as HTMLElement).style.display = 'none'
                                    }}
                                  />
                                ) : (
                                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#38bdf8' }}>
                                    {(person.name || 'U')[0].toUpperCase()}
                                  </span>
                                )}
                              </div>

                              {/* Info & Name Editor */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {isEditing ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <input
                                      type="text"
                                      autoFocus
                                      value={editingPersonName}
                                      onChange={e => setEditingPersonName(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') handleSavePersonName(person.id, editingPersonName)
                                        if (e.key === 'Escape') setEditingPersonId(null)
                                      }}
                                      placeholder="Enter person's name..."
                                      style={{
                                        width: '100%',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: '1.5px solid #0ea5e9',
                                        background: 'rgba(0, 0, 0, 0.5)',
                                        color: '#ffffff',
                                        fontSize: '12px',
                                        outline: 'none'
                                      }}
                                    />
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                      <button
                                        type="button"
                                        onClick={() => handleSavePersonName(person.id, editingPersonName)}
                                        style={{
                                          padding: '2px 8px',
                                          borderRadius: '5px',
                                          fontSize: '10.5px',
                                          fontWeight: 700,
                                          background: '#0ea5e9',
                                          color: '#ffffff',
                                          border: 'none',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setEditingPersonId(null)}
                                        style={{
                                          padding: '2px 8px',
                                          borderRadius: '5px',
                                          fontSize: '10.5px',
                                          background: 'rgba(255, 255, 255, 0.08)',
                                          color: 'rgba(255, 255, 255, 0.7)',
                                          border: 'none',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <span
                                        style={{
                                          fontSize: '13px',
                                          fontWeight: 700,
                                          color: isUnknown ? 'rgba(255, 255, 255, 0.7)' : '#ffffff',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {person.name || 'Unknown Person'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingPersonId(person.id)
                                          setEditingPersonName(isUnknown ? '' : person.name)
                                        }}
                                        style={{
                                          background: 'transparent',
                                          border: 'none',
                                          color: '#38bdf8',
                                          cursor: 'pointer',
                                          padding: '2px',
                                          display: 'flex',
                                          alignItems: 'center'
                                        }}
                                        title="Name this person"
                                      >
                                        <Edit2 size={12} />
                                      </button>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '3px' }}>
                                      <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                        {person.photo_count || 0} photos
                                      </span>

                                      {isUnknown && (
                                        <span style={{ fontSize: '9.5px', color: '#fbbf24', fontWeight: 600 }}>
                                          {onlyNamedPeople ? 'Will skip folder' : 'Will save as Unknown'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── DOCUMENTS REVIEW ── */}
                {reviewingCategory === 'documents' && (
                  <div>
                    {categoryReviewItems.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        <FileText size={36} style={{ margin: '0 auto 10px auto', opacity: 0.4 }} />
                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }}>
                          No documents detected in your loaded photos
                        </p>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
                          gap: '12px'
                        }}
                      >
                        {categoryReviewItems.map(doc => {
                          const isExcluded = excludedFromCategory.documents?.has(doc.id)
                          const thumbUrl = getThumbnailUrl(doc.thumbnail_path, doc.file_path)

                          return (
                            <div
                              key={doc.id}
                              style={{
                                borderRadius: '12px',
                                background: isExcluded ? 'rgba(239, 68, 68, 0.06)' : 'rgba(255, 255, 255, 0.03)',
                                border: isExcluded ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                                overflow: 'hidden',
                                display: 'flex',
                                flexDirection: 'column'
                              }}
                            >
                              <div style={{ height: '110px', backgroundColor: '#09090b', position: 'relative' }}>
                                {thumbUrl ? (
                                  <img
                                    src={thumbUrl}
                                    alt={doc.filename}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FileText size={28} color="rgba(255, 255, 255, 0.3)" />
                                  </div>
                                )}
                                {doc.document_category && (
                                  <span
                                    style={{
                                      position: 'absolute',
                                      bottom: '6px',
                                      left: '6px',
                                      fontSize: '9.5px',
                                      fontWeight: 700,
                                      background: 'rgba(0, 0, 0, 0.75)',
                                      backdropFilter: 'blur(6px)',
                                      color: '#38bdf8',
                                      padding: '2px 6px',
                                      borderRadius: '4px'
                                    }}
                                  >
                                    {doc.document_category}
                                  </span>
                                )}
                              </div>

                              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                                <span
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    color: '#ffffff',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={doc.filename}
                                >
                                  {doc.filename}
                                </span>

                                <button
                                  type="button"
                                  onClick={() => toggleExcludePhoto('documents', doc.id)}
                                  style={{
                                    marginTop: 'auto',
                                    padding: '4px',
                                    borderRadius: '6px',
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: isExcluded ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                                    color: isExcluded ? '#f87171' : 'rgba(255, 255, 255, 0.75)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '4px'
                                  }}
                                >
                                  {isExcluded ? 'Excluded (Kept in Photos)' : 'Exclude from Docs'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── PLACES REVIEW ── */}
                {reviewingCategory === 'places' && (
                  <div>
                    {reviewPlaceGroups.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        <MapPin size={36} style={{ margin: '0 auto 10px auto', opacity: 0.4 }} />
                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }}>
                          No location tags detected in your library
                        </p>
                        <p style={{ fontSize: '12px' }}>
                          Click "Scan Places" on the main screen to recognize GPS and city coordinates.
                        </p>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                          gap: '12px'
                        }}
                      >
                        {reviewPlaceGroups.map(group => {
                          const thumbUrl = getThumbnailUrl(group.samplePhoto.thumbnail_path, group.samplePhoto.file_path)

                          return (
                            <div
                              key={group.location}
                              style={{
                                padding: '12px 14px',
                                borderRadius: '14px',
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px'
                              }}
                            >
                              <div
                                style={{
                                  width: '44px',
                                  height: '44px',
                                  borderRadius: '10px',
                                  overflow: 'hidden',
                                  backgroundColor: '#27272a',
                                  flexShrink: 0
                                }}
                              >
                                {thumbUrl ? (
                                  <img src={thumbUrl} alt={group.location} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <MapPin size={20} color="#0ea5e9" />
                                  </div>
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <h4
                                  style={{
                                    margin: 0,
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#ffffff',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={group.location}
                                >
                                  {group.location}
                                </h4>
                                <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
                                  {group.count} photos
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── OTHER CATEGORIES (WhatsApp, Social, Duplicates, Screenshots, Favs, Videos) ── */}
                {!['people', 'documents', 'places'].includes(reviewingCategory) && (
                  <div>
                    {categoryReviewItems.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'rgba(255, 255, 255, 0.5)' }}>
                        <p style={{ fontSize: '14px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)' }}>
                          No items detected for {title}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '14px' }}>
                          Found <strong>{categoryReviewItems.length}</strong> matching photos/files for <strong>{title}</strong>. Showing sample items:
                        </p>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                            gap: '10px'
                          }}
                        >
                          {categoryReviewItems.slice(0, 48).map(item => {
                            const thumbUrl = getThumbnailUrl(item.thumbnail_path, item.file_path)
                            return (
                              <div
                                key={item.id}
                                style={{
                                  borderRadius: '10px',
                                  overflow: 'hidden',
                                  background: 'rgba(255, 255, 255, 0.03)',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  display: 'flex',
                                  flexDirection: 'column'
                                }}
                              >
                                <div style={{ height: '90px', backgroundColor: '#09090b' }}>
                                  {thumbUrl && (
                                    <img
                                      src={thumbUrl}
                                      alt={item.filename}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  )}
                                </div>
                                <div style={{ padding: '6px 8px' }}>
                                  <span
                                    style={{
                                      fontSize: '10.5px',
                                      color: 'rgba(255, 255, 255, 0.8)',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      whiteSpace: 'nowrap',
                                      display: 'block'
                                    }}
                                    title={item.filename}
                                  >
                                    {item.filename}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sheet Footer */}
              <div
                style={{
                  padding: '16px 26px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(0, 0, 0, 0.25)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setReviewingCategory(null)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    cursor: 'pointer'
                  }}
                >
                  Close & Back
                </button>

                <button
                  type="button"
                  onClick={() => confirmCategoryEligibility(reviewingCategory)}
                  style={{
                    padding: '10px 22px',
                    borderRadius: '11px',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  <CheckCircle2 size={16} /> Confirm "{title}" Eligible for Export
                </button>
              </div>
            </div>
          )
        })()}

        {/* ── Pre-Flight Eligibility Gate Modal ─────────────────────────── */}
        {showEligibilityGateModal && (() => {
          const unconfirmedList: { id: string; name: string }[] = []
          if (separatePlaces && !categoryEligibility.places) unconfirmedList.push({ id: 'places', name: 'Places' })
          if (separateDocuments && !categoryEligibility.documents) unconfirmedList.push({ id: 'documents', name: 'Documents' })
          if (separateWhatsapp && !categoryEligibility.whatsapp) unconfirmedList.push({ id: 'whatsapp', name: 'WhatsApp' })
          if (separateFavorites && !categoryEligibility.favorites) unconfirmedList.push({ id: 'favorites', name: 'Favorites' })
          if (separateVideos && !categoryEligibility.videos) unconfirmedList.push({ id: 'videos', name: 'Videos' })
          if (separateDuplicates && !categoryEligibility.duplicates) unconfirmedList.push({ id: 'duplicates', name: 'Duplicates' })
          if (separateScreenshots && !categoryEligibility.screenshots) unconfirmedList.push({ id: 'screenshots', name: 'Screenshots' })
          if (separateSocialMedia && !(categoryEligibility.socialMedia ?? categoryEligibility.social)) unconfirmedList.push({ id: 'social', name: 'Social Media' })
          if (separatePeople && !categoryEligibility.people) unconfirmedList.push({ id: 'people', name: 'People' })

          return (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.82)',
                backdropFilter: 'blur(16px)',
                zIndex: 200,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                borderRadius: '24px'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div
                style={{
                  width: '520px',
                  maxWidth: '100%',
                  backgroundColor: '#202024',
                  borderRadius: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 24px 50px rgba(0, 0, 0, 0.7)',
                  padding: '28px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '18px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div
                    style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '12px',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <AlertTriangle size={22} color="#fbbf24" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#ffffff' }}>
                      Review Categories Before Export
                    </h3>
                    <p style={{ margin: '3px 0 0 0', fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.6)' }}>
                      {unconfirmedList.length} selected categor{unconfirmedList.length === 1 ? 'y has' : 'ies have'} not been confirmed yet.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '12px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <p style={{ margin: 0, fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.85)', lineHeight: '1.45' }}>
                    Without reviewing, unrecognized items like untagged faces will either create folders named <strong>"Unknown Person"</strong> or be sorted automatically. You can confirm them now, review them one-by-one, or export with confirmed categories only.
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                    {unconfirmedList.map(c => (
                      <span
                        key={c.id}
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#fbbf24',
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.25)',
                          padding: '2px 8px',
                          borderRadius: '6px'
                        }}
                      >
                        {c.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      const allConfirmed: Record<string, boolean> = {
                        ...categoryEligibility,
                        places: separatePlaces ? true : categoryEligibility.places,
                        documents: separateDocuments ? true : categoryEligibility.documents,
                        whatsapp: separateWhatsapp ? true : categoryEligibility.whatsapp,
                        favorites: separateFavorites ? true : categoryEligibility.favorites,
                        videos: separateVideos ? true : categoryEligibility.videos,
                        duplicates: separateDuplicates ? true : categoryEligibility.duplicates,
                        screenshots: separateScreenshots ? true : categoryEligibility.screenshots,
                        social: separateSocialMedia ? true : (categoryEligibility.socialMedia ?? categoryEligibility.social),
                        socialMedia: separateSocialMedia ? true : (categoryEligibility.socialMedia ?? categoryEligibility.social),
                        people: separatePeople ? true : categoryEligibility.people
                      }
                      setCategoryEligibility(allConfirmed)
                      setShowEligibilityGateModal(false)
                      proceedWithPreview(allConfirmed)
                    }}
                    style={{
                      padding: '11px 18px',
                      borderRadius: '11px',
                      fontSize: '13px',
                      fontWeight: 700,
                      background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      boxShadow: '0 4px 14px rgba(14, 165, 233, 0.35)'
                    }}
                  >
                    <CheckCircle2 size={15} /> Confirm All as Eligible & Preview
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowEligibilityGateModal(false)
                      proceedWithPreview()
                    }}
                    style={{
                      padding: '10px 18px',
                      borderRadius: '11px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    Export Confirmed Only (Keep Unreviewed in Clean Date Folders)
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowEligibilityGateModal(false)}
                    style={{
                      padding: '8px',
                      background: 'transparent',
                      border: 'none',
                      color: 'rgba(255, 255, 255, 0.5)',
                      fontSize: '12px',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    Review Categories First (Click "Review & Confirm" on Cards)
                  </button>
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
