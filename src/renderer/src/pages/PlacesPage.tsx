import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  MapPin, Grid, ChevronLeft, Sparkles, Compass, Globe,
  Navigation, Edit2, FolderPlus, Landmark as LandmarkIcon,
  Calendar, Layers, Check, ExternalLink, Image as ImageIcon
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import EmptyState from '../components/EmptyState'
import { getThumbnailUrl } from '../utils/helpers'

interface GeoPhoto {
  photo: Photo
  lat: number
  lng: number
  location_name?: string | null
}

export interface PlaceFolder {
  name: string            // e.g. "Agra 2021" or "Delhi 2021"
  city: string            // e.g. "Agra"
  year: string            // e.g. "2021"
  photos: Photo[]
  coverPhoto: Photo
  landmarks: string[]     // e.g. ["Taj Mahal", "Agra Fort"]
  lat?: number
  lng?: number
  dateRangeStr?: string
}

export default function PlacesPage() {
  const { state: photoState, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const [viewMode, setViewMode] = useState<'folders' | 'map'>('folders')
  const [geoPhotos, setGeoPhotos] = useState<GeoPhoto[]>([])
  const [selectedFolder, setSelectedFolder] = useState<PlaceFolder | null>(null)
  const [selectedLandmarkFilter, setSelectedLandmarkFilter] = useState<string | null>(null)
  const [folderViewTab, setFolderViewTab] = useState<'photos' | 'map'>('photos')
  const [locationProgress, setLocationProgress] = useState<any>(null)
  const [isScanning, setIsScanning] = useState(false)

  // Rename Location Modal State
  const [editingFolder, setEditingFolder] = useState<PlaceFolder | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)

  // Load geo photos
  useEffect(() => {
    loadGeoData()
  }, [photoState.photos.length])

  async function loadGeoData() {
    try {
      if (window.photoVault?.getGeoPhotos) {
        const geoData = await window.photoVault.getGeoPhotos()
        const list: GeoPhoto[] = (geoData || []).map((data: any) => ({
          photo: data,
          lat: data.gps_lat,
          lng: data.gps_lon,
          location_name: data.location_name
        }))
        setGeoPhotos(list)
      }
    } catch (err) {
      console.error('Failed to load geo photos:', err)
    }
  }

  // Subscribe to location scan progress
  useEffect(() => {
    if (window.photoVault?.onLocationScanProgress) {
      const cleanup = window.photoVault.onLocationScanProgress((progress: any) => {
        setLocationProgress(progress)
        setIsScanning(progress?.isScanning ?? false)
        if (progress?.status === 'Completed' || progress?.status?.startsWith('Successfully')) {
          loadGeoData()
          refreshPhotos()
        }
      })
      return cleanup
    }
    return undefined
  }, [])

  // ─── Build Place Folders (Strict Quality Filter: NO "Unknown Location" or System Folders) ──
  const placeFolders = useMemo<PlaceFolder[]>(() => {
    const foldersMap: Record<string, {
      city: string
      year: string
      photos: Photo[]
      landmarks: Set<string>
      lats: number[]
      lngs: number[]
    }> = {}

    for (const p of photoState.photos) {
      if (p.is_trashed) continue

      const rawLoc = p.location_name?.trim()
      if (!rawLoc || rawLoc === 'Unknown Location' || rawLoc === 'Geotagged Area') {
        continue
      }

      // Filter out accidental system folder names
      const lower = rawLoc.toLowerCase()
      if (lower.includes('vishw') || lower.includes('backup') || lower.includes('user') || lower.includes('iphone') || lower.includes('pro max')) {
        continue
      }

      // Parse City and Landmark (supports "Agra • Taj Mahal" or "Agra (Taj Mahal)" or "Agra")
      let city = rawLoc
      let landmark: string | null = null

      if (rawLoc.includes('•')) {
        const parts = rawLoc.split('•').map(s => s.trim())
        city = parts[0]
        landmark = parts[1] || null
      } else if (rawLoc.includes('(') && rawLoc.includes(')')) {
        const match = rawLoc.match(/^([^(]+)\s*\(([^)]+)\)/)
        if (match) {
          city = match[1].trim()
          landmark = match[2].trim()
        }
      }

      const year = p.created_at ? p.created_at.slice(0, 4) : 'Recent'
      const folderKey = `${city} ${year}`.trim()

      if (!foldersMap[folderKey]) {
        foldersMap[folderKey] = {
          city,
          year,
          photos: [],
          landmarks: new Set<string>(),
          lats: [],
          lngs: []
        }
      }

      foldersMap[folderKey].photos.push(p)
      if (landmark) {
        foldersMap[folderKey].landmarks.add(landmark)
      }

      // Match coordinates from geoPhotos if available
      const geo = geoPhotos.find(g => g.photo.id === p.id)
      if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
        foldersMap[folderKey].lats.push(geo.lat)
        foldersMap[folderKey].lngs.push(geo.lng)
      }
    }

    return Object.keys(foldersMap)
      .sort((a, b) => foldersMap[b].photos.length - foldersMap[a].photos.length)
      .map(key => {
        const data = foldersMap[key]
        const sortedPhotos = [...data.photos].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        const coverPhoto = sortedPhotos[0]

        // Calculate Date Range string (e.g. "Oct 14 – 15, 2021")
        let dateRangeStr = data.year
        if (sortedPhotos.length > 0 && sortedPhotos[0].created_at) {
          const firstDate = new Date(sortedPhotos[0].created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          const lastPhoto = sortedPhotos[sortedPhotos.length - 1]
          const lastDate = lastPhoto.created_at
            ? new Date(lastPhoto.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : firstDate
          dateRangeStr = firstDate === lastDate ? `${firstDate}, ${data.year}` : `${firstDate} – ${lastDate}, ${data.year}`
        }

        const avgLat = data.lats.length > 0 ? data.lats.reduce((a, b) => a + b, 0) / data.lats.length : undefined
        const avgLng = data.lngs.length > 0 ? data.lngs.reduce((a, b) => a + b, 0) / data.lngs.length : undefined

        return {
          name: key,
          city: data.city,
          year: data.year,
          photos: sortedPhotos,
          coverPhoto,
          landmarks: Array.from(data.landmarks),
          lat: avgLat,
          lng: avgLng,
          dateRangeStr
        }
      })
  }, [photoState.photos, geoPhotos])

  // Photos to display inside selected folder with landmark filter
  const displayedFolderPhotos = useMemo(() => {
    if (!selectedFolder) return []
    if (!selectedLandmarkFilter) return selectedFolder.photos
    return selectedFolder.photos.filter(p => {
      const loc = p.location_name || ''
      return loc.toLowerCase().includes(selectedLandmarkFilter.toLowerCase())
    })
  }, [selectedFolder, selectedLandmarkFilter])

  // ─── Leaflet Map Lifecycle ───────────────────────────────────────────────
  useEffect(() => {
    const isMapActive = viewMode === 'map' || (selectedFolder && folderViewTab === 'map')
    if (!isMapActive) return

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [20, 78],
          zoom: 5,
          minZoom: 2,
          maxZoom: 18,
          worldCopyJump: true
        })

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
          maxZoom: 19
        }).addTo(map)

        const markersGroup = L.layerGroup().addTo(map)
        mapInstanceRef.current = map
        markersLayerRef.current = markersGroup
      }

      const map = mapInstanceRef.current
      const markersLayer = markersLayerRef.current
      if (!map || !markersLayer) return

      markersLayer.clearLayers()

      // Target photos for map (either all geoPhotos or selected folder photos)
      const targetGeoPhotos = selectedFolder
        ? geoPhotos.filter(gp => selectedFolder.photos.some(p => p.id === gp.photo.id))
        : geoPhotos

      if (targetGeoPhotos.length > 0) {
        const bounds = L.latLngBounds([])

        // Cluster by coordinate radius (~500m precision)
        const clusters: Record<string, { lat: number; lng: number; photos: Photo[]; locName: string }> = {}
        for (const item of targetGeoPhotos) {
          const clusterKey = `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`
          if (!clusters[clusterKey]) {
            clusters[clusterKey] = {
              lat: item.lat,
              lng: item.lng,
              photos: [],
              locName: item.location_name || item.photo.location_name || 'Place'
            }
          }
          clusters[clusterKey].photos.push(item.photo)
        }

        Object.values(clusters).forEach(cluster => {
          bounds.extend([cluster.lat, cluster.lng])
          const cover = cluster.photos[0]
          const thumbUrl = getThumbnailUrl(cover.preview_path || cover.thumbnail_path || cover.file_path)

          const pinIcon = L.divIcon({
            className: 'custom-place-pin',
            html: `
              <div style="
                width: 46px;
                height: 46px;
                border-radius: 50%;
                border: 3px solid #0071e3;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
                overflow: hidden;
                background: #1c1c1e;
                position: relative;
                cursor: pointer;
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
              " onmouseover="this.style.transform='scale(1.18)'" onmouseout="this.style.transform='scale(1.0)'">
                <img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
                ${cluster.photos.length > 1 ? `
                  <span style="
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    background: #0071e3;
                    color: #ffffff;
                    font-size: 10px;
                    font-weight: 700;
                    padding: 1px 5px;
                    border-radius: 6px 0 0 0;
                  ">${cluster.photos.length}</span>
                ` : ''}
              </div>
            `,
            iconSize: [46, 46],
            iconAnchor: [23, 23]
          })

          const marker = L.marker([cluster.lat, cluster.lng], { icon: pinIcon })
          marker.on('click', () => {
            const folderMatch = placeFolders.find(f => f.photos.some(p => p.id === cover.id))
            if (folderMatch) {
              setSelectedFolder(folderMatch)
              setSelectedLandmarkFilter(null)
            }
          })

          marker.bindTooltip(`<b>${cluster.locName}</b><br/>${cluster.photos.length} photo${cluster.photos.length > 1 ? 's' : ''}`, {
            direction: 'top',
            offset: [0, -22]
          })

          markersLayer.addLayer(marker)
        })

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
        }
      }
    }, 120)

    return () => clearTimeout(timer)
  }, [viewMode, folderViewTab, selectedFolder, geoPhotos, placeFolders])

  const handleStartLocationScan = async () => {
    setIsScanning(true)
    try {
      if (window.photoVault?.startLocationScan) {
        await window.photoVault.startLocationScan()
        showToast('Scanning library with Landmark & Temporal Session Intelligence...')
      }
    } catch (err: any) {
      showToast(`Scan error: ${err?.message || err}`)
      setIsScanning(false)
    }
  }

  const handleStopLocationScan = async () => {
    try {
      if (window.photoVault?.stopLocationScan) {
        await window.photoVault.stopLocationScan()
        setIsScanning(false)
        showToast('Location scan stopped')
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || err}`)
    }
  }

  const handleSaveRename = async () => {
    if (!editingFolder || !renameValue.trim()) return
    const trimmed = renameValue.trim()

    try {
      const photoIds = editingFolder.photos.map(p => p.id)
      if (window.photoVault?.updateLocationName) {
        await window.photoVault.updateLocationName(photoIds, trimmed)
        showToast(`Place renamed to "${trimmed}"`)
        setEditingFolder(null)
        await loadGeoData()
        refreshPhotos()
        if (selectedFolder?.name === editingFolder.name) {
          setSelectedFolder({
            ...selectedFolder,
            name: `${trimmed} ${selectedFolder.year}`,
            city: trimmed
          })
        }
      }
    } catch (err: any) {
      showToast(`Error renaming place: ${err?.message || err}`)
    }
  }

  const handleOrganizeToDiskFolder = async (folder: PlaceFolder) => {
    try {
      if (!window.photoVault?.selectLargeFilesDestination || !window.photoVault?.moveLargeFiles) {
        showToast('Folder mover unavailable')
        return
      }

      const dest = await window.photoVault.selectLargeFilesDestination()
      if (!dest) return

      const folderName = folder.name.replace(/[/\\?%*:|"<>]/g, '-').trim()
      const targetDir = `${dest}/${folderName}`

      const fileIds = folder.photos.map(p => p.id)
      const res = await window.photoVault.moveLargeFiles({
        fileIds,
        destinationDir: targetDir,
        preserveRelativeSubpath: false,
        collisionStrategy: 'rename',
        updateDatabasePath: true
      })

      if (res.success) {
        showToast(`Moved ${res.movedCount} photos into "${folderName}" folder`)
        refreshPhotos()
        loadGeoData()
      } else {
        showToast(`Move completed with ${res.failedCount} failures`)
      }
    } catch (err: any) {
      showToast(`Error organizing to folder: ${err?.message || err}`)
    }
  }

  return (
    <div
      className="places-page-container"
      style={{
        padding: '28px 36px',
        maxWidth: '1600px',
        margin: '0 auto',
        minHeight: '100%',
        color: 'var(--text-primary)'
      }}
    >
      {/* ─── Apple-style Header Bar ──────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px'
        }}
      >
        {/* Left Title / Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {selectedFolder ? (
            <button
              type="button"
              onClick={() => {
                setSelectedFolder(null)
                setSelectedLandmarkFilter(null)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '9999px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-secondary)',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: 'var(--shadow-sm)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                e.currentTarget.style.transform = 'translateX(-2px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'
                e.currentTarget.style.transform = 'translateX(0)'
              }}
            >
              <ChevronLeft size={16} /> Places
            </button>
          ) : (
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #0071e3 0%, #42a5f5 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 14px rgba(0, 113, 227, 0.35)'
              }}
            >
              <MapPin size={22} />
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1
                style={{
                  fontSize: selectedFolder ? '24px' : '28px',
                  fontWeight: 800,
                  margin: 0,
                  letterSpacing: '-0.5px',
                  color: 'var(--text-primary)'
                }}
              >
                {selectedFolder ? selectedFolder.name : 'Places'}
              </h1>

              {selectedFolder && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingFolder(selectedFolder)
                    setRenameValue(selectedFolder.city)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '4px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    borderRadius: '6px'
                  }}
                  title="Rename Place"
                >
                  <Edit2 size={15} />
                </button>
              )}

              <span
                style={{
                  backgroundColor: 'rgba(0, 113, 227, 0.1)',
                  color: '#0071e3',
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '2px 9px',
                  borderRadius: '9999px'
                }}
              >
                {selectedFolder
                  ? `${displayedFolderPhotos.length} photo${displayedFolderPhotos.length === 1 ? '' : 's'}`
                  : `${placeFolders.length} place${placeFolders.length === 1 ? '' : 's'}`}
              </span>
            </div>

            {selectedFolder && selectedFolder.dateRangeStr && (
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
                {selectedFolder.dateRangeStr}
              </p>
            )}
          </div>
        </div>

        {/* Right Actions & Segmented Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {selectedFolder ? (
            <>
              {/* Folder View Segmented Control */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '9999px',
                  padding: '3px',
                  border: '1px solid var(--border)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setFolderViewTab('photos')}
                  style={{
                    padding: '5px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.2s ease',
                    backgroundColor: folderViewTab === 'photos' ? 'var(--bg-elevated)' : 'transparent',
                    color: folderViewTab === 'photos' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: folderViewTab === 'photos' ? 'var(--shadow-sm)' : 'none'
                  }}
                >
                  <Grid size={13} /> Photos
                </button>
                <button
                  type="button"
                  onClick={() => setFolderViewTab('map')}
                  style={{
                    padding: '5px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.2s ease',
                    backgroundColor: folderViewTab === 'map' ? 'var(--bg-elevated)' : 'transparent',
                    color: folderViewTab === 'map' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: folderViewTab === 'map' ? 'var(--shadow-sm)' : 'none'
                  }}
                >
                  <Globe size={13} /> Trip Map
                </button>
              </div>

              {/* Move to Disk Folder */}
              <button
                type="button"
                onClick={() => handleOrganizeToDiskFolder(selectedFolder)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 16px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: '#0071e3',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 113, 227, 0.35)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0077ed' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0071e3' }}
              >
                <FolderPlus size={14} /> Move to Disk Folder
              </button>
            </>
          ) : (
            <>
              {/* Main View Segmented Control */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-tertiary)',
                  borderRadius: '9999px',
                  padding: '3px',
                  border: '1px solid var(--border)'
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('folders')}
                  style={{
                    padding: '5px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.2s ease',
                    backgroundColor: viewMode === 'folders' ? 'var(--bg-elevated)' : 'transparent',
                    color: viewMode === 'folders' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: viewMode === 'folders' ? 'var(--shadow-sm)' : 'none'
                  }}
                >
                  <Grid size={13} /> Place Folders
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('map')}
                  style={{
                    padding: '5px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    transition: 'all 0.2s ease',
                    backgroundColor: viewMode === 'map' ? 'var(--bg-elevated)' : 'transparent',
                    color: viewMode === 'map' ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: viewMode === 'map' ? 'var(--shadow-sm)' : 'none'
                  }}
                >
                  <Globe size={13} /> World Map
                </button>
              </div>

              {/* Scan Trigger */}
              {isScanning ? (
                <button
                  type="button"
                  onClick={handleStopLocationScan}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '9999px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-secondary)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Stop Scan
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStartLocationScan}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 16px',
                    borderRadius: '9999px',
                    border: 'none',
                    backgroundColor: '#0071e3',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0, 113, 227, 0.35)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0077ed' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#0071e3' }}
                >
                  <Sparkles size={14} /> Scan Places
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Scanning Progress Banner (Apple Style Translucent) ───────────── */}
      {locationProgress && locationProgress.isScanning && (
        <div
          style={{
            backgroundColor: 'var(--bg-secondary)',
            backdropFilter: 'blur(20px)',
            padding: '14px 20px',
            borderRadius: '16px',
            border: '1px solid var(--border)',
            marginBottom: '22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Compass size={20} color="#0071e3" className="animate-spin" />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {locationProgress.status || 'Detecting landmarks and temporal photo sessions...'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Processed {locationProgress.scannedCount} of {locationProgress.totalCount} photos
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStopLocationScan}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              padding: '4px 8px'
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ─── Main Content Views ───────────────────────────────────────────── */}
      {selectedFolder ? (
        <div>
          {/* Landmark Filter Pills (Apple Style Filter Bar) */}
          {selectedFolder.landmarks.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px',
                flexWrap: 'wrap'
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedLandmarkFilter(null)}
                style={{
                  padding: '5px 14px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: selectedLandmarkFilter === null ? '#0071e3' : 'var(--border)',
                  backgroundColor: selectedLandmarkFilter === null ? '#0071e3' : 'var(--bg-secondary)',
                  color: selectedLandmarkFilter === null ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease'
                }}
              >
                All ({selectedFolder.photos.length})
              </button>

              {selectedFolder.landmarks.map(lm => {
                const isSelected = selectedLandmarkFilter === lm
                const count = selectedFolder.photos.filter(p => (p.location_name || '').toLowerCase().includes(lm.toLowerCase())).length
                return (
                  <button
                    key={lm}
                    type="button"
                    onClick={() => setSelectedLandmarkFilter(isSelected ? null : lm)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: '9999px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      border: '1px solid',
                      borderColor: isSelected ? '#0071e3' : 'var(--border)',
                      backgroundColor: isSelected ? 'rgba(0, 113, 227, 0.15)' : 'var(--bg-secondary)',
                      color: isSelected ? '#0071e3' : 'var(--text-secondary)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <LandmarkIcon size={12} />
                    {lm} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {folderViewTab === 'photos' ? (
            <PhotoGrid photos={displayedFolderPhotos} showDateHeaders={true} />
          ) : (
            <div
              style={{
                width: '100%',
                height: 'calc(100vh - 240px)',
                minHeight: '480px',
                borderRadius: '20px',
                overflow: 'hidden',
                border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)',
                position: 'relative'
              }}
            >
              <div ref={mapContainerRef} style={{ width: '100%', height: '100%', backgroundColor: '#1c1c1e' }} />
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ─── Empty State ──────────────────────────────────────────────── */}
          {placeFolders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px' }}>
              <EmptyState
                icon={<MapPin size={56} color="#0071e3" />}
                title="No Place Folders Yet"
                description="Scan your library to automatically detect trips, landmarks (Taj Mahal, Delhi, Hampi, Bangalore), and group photos into clean place folders."
                actionLabel="Scan Places Now"
                onAction={handleStartLocationScan}
              />
            </div>
          ) : (
            <>
              {/* ─── Mode 1: Apple Place Folders Grid ─────────────────────── */}
              {viewMode === 'folders' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                    gap: '24px',
                    marginBottom: '36px'
                  }}
                >
                  {placeFolders.map((folder) => {
                    const coverUrl = getThumbnailUrl(
                      folder.coverPhoto.preview_path ||
                      folder.coverPhoto.thumbnail_path ||
                      folder.coverPhoto.file_path
                    )
                    return (
                      <div
                        key={folder.name}
                        onClick={() => {
                          setSelectedFolder(folder)
                          setSelectedLandmarkFilter(null)
                        }}
                        style={{
                          backgroundColor: 'var(--bg-secondary)',
                          borderRadius: '20px',
                          border: '1px solid var(--border)',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'all 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
                          boxShadow: 'var(--shadow-sm)',
                          position: 'relative',
                          display: 'flex',
                          flexDirection: 'column'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-5px)'
                          e.currentTarget.style.borderColor = '#0071e3'
                          e.currentTarget.style.boxShadow = '0 16px 36px rgba(0, 113, 227, 0.22)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.borderColor = 'var(--border)'
                          e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
                        }}
                      >
                        {/* Cover Image */}
                        <div
                          style={{
                            aspectRatio: '16/10',
                            width: '100%',
                            backgroundColor: '#1c1c1e',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                        >
                          <img
                            src={coverUrl}
                            alt={folder.name}
                            loading="lazy"
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.15) 50%, transparent 100%)'
                            }}
                          />

                          {/* Top Badges (Glassmorphic) */}
                          <div
                            style={{
                              position: 'absolute',
                              top: '12px',
                              left: '12px',
                              right: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              color: '#ffffff'
                            }}
                          >
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: 'rgba(0, 0, 0, 0.55)',
                                backdropFilter: 'blur(10px)',
                                padding: '3px 10px',
                                borderRadius: '9999px',
                                border: '1px solid rgba(255, 255, 255, 0.15)'
                              }}
                            >
                              {folder.year}
                            </span>
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 700,
                                backgroundColor: '#0071e3',
                                color: '#ffffff',
                                padding: '3px 10px',
                                borderRadius: '9999px',
                                boxShadow: '0 2px 8px rgba(0, 113, 227, 0.4)'
                              }}
                            >
                              {folder.photos.length} photos
                            </span>
                          </div>

                          {/* Date Range Overlay */}
                          {folder.dateRangeStr && (
                            <div
                              style={{
                                position: 'absolute',
                                bottom: '10px',
                                left: '14px',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: 'rgba(255, 255, 255, 0.9)'
                              }}
                            >
                              {folder.dateRangeStr}
                            </div>
                          )}
                        </div>

                        {/* Card Info */}
                        <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                              <MapPin size={16} color="#0071e3" style={{ flexShrink: 0 }} />
                              <span
                                style={{
                                  fontSize: '17px',
                                  fontWeight: 800,
                                  color: 'var(--text-primary)',
                                  letterSpacing: '-0.3px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}
                              >
                                {folder.name}
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingFolder(folder)
                                setRenameValue(folder.city)
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                padding: '4px',
                                cursor: 'pointer',
                                borderRadius: '6px'
                              }}
                              title="Rename Place"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>

                          {/* Landmark Badges */}
                          {folder.landmarks.length > 0 ? (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                              {folder.landmarks.slice(0, 3).map(lm => (
                                <span
                                  key={lm}
                                  style={{
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    backgroundColor: 'rgba(0, 113, 227, 0.08)',
                                    color: '#0071e3',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                  }}
                                >
                                  <LandmarkIcon size={10} />
                                  {lm}
                                </span>
                              ))}
                              {folder.landmarks.length > 3 && (
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', alignSelf: 'center' }}>
                                  +{folder.landmarks.length - 3} more
                                </span>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Regional travel photos
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ─── Mode 2: Apple World Map ──────────────────────────────── */}
              {viewMode === 'map' && (
                <div
                  style={{
                    width: '100%',
                    height: 'calc(100vh - 220px)',
                    minHeight: '480px',
                    borderRadius: '20px',
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-lg)',
                    position: 'relative'
                  }}
                >
                  <div
                    ref={mapContainerRef}
                    style={{ width: '100%', height: '100%', backgroundColor: '#1c1c1e' }}
                  />

                  {/* Floating Map Info Overlay (Apple Frosted Glass) */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '18px',
                      right: '18px',
                      zIndex: 1000,
                      backgroundColor: 'rgba(28, 28, 30, 0.85)',
                      backdropFilter: 'blur(20px)',
                      padding: '8px 16px',
                      borderRadius: '9999px',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
                    }}
                  >
                    <Navigation size={14} color="#0071e3" />
                    <span>{geoPhotos.length} mapped photos across {placeFolders.length} places</span>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Rename Place Modal ──────────────────────────────────────────── */}
      {editingFolder && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setEditingFolder(null)}
        >
          <div
            style={{
              width: '380px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-secondary)',
              borderRadius: '20px',
              border: '1px solid var(--border)',
              padding: '26px',
              boxShadow: 'var(--shadow-xl)',
              color: 'var(--text-primary)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px' }}>
              Rename Place
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 18px 0' }}>
              Update the place name for this collection (e.g. <b>Agra</b>, <b>Delhi</b>, <b>Hampi</b>, <b>Bangalore</b>).
            </p>

            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
              placeholder="e.g. Agra"
              autoFocus
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                marginBottom: '22px',
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEditingFolder(null)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '9999px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRename}
                disabled={!renameValue.trim()}
                style={{
                  padding: '7px 18px',
                  borderRadius: '9999px',
                  border: 'none',
                  backgroundColor: '#0071e3',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 113, 227, 0.35)'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Selection Bar ───────────────────────────────────────────────── */}
      <SelectionBar />
    </div>
  )
}
