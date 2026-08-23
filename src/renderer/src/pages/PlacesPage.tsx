import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  MapPin, Map as MapIcon, Grid, ChevronLeft, RefreshCw,
  Sparkles, Compass, Globe, Layers, Navigation, Edit2, FolderPlus, Download, Check
} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import EmptyState from '../components/EmptyState'
import { getThumbnailUrl, getOriginalUrl, formatDate } from '../utils/helpers'

interface GeoPhoto {
  photo: Photo
  lat: number
  lng: number
  location_name?: string | null
}

interface LocationGroup {
  name: string
  locationName: string
  year?: string
  photos: Photo[]
  coverPhoto: Photo
  lat?: number
  lng?: number
}

export default function PlacesPage() {
  const { state: photoState, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const [viewMode, setViewMode] = useState<'cards' | 'map'>('cards')
  const [geoPhotos, setGeoPhotos] = useState<GeoPhoto[]>([])
  const [selectedGroup, setSelectedGroup] = useState<LocationGroup | null>(null)
  const [locationProgress, setLocationProgress] = useState<any>(null)
  const [isScanning, setIsScanning] = useState(false)

  // Rename Location Modal State
  const [editingGroup, setEditingGroup] = useState<LocationGroup | null>(null)
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
        if (progress?.status === 'Completed' || progress?.status === 'Stopped') {
          loadGeoData()
          refreshPhotos()
        }
      })
      return cleanup
    }
    return undefined
  }, [])

  // Location Groups
  const locationGroups = useMemo<LocationGroup[]>(() => {
    const groupsMap: Record<string, { photos: Photo[]; lat?: number; lng?: number; locName: string; year?: string }> = {}

    // First from geoPhotos
    for (const item of geoPhotos) {
      const p = item.photo
      const year = p.created_at ? p.created_at.split('-')[0] : ''
      const loc = item.location_name || p.location_name || 'Geotagged Area'
      const key = `${loc}${year ? ` (${year})` : ''}`

      if (!groupsMap[key]) {
        groupsMap[key] = {
          photos: [],
          lat: item.lat,
          lng: item.lng,
          locName: loc,
          year
        }
      }
      groupsMap[key].photos.push(p)
    }

    // Also include photos from photoState that have location_name
    for (const p of photoState.photos) {
      if (p.location_name && !p.is_trashed) {
        const year = p.created_at ? p.created_at.split('-')[0] : ''
        const key = `${p.location_name}${year ? ` (${year})` : ''}`
        if (!groupsMap[key]) {
          groupsMap[key] = {
            photos: [p],
            locName: p.location_name,
            year
          }
        } else if (!groupsMap[key].photos.some(item => item.id === p.id)) {
          groupsMap[key].photos.push(p)
        }
      }
    }

    return Object.keys(groupsMap)
      .sort((a, b) => groupsMap[b].photos.length - groupsMap[a].photos.length)
      .map(key => {
        const item = groupsMap[key]
        return {
          name: key,
          locationName: item.locName,
          year: item.year,
          photos: item.photos,
          coverPhoto: item.photos[0],
          lat: item.lat,
          lng: item.lng
        }
      })
  }, [geoPhotos, photoState.photos])

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (viewMode !== 'map' || selectedGroup) return

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [20, 0],
          zoom: 2,
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

      if (geoPhotos.length > 0) {
        const bounds = L.latLngBounds([])

        const clusters: Record<string, { lat: number; lng: number; photos: Photo[]; locName: string }> = {}
        for (const item of geoPhotos) {
          const clusterKey = `${item.lat.toFixed(2)},${item.lng.toFixed(2)}`
          if (!clusters[clusterKey]) {
            clusters[clusterKey] = {
              lat: item.lat,
              lng: item.lng,
              photos: [],
              locName: item.location_name || 'Photo Location'
            }
          }
          clusters[clusterKey].photos.push(item.photo)
        }

        Object.values(clusters).forEach((cluster) => {
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
                border: 3px solid #3b82f6;
                box-shadow: 0 4px 14px rgba(0,0,0,0.5);
                overflow: hidden;
                background: #1e293b;
                position: relative;
                cursor: pointer;
                transition: transform 0.2s ease;
              " onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1.0)'">
                <img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
                ${cluster.photos.length > 1 ? `
                  <span style="
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    background: #3b82f6;
                    color: #ffffff;
                    font-size: 10px;
                    font-weight: 800;
                    padding: 1px 5px;
                    border-radius: 10px 0 0 0;
                  ">${cluster.photos.length}</span>
                ` : ''}
              </div>
            `,
            iconSize: [46, 46],
            iconAnchor: [23, 23]
          })

          const marker = L.marker([cluster.lat, cluster.lng], { icon: pinIcon })
          marker.on('click', () => {
            const groupMatch = locationGroups.find(g => g.photos.some(p => p.id === cover.id))
            if (groupMatch) {
              setSelectedGroup(groupMatch)
            } else {
              setSelectedGroup({
                name: cluster.locName,
                locationName: cluster.locName,
                photos: cluster.photos,
                coverPhoto: cover,
                lat: cluster.lat,
                lng: cluster.lng
              })
            }
          })

          marker.bindTooltip(`<b>${cluster.locName}</b><br/>${cluster.photos.length} photo${cluster.photos.length > 1 ? 's' : ''}`, {
            direction: 'top',
            offset: [0, -22]
          })

          markersLayer.addLayer(marker)
        })

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
        }
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [viewMode, geoPhotos, locationGroups, selectedGroup])

  const handleStartLocationScan = async () => {
    setIsScanning(true)
    try {
      if (window.photoVault?.startLocationScan) {
        await window.photoVault.startLocationScan()
        showToast('Scanning library for GPS location metadata...')
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
    if (!editingGroup || !renameValue.trim()) return
    const trimmed = renameValue.trim()

    try {
      const photoIds = editingGroup.photos.map(p => p.id)
      if (window.photoVault?.updateLocationName) {
        await window.photoVault.updateLocationName(photoIds, trimmed)
        showToast(`Location renamed to "${trimmed}"`)
        setEditingGroup(null)
        await loadGeoData()
        refreshPhotos()
        if (selectedGroup?.name === editingGroup.name) {
          setSelectedGroup({
            ...selectedGroup,
            name: `${trimmed}${selectedGroup.year ? ` (${selectedGroup.year})` : ''}`,
            locationName: trimmed
          })
        }
      }
    } catch (err: any) {
      showToast(`Error renaming location: ${err?.message || err}`)
    }
  }

  const handleOrganizeToDiskFolder = async (group: LocationGroup) => {
    try {
      if (!window.photoVault?.selectLargeFilesDestination || !window.photoVault?.moveLargeFiles) {
        showToast('Folder mover unavailable')
        return
      }

      const dest = await window.photoVault.selectLargeFilesDestination()
      if (!dest) return

      const folderName = group.locationName.replace(/[/\\?%*:|"<>]/g, '-').trim()
      const targetDir = `${dest}/${folderName}`

      const fileIds = group.photos.map(p => p.id)
      const res = await window.photoVault.moveLargeFiles({
        fileIds,
        destinationDir: targetDir,
        preserveRelativeSubpath: false,
        collisionStrategy: 'rename',
        updateDatabasePath: true
      })

      if (res.success) {
        showToast(`Moved ${res.movedCount} photos to "${folderName}" folder`)
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
    <div className="photos-page" style={{ padding: '20px 28px' }}>
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '18px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {selectedGroup ? (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setSelectedGroup(null)}
              style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <ChevronLeft size={18} /> Back
            </button>
          ) : (
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 3px 10px rgba(14, 165, 233, 0.3)'
              }}
            >
              <MapPin size={20} />
            </div>
          )}

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {selectedGroup ? selectedGroup.locationName : 'Places'}
              </h1>
              {selectedGroup && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setEditingGroup(selectedGroup)
                    setRenameValue(selectedGroup.locationName)
                  }}
                  style={{ padding: '4px', display: 'flex', color: 'var(--text-secondary)' }}
                  title="Rename Location"
                >
                  <Edit2 size={14} />
                </button>
              )}
              <span
                style={{
                  background: 'rgba(14, 165, 233, 0.12)',
                  color: '#0ea5e9',
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}
              >
                {selectedGroup
                  ? `${selectedGroup.photos.length} photo${selectedGroup.photos.length === 1 ? '' : 's'}`
                  : `${locationGroups.length} places`}
              </span>
            </div>
          </div>
        </div>

        {/* View Mode & Scanner Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {selectedGroup ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleOrganizeToDiskFolder(selectedGroup)}
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)'
              }}
            >
              <FolderPlus size={14} /> Move to Location Folder
            </button>
          ) : (
            <>
              {/* Cards vs Map Toggle */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: 'var(--bg-secondary, #1e293b)',
                  borderRadius: '8px',
                  border: '1px solid var(--border, #334155)',
                  padding: '2px'
                }}
              >
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'cards' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setViewMode('cards')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Grid size={14} /> Places
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${viewMode === 'map' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setViewMode('map')}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Globe size={14} /> Map
                </button>
              </div>

              {/* Scan Controls */}
              {isScanning ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleStopLocationScan}
                  style={{ fontSize: '12px', padding: '6px 12px' }}
                >
                  Stop Scan
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStartLocationScan}
                  style={{
                    fontSize: '12px',
                    padding: '6px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)'
                  }}
                >
                  <Sparkles size={14} /> Scan Locations
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ─── Scanning Progress Banner ────────────────────────────────────── */}
      {locationProgress && locationProgress.isScanning && (
        <div
          style={{
            backgroundColor: 'var(--bg-secondary, #1e293b)',
            padding: '12px 18px',
            borderRadius: '12px',
            border: '1px solid var(--border, #334155)',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Compass size={18} color="#0ea5e9" className="animate-spin" />
            <div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {locationProgress.status || 'Scanning GPS locations...'}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                ({locationProgress.scannedCount} of {locationProgress.totalCount} photos)
              </span>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleStopLocationScan}
            style={{ fontSize: '12px', padding: '4px 10px' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ─── Location Detail View ────────────────────────────────────────── */}
      {selectedGroup ? (
        <div>
          <PhotoGrid photos={selectedGroup.photos} showDateHeaders={true} />
        </div>
      ) : (
        <>
          {/* ─── Empty State ──────────────────────────────────────────────── */}
          {locationGroups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <EmptyState
                icon={<MapPin size={48} color="#0ea5e9" />}
                title="No Places Identified Yet"
                description="Photos with GPS coordinates or city folders can be automatically mapped."
                actionLabel="Scan Locations"
                onAction={handleStartLocationScan}
              />
            </div>
          ) : (
            <>
              {/* ─── View Mode 1: Places Cards Grid ───────────────────────── */}
              {viewMode === 'cards' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: '18px',
                    marginBottom: '28px'
                  }}
                >
                  {locationGroups.map((group) => {
                    const coverUrl = getThumbnailUrl(
                      group.coverPhoto.preview_path ||
                      group.coverPhoto.thumbnail_path ||
                      group.coverPhoto.file_path
                    )
                    return (
                      <div
                        key={group.name}
                        onClick={() => setSelectedGroup(group)}
                        style={{
                          backgroundColor: 'var(--bg-secondary, #1e293b)',
                          borderRadius: '16px',
                          border: '1px solid var(--border, #334155)',
                          overflow: 'hidden',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-3px)'
                          e.currentTarget.style.borderColor = '#0ea5e9'
                          e.currentTarget.style.boxShadow = '0 12px 24px rgba(14, 165, 233, 0.2)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)'
                          e.currentTarget.style.borderColor = 'var(--border, #334155)'
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
                        }}
                      >
                        {/* Cover Image */}
                        <div
                          style={{
                            height: '160px',
                            width: '100%',
                            backgroundColor: '#0f172a',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                        >
                          <img
                            src={coverUrl}
                            alt={group.name}
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
                              background: 'linear-gradient(to top, rgba(15, 23, 42, 0.85) 0%, transparent 60%)'
                            }}
                          />

                          {/* Year and Photo Count Badges */}
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '10px',
                              left: '12px',
                              right: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              color: '#ffffff'
                            }}
                          >
                            <span style={{ fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(0,0,0,0.6)', padding: '2px 8px', borderRadius: '10px' }}>
                              {group.year || 'All Time'}
                            </span>
                            <span style={{ fontSize: '11px', fontWeight: 700, backgroundColor: '#0ea5e9', padding: '2px 8px', borderRadius: '10px' }}>
                              {group.photos.length} photos
                            </span>
                          </div>
                        </div>

                        {/* Card Info & Quick Rename Button */}
                        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                            <MapPin size={16} color="#0ea5e9" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {group.locationName}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingGroup(group)
                                setRenameValue(group.locationName)
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                padding: '4px',
                                cursor: 'pointer'
                              }}
                              title="Rename Location Folder"
                            >
                              <Edit2 size={13} />
                            </button>
                            <span style={{ fontSize: '12px', color: '#0ea5e9', fontWeight: 600 }}>
                              View &rarr;
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ─── View Mode 2: Interactive Leaflet Map ─────────────────── */}
              {viewMode === 'map' && (
                <div
                  style={{
                    width: '100%',
                    height: 'calc(100vh - 220px)',
                    minHeight: '480px',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    border: '1px solid var(--border, #334155)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    position: 'relative'
                  }}
                >
                  <div
                    ref={mapContainerRef}
                    style={{ width: '100%', height: '100%', backgroundColor: '#0f172a' }}
                  />

                  {/* Floating Map Info Overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '16px',
                      right: '16px',
                      zIndex: 1000,
                      backgroundColor: 'rgba(15, 23, 42, 0.85)',
                      backdropFilter: 'blur(8px)',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border, #334155)',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Navigation size={14} color="#0ea5e9" />
                    <span>{geoPhotos.length} geotagged photos mapped</span>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ─── Rename Location Modal ───────────────────────────────────────── */}
      {editingGroup && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setEditingGroup(null)}
        >
          <div
            style={{
              width: '380px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              borderRadius: '16px',
              border: '1px solid var(--border, #334155)',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              color: 'var(--text-primary, #f8fafc)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 700 }}>
              Rename Location Folder
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
              e.g. <b>Delhi Agra</b>, <b>Agra</b>, <b>Goa Trip</b>, <b>Paris</b>
            </p>

            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveRename()}
              placeholder="e.g. Delhi Agra"
              autoFocus
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border, #334155)',
                backgroundColor: 'var(--bg-primary, #0f172a)',
                color: 'var(--text-primary, #f8fafc)',
                fontSize: '13px',
                marginBottom: '20px',
                outline: 'none'
              }}
            />

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingGroup(null)}
                style={{ fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveRename}
                disabled={!renameValue.trim()}
                style={{ fontSize: '12px', padding: '6px 16px' }}
              >
                Save Location
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
