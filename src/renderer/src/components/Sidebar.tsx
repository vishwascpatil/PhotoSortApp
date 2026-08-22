import React, { useEffect, useState } from 'react'
import {
  Compass, ImageIcon, Star, Film, FolderKanban, Users, MapPin, Tag, FileText,
  Copy, Sparkles, Monitor, HardDrive, MessageSquare, Folder, Cloud, Images, Loader2, Trash2, Flame
} from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { formatFileSize } from '../utils/helpers'

interface NavGroup {
  sectionTitle: string
  items: {
    id: any
    icon: React.ComponentType<{ size?: number; className?: string }>
    label: string
  }[]
}

export default function Sidebar() {
  const { state, navigateTo } = useApp()
  const [stats, setStats] = useState({ totalPhotos: 0, totalSize: 0, favorites: 0, albums: 0 })

  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 5000)
    return () => clearInterval(interval)
  }, [])

  async function loadStats() {
    try {
      if (window.photoVault?.getStats) {
        const s = await window.photoVault.getStats()
        setStats(s)
      }
    } catch {}
  }

  const isScanning = state.importStatus.active

  const navGroups: NavGroup[] = [
    {
      sectionTitle: 'BROWSE',
      items: [
        
        { id: 'photos', icon: ImageIcon, label: 'All Photos' },
        { id: 'favorites', icon: Star, label: 'Favorites' },
        { id: 'videos', icon: Film, label: 'Videos' }
      ]
    },
    {
      sectionTitle: 'ORGANIZE',
      items: [
        { id: 'people', icon: Users, label: 'People' },
        { id: 'places', icon: MapPin, label: 'Places' },
        { id: 'tags', icon: Tag, label: 'Tags' },
        { id: 'documents', icon: FileText, label: 'Documents' }
      ]
    },
    {
      sectionTitle: 'CLEAN UP',
      items: [
        { id: 'duplicates', icon: Copy, label: 'Duplicates' },
        { id: 'screenshots', icon: Monitor, label: 'Screenshots' },
        { id: 'large-files', icon: HardDrive, label: 'Large Files' },
        { id: 'junk', icon: Flame, label: 'JUNK' },
        { id: 'trash', icon: Trash2, label: 'Trash' }
      ]
    },
    {
      sectionTitle: 'IMPORTED FOLDERS',
      items: [
        { id: 'folders', icon: Folder, label: 'Imported Folders' },
        { id: 'google-photos', icon: Cloud, label: 'Google Photos' }
      ]
    }
  ]

  return (
    <aside className={`sidebar ${state.sidebarCollapsed ? 'collapsed' : ''}`}>
      {/* Brand Header */}
      <div 
        className="sidebar-header" 
        onClick={() => navigateTo('overview')} 
        style={{ cursor: 'pointer' }}
      >
        <div className="sidebar-logo">
          {!state.sidebarCollapsed && (
            <h1 className="sidebar-logo-text-themed">
              <span className="title-photo-dark" style={{ color: 'var(--text-primary, #0f172a)', fontWeight: 800 }}>Photo</span>
              <span className="title-sort-gradient" style={{ fontWeight: 800 }}>Sort</span>
            </h1>
          )}
        </div>
      </div>

      {/* Grouped Navigation */}
      <nav className="sidebar-nav-scroll">
        {/* Active Scanning Indicator Pill if scanning is running */}
        {isScanning && (
          <div className="sidebar-nav-group" style={{ marginBottom: '12px' }}>
            <button
              type="button"
              className={`sidebar-nav-item active-scanning-pill ${state.currentView === 'scanning-library' ? 'active' : ''}`}
              onClick={() => navigateTo('scanning-library')}
              title="Scanning Library Progress"
            >
              <span className="sidebar-item-icon">
                <Loader2 size={18} className="animate-spin icon-spinner-blue" />
              </span>
              {!state.sidebarCollapsed && (
                <span className="sidebar-nav-label" style={{ fontWeight: 600 }}>Scanning Library...</span>
              )}
            </button>
          </div>
        )}

        {/* Full Navigation Always Available */}
        {navGroups.map((group) => (
          <div key={group.sectionTitle} className="sidebar-nav-group">
            {!state.sidebarCollapsed && (
              <div className="sidebar-section-title">{group.sectionTitle}</div>
            )}
            <div className="sidebar-nav-items">
              {group.items.map((item) => {
                const isActive = state.currentView === item.id
                const IconComp = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                    onClick={() => navigateTo(item.id)}
                    title={item.label}
                  >
                    <span className="sidebar-item-icon">
                      <IconComp size={18} />
                    </span>
                    {!state.sidebarCollapsed && (
                      <span className="sidebar-nav-label">{item.label}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer Stats */}
      {!state.sidebarCollapsed && (
        <div className="sidebar-footer">
          <div className="sidebar-stats">
            <div><strong>{stats.totalPhotos.toLocaleString()}</strong> photos</div>
            <div><strong>{formatFileSize(stats.totalSize)}</strong> used</div>
          </div>
        </div>
      )}
    </aside>
  )
}

