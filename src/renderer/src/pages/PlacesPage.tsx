import React, { useEffect, useState, useMemo, useRef } from 'react'
import { MapPin, Sparkles, Navigation, Loader2 } from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import EmptyState from '../components/EmptyState'
import { getThumbnailUrl } from '../utils/helpers'

interface GeoPhoto {
  photo: Photo
  lat: number
  lng: number
  location_name?: string | null
}

export default function PlacesPage() {
  const { state: photoState, dispatch: photoDispatch, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const [geoPhotos, setGeoPhotos] = useState<GeoPhoto[]>([])
  const [locationProgress, setLocationProgress] = useState<any>(null)
  const [isScanning, setIsScanning] = useState(false)

  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)

  // Load photos with verified GPS coordinates
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

  // Subscribe to location scan progress events
  useEffect(() => {
    if (window.photoVault?.onLocationScanProgress) {
      const cleanup = window.photoVault.onLocationScanProgress((progress: any) => {
        setLocationProgress(progress)
        setIsScanning(progress?.isScanning ?? false)
        if (progress?.isScanning === false && (progress?.scannedCount > 0 || progress?.status?.includes('Mapped'))) {
          loadGeoData()
          refreshPhotos()
          setTimeout(() => {
            setLocationProgress(null)
          }, 2000)
        }
      })
      return cleanup
    }
    return undefined
  }, [])

  // Start Landmark & GPS scan
  const handleStartLocationScan = async () => {
    setIsScanning(true)
    setLocationProgress({
      isScanning: true,
      scannedCount: 0,
      totalCount: photoState.photos.length || 1,
      status: 'Scanning photo library for places & landmarks...'
    })
    try {
      if (window.photoVault?.startLocationScan) {
        await window.photoVault.startLocationScan()
        loadGeoData()
        refreshPhotos()
      }
    } catch (err: any) {
      showToast(`Scan error: ${err?.message || err}`)
    } finally {
      setIsScanning(false)
      setTimeout(() => {
        setLocationProgress(null)
      }, 1500)
    }
  }

  const handleStopLocationScan = async () => {
    try {
      if (window.photoVault?.stopLocationScan) {
        await window.photoVault.stopLocationScan()
        showToast('Location scan stopped')
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || err}`)
    } finally {
      setIsScanning(false)
      setLocationProgress(null)
    }
  }

  // Unique location clusters count
  const clusterCount = useMemo(() => {
    const set = new Set<string>()
    for (const g of geoPhotos) {
      set.add(`${g.lat.toFixed(3)},${g.lng.toFixed(3)}`)
    }
    return set.size
  }, [geoPhotos])

  // ─── Leaflet Interactive Map Lifecycle ───────────────────────────────────
  useEffect(() => {
    if (geoPhotos.length === 0) return

    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [20, 78],
          zoom: 4,
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

        // Handle window resize dynamically
        const handleResize = () => {
          if (mapInstanceRef.current) {
            try {
              mapInstanceRef.current.invalidateSize()
            } catch {}
          }
        }
        window.addEventListener('resize', handleResize)
        ;(map as any)._customResizeHandler = handleResize
      }

      const map = mapInstanceRef.current
      const markersLayer = markersLayerRef.current
      if (!map || !markersLayer) return

      markersLayer.clearLayers()

      if (geoPhotos.length > 0) {
        const bounds = L.latLngBounds([])

        // Cluster by coordinate radius (~500m precision)
        const clusters: Record<string, { lat: number; lng: number; photos: Photo[]; locName: string }> = {}
        for (const item of geoPhotos) {
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
          const cover = cluster.photos.find(p => p.preview_path || p.thumbnail_path) || cluster.photos[0]
          const thumbUrl = getThumbnailUrl(cover.preview_path || cover.thumbnail_path)

          const pinIcon = L.divIcon({
            className: 'custom-place-pin',
            html: `
              <div style="
                width: 48px;
                height: 48px;
                border-radius: 50%;
                border: 3px solid #6366f1;
                box-shadow: 0 4px 18px rgba(99, 102, 241, 0.45);
                overflow: hidden;
                background: #1c1c1e;
                position: relative;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
              " onmouseover="this.style.transform='scale(1.18)'" onmouseout="this.style.transform='scale(1.0)'">
                ${thumbUrl ? `
                  <img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.style.display='none'; if (this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
                ` : ''}
                <div style="width: 100%; height: 100%; display: ${thumbUrl ? 'none' : 'flex'}; align-items: center; justify-content: center; background: #1e1e24;">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                </div>
                ${cluster.photos.length > 1 ? `
                  <span style="
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                    color: #ffffff;
                    font-size: 10px;
                    font-weight: 700;
                    padding: 1px 5px;
                    border-radius: 6px 0 0 0;
                    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
                  ">${cluster.photos.length}</span>
                ` : ''}
              </div>
            `,
            iconSize: [48, 48],
            iconAnchor: [24, 24]
          })

          const marker = L.marker([cluster.lat, cluster.lng], { icon: pinIcon })

          // Clicking a pin opens photo viewer scoped to this location's photos
          marker.on('click', () => {
            photoDispatch({
              type: 'SET_VIEWER_SCOPED',
              payload: {
                photoId: cover.id,
                photos: cluster.photos
              }
            })
          })

          marker.bindTooltip(
            `<b>${cluster.locName}</b><br/>${cluster.photos.length} photo${cluster.photos.length > 1 ? 's' : ''} • Click to view`,
            { direction: 'top', offset: [0, -24] }
          )

          markersLayer.addLayer(marker)
        })

        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 })
        }
      }
      map.invalidateSize()
    }, 150)

    return () => {
      clearTimeout(timer)
      if (mapInstanceRef.current) {
        if ((mapInstanceRef.current as any)._customResizeHandler) {
          window.removeEventListener('resize', (mapInstanceRef.current as any)._customResizeHandler)
        }
        try {
          mapInstanceRef.current.remove()
        } catch {}
        mapInstanceRef.current = null
        markersLayerRef.current = null
      }
    }
  }, [geoPhotos, photoDispatch])

  return (
    <div
      className="places-page-container"
      style={{
        padding: '24px 32px',
        maxWidth: '1600px',
        margin: '0 auto',
        minHeight: '100%',
        color: 'var(--text-primary)'
      }}
    >
      {/* ─── Header Bar ────────────────────────────────────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {geoPhotos.length > 0 && (
            <span className="apple-storage-pill">
              {geoPhotos.length} mapped photos • {clusterCount} locations
            </span>
          )}
        </div>

        {/* Scan Places Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <button
            type="button"
            className="apple-primary-btn"
            onClick={handleStartLocationScan}
            disabled={isScanning || locationProgress?.isScanning}
          >
            {isScanning || locationProgress?.isScanning ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Scanning Places...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Scan Places</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ─── Live Scanner Progress Banner (People / Documents Pattern) ─────── */}
      {(isScanning || locationProgress?.isScanning) && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
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
                background: 'rgba(99, 102, 241, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6366f1'
              }}
            >
              <Loader2 size={18} className="animate-spin" />
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Scanning photo library for places & landmarks...
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Scanned {locationProgress?.scannedCount || 0} of {locationProgress?.totalCount || (photoState.photos.length || 0)} photos (
                {locationProgress && locationProgress.totalCount > 0
                  ? Math.round((locationProgress.scannedCount / locationProgress.totalCount) * 100)
                  : 0}
                %)
              </div>
            </div>
          </div>

          <button
            type="button"
            className="apple-secondary-btn"
            onClick={handleStopLocationScan}
            style={{ fontSize: '12px', padding: '4px 10px' }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ─── Main Map Content ─────────────────────────────────────────────── */}
      {geoPhotos.length === 0 && !isScanning ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <EmptyState
            icon={
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="0" height="0" style={{ position: 'absolute' }}>
                  <defs>
                    <linearGradient id="placesIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4f46e5" />
                      <stop offset="50%" stopColor="#6366f1" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                  </defs>
                </svg>
                <MapPin
                  size={46}
                  strokeWidth={1.8}
                  stroke="url(#placesIconGrad)"
                  style={{ filter: 'drop-shadow(0 4px 12px rgba(99, 102, 241, 0.35))' }}
                />
              </div>
            }
            title={
              <>
                No <span className="title-sort-gradient">Places</span> Found
              </>
            }
            description="Photos with GPS metadata will automatically appear on your interactive world map."
          />
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            height: 'calc(100vh - 180px)',
            minHeight: '520px',
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
            <Navigation size={14} color="#6366f1" />
            <span>{geoPhotos.length} mapped photos across {clusterCount} locations</span>
          </div>
        </div>
      )}
    </div>
  )
}
