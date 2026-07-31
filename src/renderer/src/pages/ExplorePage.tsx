import React, { useEffect, useState, useRef } from 'react'
import { MapPin, Users, FileText, Smartphone, Plus, UserCheck, HardDrive, Trash2, ScanText, Folder, ChevronLeft } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import { getThumbnailUrl, getOriginalUrl, formatDate, formatFileSize } from '../utils/helpers'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import { scanPhotosForFaces, stopScanning, ScanProgress, subscribeToFaceScan, setOnPersonFound } from '../services/FaceScanner'
import { analyzePhotos, stopAnalyzing, AnalysisProgress } from '../services/PhotoAnalyzer'
import { scanDocuments, stopDocumentScanning, DocumentScanProgress, subscribeToDocScan, setOnDocumentFound } from '../services/DocumentScanner'


interface GeoPhoto {
  photo: Photo
  lat: number
  lng: number
  location_name?: string | null
}

interface Person {
  id: number
  name: string
  cover_photo_id: number | null
  photo_count?: number
  cover_thumbnail?: string | null
  cover_face_base64?: string | null
}

export default function ExplorePage() {
  const { state, refreshPhotos } = usePhotos()
  const { showToast } = useApp()
  const [tab, setTab] = useState<'map' | 'people' | 'screenshots' | 'documents' | 'utilities'>('map')

  // Places state
  const [geoPhotos, setGeoPhotos] = useState<GeoPhoto[]>([])
  const [locationProgress, setLocationProgress] = useState<any>(null)
  const [selectedLocationGroup, setSelectedLocationGroup] = useState<string | null>(null)

  // People state
  const [people, setPeople] = useState<Person[]>([])
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [personPhotos, setPersonPhotos] = useState<Photo[]>([])
  const [namingModal, setNamingModal] = useState(false)
  const [renamingPersonId, setRenamingPersonId] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null)
  
  // Merge state
  const [mergeSuggestions, setMergeSuggestions] = useState<any[]>([])
  const [currentMergeIndex, setCurrentMergeIndex] = useState(0)
  const [showMergeModal, setShowMergeModal] = useState(false)

  // Utilities state
  const [utilityData, setUtilityData] = useState<any>(null)
  const [selectedUtilityPhotos, setSelectedUtilityPhotos] = useState<Set<number>>(new Set())
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null)
  const [docScanProgress, setDocScanProgress] = useState<DocumentScanProgress | null>(null)
  const [selectedDocCategory, setSelectedDocCategory] = useState<string | null>(null)

  // Load Geo Photos
  useEffect(() => {
    async function loadGeoPhotos() {
      try {
        const geoData = await window.photoVault.getGeoPhotos()
        const list: GeoPhoto[] = geoData.map((data: any) => ({
          photo: data,
          lat: data.gps_lat,
          lng: data.gps_lon,
          location_name: data.location_name
        }))
        setGeoPhotos(list)
      } catch (err) {
        console.error('Failed to load geo photos', err)
      }
    }
    loadGeoPhotos()
  }, [state.photos])

  // Subscribe to Location Scan
  useEffect(() => {
    const cleanup = window.photoVault.onLocationScanProgress((progress: any) => {
      setLocationProgress(progress)
      if (progress.status === 'Completed' || progress.status === 'Stopped') {
        // reload geo photos to get the newly mapped location names
        window.photoVault.getGeoPhotos().then(geoData => {
          setGeoPhotos(geoData.map((data: any) => ({
            photo: data,
            lat: data.gps_lat,
            lng: data.gps_lon,
            location_name: data.location_name
          })))
        })
      }
    })
    return cleanup
  }, [])

  // Load People
  useEffect(() => {
    loadPeople()
  }, [])

  async function loadPeople() {
    try {
      const list = await window.photoVault.getPeople()
      setPeople(list)
    } catch {}
  }

  async function handleDeletePerson(personId: number) {
    if (confirm('Are you sure you want to delete this person and all their tags?')) {
      await window.photoVault.deletePerson(personId)
      loadPeople()
    }
  }

  async function handleStartLocationScan() {
    await window.photoVault.startLocationScan()
  }

  async function handleResetLocationScan() {
    if (confirm('This will delete all identified locations and rescan your entire library. Are you sure?')) {
      await window.photoVault.resetLocationScanData()
      refreshPhotos()
      showToast('Location data reset. Starting fresh scan...')
      handleStartLocationScan()
    }
  }

  async function handleStopLocationScan() {
    await window.photoVault.stopLocationScan()
  }

  const locationGroups = React.useMemo(() => {
    const groups: Record<string, Photo[]> = {}
    geoPhotos.forEach(item => {
      const p = item.photo
      const year = p.created_at.split('-')[0]
      const loc = item.location_name || 'Unknown Location'
      const key = `${loc} (${year})`
      if (!groups[key]) groups[key] = []
      groups[key].push(p)
    })
    return Object.keys(groups).sort().map(key => ({
      name: key,
      photos: groups[key]
    }))
  }, [geoPhotos])

  async function handleSelectPerson(p: Person) {
    setSelectedPerson(p)
    try {
      const photos = await window.photoVault.getPhotosByPerson(p.id)
      setPersonPhotos(photos)
    } catch {
      setPersonPhotos([])
    }
  }

  async function handleCreatePerson() {
    if (!newName.trim()) return
    if (renamingPersonId) {
      await window.photoVault.updatePersonName(renamingPersonId, newName.trim())
      showToast('Person renamed')
    } else {
      await window.photoVault.createPerson(newName.trim())
      showToast('Person added to People')
    }
    setNewName('')
    setRenamingPersonId(null)
    setNamingModal(false)
    loadPeople()
    if (selectedPerson && selectedPerson.id === renamingPersonId) {
      setSelectedPerson({ ...selectedPerson, name: newName.trim() })
    }
  }

  // Subscribe to global face scan progress
  useEffect(() => {
    setOnPersonFound(() => {
      loadPeople()
    })
    const unsubscribe = subscribeToFaceScan((progress) => {
      setScanProgress(progress)
      if (progress && !progress.isScanning && progress.scannedCount > 0) {
        showToast('Face scanning complete!')
      }
    })
    return () => {
      unsubscribe()
      setOnPersonFound(null)
    }
  }, [])

  function handleStartScan() {
    scanPhotosForFaces()
  }

  async function handleResetScan() {
    if (confirm('This will delete all identified people and face tags, and rescan your entire library from scratch with improved accuracy settings. Are you sure?')) {
      await window.photoVault.resetFaceScanData()
      setPeople([])
      setSelectedPerson(null)
      showToast('Face data reset. Starting fresh scan...')
      handleStartScan()
    }
  }

  async function handleFindMergeSuggestions() {
    showToast('Scanning for duplicate faces...')
    const suggestions = await window.photoVault.getMergeSuggestions()
    if (suggestions.length === 0) {
      showToast('No similar faces found.')
    } else {
      setMergeSuggestions(suggestions)
      setCurrentMergeIndex(0)
      setShowMergeModal(true)
    }
  }

  async function handleApproveMerge(primaryId: number, secondaryId: number) {
    await window.photoVault.mergePeople(primaryId, secondaryId)
    showToast('People merged successfully')
    
    // Move to next suggestion
    if (currentMergeIndex < mergeSuggestions.length - 1) {
      setCurrentMergeIndex(currentMergeIndex + 1)
    } else {
      setShowMergeModal(false)
      setMergeSuggestions([])
      loadPeople()
    }
  }

  function handleSkipMerge() {
    if (currentMergeIndex < mergeSuggestions.length - 1) {
      setCurrentMergeIndex(currentMergeIndex + 1)
    } else {
      setShowMergeModal(false)
      setMergeSuggestions([])
      loadPeople() // Reload in case we merged some earlier ones
    }
  }

  // Load Utilities Data
  useEffect(() => {
    if (tab === 'utilities') {
      loadUtilities()
    }
  }, [tab])

  async function loadUtilities() {
    try {
      const data = await window.photoVault.getUtilitiesData()
      setUtilityData(data)
    } catch (err) {
      console.error(err)
    }
  }

  const junkBytes = React.useMemo(() => {
    if (!utilityData) return 0
    let total = 0
    if (utilityData.blurry) {
      utilityData.blurry.forEach((p: any) => { total += p.file_size || 0 })
    }
    if (utilityData.duplicates) {
      utilityData.duplicates.forEach((group: any) => {
        for (let i = 1; i < group.length; i++) {
          total += group[i].file_size || 0
        }
      })
    }
    return total
  }, [utilityData])

  async function handleResetUtilityScan() {
    if (confirm('This will delete all blur scores and duplicate data, and rescan your entire library. Are you sure?')) {
      await window.photoVault.resetUtilityScanData()
      loadUtilities()
      showToast('Deep Scan Engine data reset. Starting fresh scan...')
      handleStartAnalysis()
    }
  }

  async function handleStartAnalysis() {
    setAnalysisProgress({ analyzedCount: 0, totalCount: 1, isAnalyzing: true })
    analyzePhotos((progress) => {
      setAnalysisProgress(progress)
      if (!progress.isAnalyzing) {
        setAnalysisProgress(null)
        loadUtilities()
        showToast('Deep scan complete!')
      }
    })
  }

  async function handleTrashUtilityPhotos(ids: number[]) {
    if (ids.length === 0) return
    const bytesDeleted = ids.reduce((sum, id) => {
      const p = state.photos.find(photo => photo.id === id)
      return sum + (p?.file_size || 0)
    }, 0)
    await window.photoVault.trash(ids)
    refreshPhotos()
    loadUtilities()
    setSelectedUtilityPhotos(new Set())
    showToast(`${ids.length} item${ids.length > 1 ? 's' : ''} (${formatFileSize(bytesDeleted)}) moved to Trash`)
  }

  function toggleUtilitySelection(id: number) {
    const next = new Set(selectedUtilityPhotos)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedUtilityPhotos(next)
  }

  // Subscribe to global doc scan progress
  useEffect(() => {
    setOnDocumentFound(() => {
      refreshPhotos()
    })
    const unsubscribe = subscribeToDocScan((progress) => {
      setDocScanProgress(progress)
      if (progress && !progress.isScanning && progress.scannedCount > 0) {
        showToast('Document scanning complete!')
      }
    })
    return () => {
      unsubscribe()
      setOnDocumentFound(null)
    }
  }, [refreshPhotos])

  async function handleStartDocScan() {
    scanDocuments()
  }

  async function handleResetDocScan() {
    if (confirm('This will delete all OCR document data and rescan your entire library. Are you sure?')) {
      await window.photoVault.resetDocumentScanData()
      refreshPhotos()
      showToast('Document data reset. Starting fresh scan...')
      handleStartDocScan()
    }
  }

  function handleRefreshScreenshots() {
    refreshPhotos()
    showToast('Screenshots refreshed!')
  }

  const screenshots = state.photos.filter(p => {
    if (!p.filename) return false
    const lowerName = p.filename.toLowerCase()
    
    // Explicit filename match
    if (
      lowerName.includes('screenshot') ||
      lowerName.includes('capture') ||
      lowerName.includes('screen') ||
      lowerName.includes('screencap')
    ) {
      return true
    }

    // Heuristic: Mobile screenshots (like iOS) are often PNGs with a very tall/wide aspect ratio (e.g. 19.5:9 => ~2.16, 16:9 => ~1.77)
    if (lowerName.endsWith('.png') && p.width && p.height) {
      const aspectRatio = p.height > p.width ? p.height / p.width : p.width / p.height
      // Standard photos are 4:3 (1.33) or 3:2 (1.5). Screenshots are usually 16:9 (1.77) or taller.
      if (aspectRatio >= 1.7) {
        return true
      }
    }

    return false
  })

  const documents = state.photos.filter(p =>
    p.is_document === 1 ||
    (p.mime_type && (p.mime_type.includes('pdf') || p.mime_type.includes('text') || p.mime_type.includes('word') || p.mime_type.includes('document'))) ||
    (p.filename && (
      p.filename.toLowerCase().includes('doc') ||
      p.filename.toLowerCase().includes('scan') ||
      p.filename.toLowerCase().includes('receipt') ||
      p.filename.toLowerCase().includes('.txt') ||
      p.filename.toLowerCase().includes('aadhaar') ||
      p.filename.toLowerCase().includes('aadhar') ||
      p.filename.toLowerCase().includes('adhar') ||
      p.filename.toLowerCase().includes('id_card') ||
      p.filename.toLowerCase().includes('idcard') ||
      p.filename.toLowerCase().includes('pan_card') ||
      p.filename.toLowerCase().includes('pancard') ||
      p.filename.toLowerCase().includes('passport') ||
      p.filename.toLowerCase().includes('license')
    ))
  )

  const docCategories = [
    'Government & Identity', 'Banking & Finance', 'Medical', 'Education',
    'Employment', 'Property', 'Travel', 'Utility Bills',
    'Business & Commerce', 'Legal', 'Unknown / Other'
  ]

  return (
    <div className="explore-page">
      {/* Sub-header Navigation Chips */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        <button className={`btn ${tab === 'map' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTab('map'); setSelectedPerson(null) }}>
          <MapPin size={16} /> Places Map ({geoPhotos.length})
        </button>
        <button className={`btn ${tab === 'people' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('people')}>
          <Users size={16} /> 
          People
          {scanProgress?.isScanning && scanProgress.totalCount > 0 ? (
            ` (${Math.round((scanProgress.scannedCount / scanProgress.totalCount) * 100)}%)`
          ) : (
            ` (${people.length})`
          )}
        </button>
        <button className={`btn ${tab === 'screenshots' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTab('screenshots'); setSelectedPerson(null) }}>
          <Smartphone size={16} /> Screenshots ({screenshots.length})
        </button>
        <button className={`btn ${tab === 'documents' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTab('documents'); setSelectedPerson(null) }}>
          <FileText size={16} /> 
          Documents
          {docScanProgress?.isScanning && docScanProgress.totalCount > 0 ? (
            ` (${Math.round((docScanProgress.scannedCount / docScanProgress.totalCount) * 100)}%)`
          ) : (
            ` (${documents.length})`
          )}
        </button>
        <button className={`btn ${tab === 'utilities' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setTab('utilities'); setSelectedPerson(null) }}>
          <HardDrive size={16} /> Utilities & Storage Cleanup
        </button>
      </div>

      <SelectionBar />

      {/* Tab 1: Places (Folders) */}
      {tab === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {!selectedLocationGroup && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={18} />
                  Location Folders (Reverse Geocoding)
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                  Automatically detect the city/state of your photos using GPS coordinates.
                </p>
                {locationProgress && locationProgress.isScanning && (
                  <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--primary)' }}>
                    Scanning {locationProgress.scannedCount} of {locationProgress.totalCount}... 
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>{locationProgress.status}</span>
                  </div>
                )}
              </div>
              
              {locationProgress?.isScanning ? (
                <button className="btn btn-secondary" onClick={handleStopLocationScan}>Stop Scan</button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" onClick={handleResetLocationScan}>Reset & Rescan Locations</button>
                  <button className="btn btn-primary" onClick={handleStartLocationScan}>Scan Locations</button>
                </div>
              )}
            </div>
          )}

          {selectedLocationGroup ? (
            <div>
              <button 
                className="btn btn-ghost" 
                style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => setSelectedLocationGroup(null)}
              >
                <ChevronLeft size={16} /> Back to Places
              </button>
              <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>{selectedLocationGroup}</h2>
              <PhotoGrid 
                photos={locationGroups.find(g => g.name === selectedLocationGroup)?.photos || []} 
                showDateHeaders={true} 
              />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {locationGroups.map(group => (
                <div 
                  key={group.name}
                  onClick={() => setSelectedLocationGroup(group.name)}
                  style={{ 
                    background: 'var(--bg-secondary)', 
                    padding: '24px', 
                    borderRadius: '12px', 
                    cursor: 'pointer',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  <MapPin size={48} color="var(--primary)" fill="var(--primary)" style={{ opacity: 0.2 }} />
                  <div style={{ textAlign: 'center' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600 }}>{group.name}</h4>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{group.photos.length} photos</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: People & Pets */}
      {tab === 'people' && (
        <div>
          {selectedPerson ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <button className="btn btn-ghost" onClick={() => setSelectedPerson(null)}>← Back to People</button>
                <h2 style={{ fontSize: '20px', fontWeight: 700 }}>{selectedPerson.name}</h2>
              </div>
              <PhotoGrid photos={personPhotos} showDateHeaders={true} />
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {scanProgress?.isScanning ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        Scanning {scanProgress.scannedCount} / {scanProgress.totalCount}
                      </span>
                      <button className="btn btn-secondary" onClick={() => stopScanning()}>Stop</button>
                    </div>
                  ) : (
                    <>
                      <button className="btn btn-primary" onClick={handleStartScan}>
                        <UserCheck size={16} /> Scan for Faces
                      </button>
                      <button className="btn btn-ghost" onClick={handleFindMergeSuggestions} style={{ fontSize: '12px' }}>
                        Find Duplicates
                      </button>
                      <button className="btn btn-ghost" onClick={handleResetScan} style={{ fontSize: '12px' }}>
                        Reset & Rescan All
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '16px' }}>
                {people.map(p => (
                  <div
                    key={p.id}
                    onClick={() => handleSelectPerson(p)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
                      background: 'var(--bg-secondary)', padding: '16px', borderRadius: '16px', border: '1px solid var(--border)',
                      transition: 'transform 150ms ease'
                    }}
                    className="person-card"
                  >
                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', background: 'var(--bg-tertiary)', marginBottom: '8px' }}>
                      {p.cover_face_base64 ? (
                        <img src={p.cover_face_base64} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : p.cover_thumbnail ? (
                        <img src={getThumbnailUrl(p.cover_thumbnail)} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                          <Users size={32} />
                        </div>
                      )}
                    </div>
                    <span style={{ fontWeight: 600, fontSize: '14px', textAlign: 'center' }}>{p.name}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>{p.photo_count || 0} photos</span>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button 
                        className="btn btn-ghost" 
                        style={{ padding: '4px 8px', fontSize: '12px' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          setRenamingPersonId(p.id)
                          setNewName(p.name)
                          setNamingModal(true)
                        }}
                      >
                        Rename
                      </button>
                      <button 
                        className="btn btn-ghost" 
                        style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--danger, #ff4d4f)' }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeletePerson(p.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Screenshots */}
      {tab === 'screenshots' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Smartphone size={18} />
                Screenshots ({screenshots.length})
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                Automatically identified screenshots and screen captures from your library.
              </p>
            </div>
            <button className="btn btn-ghost" onClick={handleRefreshScreenshots}>Refresh Screenshots</button>
          </div>
          <PhotoGrid photos={screenshots} showDateHeaders={true} />
        </div>
      )}

      {/* Tab 4: Documents */}
      {tab === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {!selectedDocCategory && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border)' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ScanText size={18} />
                  Smart Document Scanner (OCR)
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '4px' }}>
                  Automatically read the text inside your images to sort them into 11 smart folders!
                </p>
                {docScanProgress && docScanProgress.isScanning && (
                  <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--primary)' }}>
                    {docScanProgress.phase === 'prefilter' ? (
                      <span style={{ display: 'inline-block', background: 'rgba(99, 102, 241, 0.1)', color: 'rgb(99, 102, 241)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, marginRight: '8px' }}>⚡ Phase 1</span>
                    ) : docScanProgress.phase === 'ocr' ? (
                      <span style={{ display: 'inline-block', background: 'rgba(34, 197, 94, 0.1)', color: 'rgb(34, 197, 94)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600, marginRight: '8px' }}>🔍 Phase 2</span>
                    ) : null}
                    {docScanProgress.scannedCount}/{docScanProgress.totalCount}
                    <span style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }}>{docScanProgress.status}</span>
                  </div>
                )}
              </div>
              
              {docScanProgress?.isScanning ? (
                <button className="btn btn-secondary" onClick={stopDocumentScanning}>Stop Scan</button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" onClick={handleResetDocScan}>Reset & Rescan Documents</button>
                  <button className="btn btn-primary" onClick={handleStartDocScan}>Start OCR Scan</button>
                </div>
              )}
            </div>
          )}

          {selectedDocCategory ? (
            <div>
              <button 
                className="btn btn-ghost" 
                style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
                onClick={() => setSelectedDocCategory(null)}
              >
                <ChevronLeft size={16} /> Back to Folders
              </button>
              <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>{selectedDocCategory}</h2>
              <PhotoGrid 
                photos={documents.filter(p => p.document_category === selectedDocCategory || (!p.document_category && selectedDocCategory === 'Unknown / Other'))} 
                showDateHeaders={true} 
              />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
              {docCategories.map(cat => {
                const count = documents.filter(p => p.document_category === cat || (!p.document_category && cat === 'Unknown / Other')).length
                return (
                  <div 
                    key={cat}
                    onClick={() => setSelectedDocCategory(cat)}
                    style={{ 
                      background: 'var(--bg-secondary)', 
                      padding: '24px', 
                      borderRadius: '12px', 
                      cursor: 'pointer',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'transform 0.2s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    <Folder size={48} color="var(--primary)" fill="var(--primary)" style={{ opacity: 0.2 }} />
                    <div style={{ textAlign: 'center' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 600 }}>{cat}</h4>
                      <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{count} documents</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Utilities & Storage Cleanup */}
      {tab === 'utilities' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ background: 'var(--bg-secondary)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Deep Scan Engine</h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '600px' }}>
                Run a deep scan to detect extremely blurry photos and calculate perceptual hashes to find visually similar photos.
              </p>
              {junkBytes > 0 && (
                <div style={{ marginTop: '12px', display: 'inline-block', background: 'rgba(34, 197, 94, 0.1)', color: 'rgb(34, 197, 94)', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 600 }}>
                  Potential Space Savings: {formatFileSize(junkBytes)}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {analysisProgress && (
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Scanning {analysisProgress.analyzedCount} / {analysisProgress.totalCount}
                </span>
              )}
              {analysisProgress?.isAnalyzing ? (
                <button className="btn btn-secondary" onClick={stopAnalyzing}>Stop Scan</button>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-ghost" onClick={handleResetUtilityScan}>Reset & Rescan All</button>
                  <button className="btn btn-primary" onClick={handleStartAnalysis}>Run Deep Scan</button>
                </div>
              )}
            </div>
          </div>

          {!utilityData ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading analysis data...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* WhatsApp Section */}
              {utilityData.whatsapp.length > 0 && (
                <div className="google-storage-section">
                  <div className="google-storage-header">
                    <h3 className="google-storage-title">WhatsApp Media</h3>
                    <button className="btn btn-secondary" style={{ borderRadius: '100px', padding: '6px 16px' }} onClick={() => handleTrashUtilityPhotos(utilityData.whatsapp.map((p: any) => p.id))}>Delete all {utilityData.whatsapp.length}</button>
                  </div>
                  <div className="google-storage-grid">
                    {utilityData.whatsapp.slice(0, 30).map((p: any) => (
                      <div key={p.id} className="google-tiny-thumb-wrapper">
                           <img src={getThumbnailUrl(p.thumbnail_path)} className="google-tiny-thumb" />
                        <div className="google-overlay-btn" onClick={() => handleTrashUtilityPhotos([p.id])}>
                          <Trash2 size={16} />
                        </div>
                      </div>
                    ))}
                    {utilityData.whatsapp.length > 30 && <div className="google-tiny-thumb-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 500 }}>+{utilityData.whatsapp.length - 30}</div>}
                  </div>
                </div>
              )}

              {/* Blurry Section */}
              {utilityData.blurry.length > 0 && (
                <div className="google-storage-section">
                  <div className="google-storage-header">
                    <h3 className="google-storage-title">Blurry Photos</h3>
                    <button className="btn btn-secondary" style={{ borderRadius: '100px', padding: '6px 16px' }} onClick={() => handleTrashUtilityPhotos(utilityData.blurry.map((p: any) => p.id))}>Delete all {utilityData.blurry.length}</button>
                  </div>
                  <div className="google-storage-grid">
                    {utilityData.blurry.slice(0, 30).map((p: any) => (
                      <div key={p.id} className="google-tiny-thumb-wrapper">
                           <img src={getThumbnailUrl(p.thumbnail_path)} className="google-tiny-thumb" />
                        <div className="google-overlay-btn" onClick={() => handleTrashUtilityPhotos([p.id])}>
                          <Trash2 size={16} />
                        </div>
                      </div>
                    ))}
                    {utilityData.blurry.length > 30 && <div className="google-tiny-thumb-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 500 }}>+{utilityData.blurry.length - 30}</div>}
                  </div>
                </div>
              )}

              {/* Exact Duplicates */}
              {utilityData.duplicates.length > 0 && (
                <div className="google-storage-section">
                  <div className="google-storage-header">
                    <h3 className="google-storage-title">Exact Duplicates</h3>
                    <button className="btn btn-secondary" style={{ borderRadius: '100px', padding: '6px 16px' }} onClick={() => {
                      const toDelete = utilityData.duplicates.flatMap((g: any) => g.slice(1).map((p: any) => p.id))
                      handleTrashUtilityPhotos(toDelete)
                    }}>Keep 1 of each</button>
                  </div>
                  <div>
                    {utilityData.duplicates.map((group: any, idx: number) => (
                      <div key={idx} className="google-group-pill">
                        {group.map((p: any, i: number) => (
                          <div key={p.id} className="google-tiny-thumb-wrapper" style={{ border: i === 0 ? '2px solid var(--primary)' : 'none' }}>
                               <img src={getThumbnailUrl(p.thumbnail_path)} className="google-tiny-thumb" />
                            {i === 0 && <div className="best-label">ORIG</div>}
                            {i > 0 && <div className="google-overlay-btn" onClick={() => handleTrashUtilityPhotos([p.id])}><Trash2 size={14} /></div>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {/* Similar Photos */}
              {utilityData.similar.length > 0 && (
                <div className="google-storage-section">
                  <div className="google-storage-header">
                    <h3 className="google-storage-title">Similar Photos</h3>
                    <button className="btn btn-secondary" style={{ borderRadius: '100px', padding: '6px 16px' }} onClick={() => {
                      const toDelete = utilityData.similar.flatMap((g: any) => g.slice(1).map((p: any) => p.id))
                      handleTrashUtilityPhotos(toDelete)
                    }}>Keep 1 of each</button>
                  </div>
                  <div>
                    {utilityData.similar.map((group: any, idx: number) => (
                      <div key={idx} className="google-group-pill">
                        {group.map((p: any, i: number) => (
                          <div key={p.id} className="google-tiny-thumb-wrapper" style={{ border: i === 0 ? '2px solid var(--primary)' : 'none' }}>
                               <img src={getThumbnailUrl(p.thumbnail_path)} className="google-tiny-thumb" />
                            {i === 0 && <div className="best-label">BEST</div>}
                            {i > 0 && <div className="google-overlay-btn" onClick={() => handleTrashUtilityPhotos([p.id])}><Trash2 size={14} /></div>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Person Modal */}
      {namingModal && (
        <div className="modal-overlay" onClick={() => setNamingModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Label a Person</h3>
            </div>
            <div className="modal-body">
              <input
                className="modal-input"
                placeholder="Person's name (e.g. Sarah, Alex, Mom)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreatePerson()}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setNamingModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreatePerson}>Save Person</button>
            </div>
          </div>
        </div>
      )}

      {/* Merge Suggestions Modal */}
      {showMergeModal && mergeSuggestions.length > 0 && (
        <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="modal" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Merge Suggestion ({currentMergeIndex + 1} of {mergeSuggestions.length})</h3>
            </div>
            <div className="modal-body" style={{ textAlign: 'center' }}>
              <p style={{ marginBottom: '24px', color: 'var(--text-secondary)' }}>
                These two profiles look very similar ({mergeSuggestions[currentMergeIndex].confidence}% match). Are they the same person?
              </p>
              
              <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', marginBottom: '32px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '45%' }}>
                  <div style={{ width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--border)' }}>
                    {mergeSuggestions[currentMergeIndex].personA.cover_thumbnail ? (
                      <img src={getThumbnailUrl(mergeSuggestions[currentMergeIndex].personA.cover_thumbnail)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}><Users size={40} /></div>
                    )}
                  </div>
                  <strong style={{ fontSize: '16px' }}>{mergeSuggestions[currentMergeIndex].personA.name}</strong>
                  <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{mergeSuggestions[currentMergeIndex].personA.photo_count || 0} photos</span>
                </div>
                
                <div style={{ fontSize: '24px', color: 'var(--text-tertiary)' }}>?</div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '45%' }}>
                  <div style={{ width: '120px', height: '120px', borderRadius: '50%', overflow: 'hidden', border: '3px solid var(--border)' }}>
                    {mergeSuggestions[currentMergeIndex].personB.cover_thumbnail ? (
                      <img src={getThumbnailUrl(mergeSuggestions[currentMergeIndex].personB.cover_thumbnail)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-tertiary)' }}><Users size={40} /></div>
                    )}
                  </div>
                  <strong style={{ fontSize: '16px' }}>{mergeSuggestions[currentMergeIndex].personB.name}</strong>
                  <span style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>{mergeSuggestions[currentMergeIndex].personB.photo_count || 0} photos</span>
                </div>
              </div>
            </div>
            
            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-ghost" onClick={() => { setShowMergeModal(false); setMergeSuggestions([]); loadPeople() }}>Cancel</button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-secondary" onClick={handleSkipMerge}>Skip</button>
                <button className="btn btn-primary" onClick={() => handleApproveMerge(mergeSuggestions[currentMergeIndex].personA.id, mergeSuggestions[currentMergeIndex].personB.id)}>
                  Yes, Merge Them
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
