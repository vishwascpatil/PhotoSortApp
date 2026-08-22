import React, { useEffect, useState, useMemo, useRef } from 'react'
import {
  MapPin, Map as MapIcon, Grid, ChevronLeft, RefreshCw,
  Sparkles, Compass, Globe, Layers, Navigation, Eye, CheckCircle2
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
    // 1. Group geo-photos and photos that have location_name
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

    // Also include photos from photoState that have location_name but might not have direct GPS
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

    // Allow DOM container to mount
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

        // Sleek Dark / CartoDB tiles
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

        // Cluster geo photos by nearby coordinates (~0.01 deg)
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

  const handleResetLocationScan = async () => {
    if (confirm('Reset all identified locations and rescan your library?')) {
      try {
        if (window.photoVault?.resetLocationScanData) {
          await window.photoVault.resetLocationScanData()
          refreshPhotos()
          showToast('Location data reset. Starting fresh scan...')
          handleStartLocationScan()
        }
      } catch (err: any) {
        showToast(`Error resetting locations: ${err?.message || err}`)
      }
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
                {selectedGroup ? selectedGroup.name : 'Places'}
              </h1>
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
        {!selectedGroup && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
          </div>
        )}
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
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
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
                              background: 'linear-gradient(to top, rgba(15, 23, 42, 0.8) 0%, transparent 60%)'
                            }}
                          />
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

                        {/* Card Info */}
                        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <MapPin size={16} color="#0ea5e9" />
                            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {group.locationName}
                            </span>
                          </div>
                          <span style={{ fontSize: '12px', color: '#0ea5e9', fontWeight: 600 }}>
                            View &rarr;
                          </span>
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

      {/* ─── Selection Bar ───────────────────────────────────────────────── */}
      <SelectionBar />
    </div>
  )
}
