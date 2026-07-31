import React, { useMemo } from 'react'
import { Sparkles, Calendar, Heart, MapPin } from 'lucide-react'
import { Photo } from '../contexts/PhotoContext'
import { getThumbnailUrl } from '../utils/helpers'

export interface Memory {
  id: string
  title: string
  subtitle: string
  coverPhoto: Photo
  photos: Photo[]
}

interface MemoriesCarouselProps {
  photos: Photo[]
  onSelectMemory: (memory: Memory) => void
}

export default function MemoriesCarousel({ photos, onSelectMemory }: MemoriesCarouselProps) {
  const memories = useMemo(() => {
    if (photos.length === 0) return []

    const list: Memory[] = []
    const now = new Date()

    // Group photos by year/month/favorites
    const oneYearAgoPhotos = photos.filter(p => {
      const d = new Date(p.created_at)
      return d.getFullYear() === now.getFullYear() - 1 && d.getMonth() === now.getMonth()
    })

    if (oneYearAgoPhotos.length > 0) {
      list.push({
        id: '1-year-ago',
        title: '1 Year Ago',
        subtitle: 'Rediscover this month',
        coverPhoto: oneYearAgoPhotos[0],
        photos: oneYearAgoPhotos
      })
    }

    const favPhotos = photos.filter(p => p.is_favorite)
    if (favPhotos.length >= 2) {
      list.push({
        id: 'favorites-spotlight',
        title: 'Spotlight',
        subtitle: 'Your favorite moments',
        coverPhoto: favPhotos[0],
        photos: favPhotos
      })
    }

    // Recent highlight memory
    const recentPhotos = photos.slice(0, 10)
    if (recentPhotos.length >= 3) {
      list.push({
        id: 'recent-highlights',
        title: 'Recent Highlights',
        subtitle: 'Latest memories',
        coverPhoto: recentPhotos[0],
        photos: recentPhotos
      })
    }

    return list
  }, [photos])

  if (memories.length === 0) return null

  return (
    <div className="memories-carousel-container">
      <div className="memories-carousel-header">
        <Sparkles size={18} className="icon" />
        <span>Memories</span>
      </div>

      <div className="memories-carousel">
        {memories.map(memory => {
          const thumbUrl = getThumbnailUrl(memory.coverPhoto.thumbnail_path) || getThumbnailUrl(memory.coverPhoto.file_path)
          return (
            <div
              key={memory.id}
              className="memory-card"
              onClick={() => onSelectMemory(memory)}
            >
              <img src={thumbUrl} alt={memory.title} className="memory-card-bg" />
              <div className="memory-card-overlay" />
              <div className="memory-card-content">
                <span className="memory-card-title">{memory.title}</span>
                <span className="memory-card-subtitle">{memory.subtitle}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
