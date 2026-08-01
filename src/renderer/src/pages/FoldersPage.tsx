import React, { useEffect, useState, useCallback } from 'react'
import { Folder, RefreshCw, Trash2, ArrowLeft, Plus, HardDrive, CheckCircle2 } from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import EmptyState from '../components/EmptyState'

interface ImportedFolder {
  id: number
  folder_path: string
  folder_name: string
  photo_count: number
  last_synced_at: string
  created_at: string
}

export default function FoldersPage() {
  const { state: photoState, loadPhotos, refreshPhotos } = usePhotos()
  const { showToast, navigateTo } = useApp()
  const [folders, setFolders] = useState<ImportedFolder[]>([])
  const [selectedFolder, setSelectedFolder] = useState<ImportedFolder | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [folderPhotos, setFolderPhotos] = useState<Photo[]>([])
  const [loadingFolderPhotos, setLoadingFolderPhotos] = useState(false)

  const loadFolders = useCallback(async () => {
    try {
      const f = await window.photoVault.getImportedFolders()
      setFolders(f)
    } catch (err) {
      console.error('Failed to load folders:', err)
    }
  }, [])

  useEffect(() => {
    loadFolders()
  }, [loadFolders])

  // Listen for sync status events
  useEffect(() => {
    const cleanup1 = window.photoVault.onSyncStatus((status) => {
      setIsSyncing(true)
      setSyncMessage(status.message)
    })
    const cleanup2 = window.photoVault.onSyncAllCompleted((results) => {
      setIsSyncing(false)
      setSyncMessage('')
      loadFolders()
      if (selectedFolder) {
        loadFolderPhotos(selectedFolder.folder_path)
      }
      const totalAdded = results.reduce((acc, r) => acc + r.addedCount, 0)
      const totalRemoved = results.reduce((acc, r) => acc + r.removedCount, 0)
      showToast(`Disk Sync Complete! +${totalAdded} added, -${totalRemoved} removed`)
    })

    return () => {
      cleanup1()
      cleanup2()
    }
  }, [loadFolders, selectedFolder, showToast])

  const loadFolderPhotos = useCallback(async (folderPath: string) => {
    setLoadingFolderPhotos(true)
    try {
      const photos = await window.photoVault.getPhotos({ folderPath })
      setFolderPhotos(photos)
    } catch (err) {
      console.error('Failed to load folder photos:', err)
    } finally {
      setLoadingFolderPhotos(false)
    }
  }, [])

  const handleSelectFolder = (folder: ImportedFolder) => {
    setSelectedFolder(folder)
    loadFolderPhotos(folder.folder_path)
  }

  const handleSyncSingleFolder = async (e: React.MouseEvent, folder: ImportedFolder) => {
    e.stopPropagation()
    setIsSyncing(true)
    setSyncMessage(`Syncing ${folder.folder_name}...`)
    try {
      const res = await window.photoVault.syncFolder(folder.folder_path)
      showToast(`Synced ${folder.folder_name}: +${res.addedCount} added, -${res.removedCount} removed`)
      await loadFolders()
      if (selectedFolder?.id === folder.id) {
        await loadFolderPhotos(folder.folder_path)
      }
    } catch (err) {
      console.error('Failed to sync folder:', err)
      showToast('Sync failed')
    } finally {
      setIsSyncing(false)
      setSyncMessage('')
    }
  }

  const handleSyncAll = async () => {
    setIsSyncing(true)
    setSyncMessage('Starting full disk sync...')
    try {
      await window.photoVault.syncAllFolders()
    } catch (err) {
      console.error('Sync all error:', err)
      setIsSyncing(false)
      setSyncMessage('')
    }
  }

  const handleRemoveFolder = async (e: React.MouseEvent, folderId: number) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to remove this folder? All photos and data imported from this folder will be deleted from PhotoSort.')) {
      await window.photoVault.removeImportedFolder(folderId)
      showToast('Folder and associated photos removed')
      if (selectedFolder?.id === folderId) {
        setSelectedFolder(null)
      }
      await refreshPhotos()
      const remaining = await window.photoVault.getImportedFolders()
      setFolders(remaining)
      if (remaining.length === 0) {
        navigateTo('source-select')
      }
    }
  }

  const handleImportNewFolder = async () => {
    const res = await window.photoVault.importFolder()
    if (res.success) {
      await loadFolders()
    }
  }

  // ─── Render Selected Folder Photos View ────────────────────────────────
  // Compute cover previews for folders
  const folderCovers = React.useMemo(() => {
    const map: Record<number, Photo[]> = {}
    folders.forEach(f => {
      map[f.id] = photoState.photos.filter(p => p.source_folder_path === f.folder_path || (p.file_path && p.file_path.startsWith(f.folder_path))).slice(0, 4)
    })
    return map
  }, [folders, photoState.photos])

  // ─── Render Selected Folder Photos View ────────────────────────────────
  if (selectedFolder) {
    return (
      <div className="folders-page-container">
        <div className="folder-detail-header">
          <div className="folder-detail-left">
            <button
              onClick={() => setSelectedFolder(null)}
              className="btn-back-folders"
              title="Back to all folders"
            >
              <ArrowLeft size={16} />
              <span>All Folders</span>
            </button>
            <div>
              <h1 className="folder-detail-title">
                <div className="apple-folder-icon-badge">
                  <Folder size={20} />
                </div>
                {selectedFolder.folder_name}
              </h1>
              <p className="folder-detail-path">{selectedFolder.folder_path}</p>
            </div>
          </div>

          <div className="folder-detail-right">
            <button
              onClick={(e) => handleSyncSingleFolder(e, selectedFolder)}
              disabled={isSyncing}
              className="btn-primary"
            >
              <RefreshCw size={15} className={isSyncing ? 'spin-icon' : ''} />
              {isSyncing ? 'Syncing...' : 'Sync Disk Changes'}
            </button>
          </div>
        </div>

        <div className="folder-detail-content">
          {loadingFolderPhotos ? (
            <div className="folders-loading-state" style={{ padding: '40px', textAlign: 'center' }}>
              <RefreshCw size={24} className="spin-icon" style={{ color: '#6366f1' }} />
              <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-secondary)' }}>Loading folder photos...</p>
            </div>
          ) : folderPhotos.length === 0 ? (
            <EmptyState
              icon={<Folder size={48} />}
              title="No photos in this folder"
              description="Click Sync Disk Changes to re-scan this folder for media files."
              actionLabel="Sync Disk Changes"
              onAction={() => handleSyncSingleFolder(null as any, selectedFolder)}
            />
          ) : (
            <PhotoGrid photos={folderPhotos} />
          )}
        </div>
      </div>
    )
  }

  // ─── Render Folders Grid View ──────────────────────────────────────────
  return (
    <div className="folders-page-container">
      {/* Top Header */}
      <div className="folders-header">
        <div>
          <h1 className="folders-page-title">
            <div className="apple-folder-icon-badge">
              <HardDrive size={20} />
            </div>
            Imported Folders
          </h1>
          <p className="folders-page-subtitle">
            Tracked directories automatically synced with your physical disk.
          </p>
        </div>

        <div className="folders-header-actions">
          <button
            onClick={handleSyncAll}
            disabled={isSyncing || folders.length === 0}
            className="btn-secondary"
          >
            <RefreshCw size={15} className={isSyncing ? 'spin-icon' : ''} />
            {isSyncing ? 'Syncing All...' : 'Sync All Folders'}
          </button>

          <button onClick={handleImportNewFolder} className="btn-primary">
            <Plus size={16} />
            Import Folder
          </button>
        </div>
      </div>

      {/* Syncing Status Notification Bar */}
      {isSyncing && (
        <div className="sync-status-banner" style={{ margin: '0 0 20px 0', padding: '12px 18px', borderRadius: '16px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 600 }}>
          <RefreshCw size={16} className="spin-icon" />
          <span>{syncMessage || 'Syncing tracked folders with physical disk...'}</span>
        </div>
      )}

      {/* Empty State if No Folders Tracked */}
      {folders.length === 0 ? (
        <EmptyState
          icon={<HardDrive size={48} />}
          title="No Tracked Folders"
          description="Import folders from your computer to enable automated disk synchronization."
          actionLabel="Import Folder Now"
          onAction={handleImportNewFolder}
        />
      ) : (
        <div className="folders-card-grid">
          {folders.map((folder) => {
            const covers = folderCovers[folder.id] || []
            const heroCover = covers[0]

            return (
              <div
                key={folder.id}
                onClick={() => handleSelectFolder(folder)}
                className="apple-folder-card"
              >
                {/* Single Hero Cover Box with Gradient Overlay */}
                <div className="apple-folder-hero-box">
                  {heroCover ? (
                    <>
                      <img
                        src={heroCover.thumbnail_path || heroCover.file_path}
                        alt={folder.folder_name}
                        className="apple-folder-hero-img"
                      />
                      <div className="apple-folder-hero-overlay">
                        <div className="apple-folder-hero-top">
                          <div className="apple-folder-icon-badge">
                            <Folder size={18} />
                          </div>

                          <div className="apple-folder-actions">
                            <button
                              type="button"
                              onClick={(e) => handleSyncSingleFolder(e, folder)}
                              disabled={isSyncing}
                              className="apple-folder-action-btn"
                              title="Sync this folder"
                            >
                              <RefreshCw size={14} className={isSyncing ? 'spin-icon' : ''} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleRemoveFolder(e, folder.id)}
                              className="apple-folder-action-btn danger"
                              title="Untrack folder"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="apple-folder-hero-bottom">
                          <span className="apple-folder-count-pill-floating">
                            {folder.photo_count} {folder.photo_count === 1 ? 'item' : 'items'}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="apple-folder-preview-empty">
                      <div className="apple-folder-icon-badge" style={{ width: '48px', height: '48px', borderRadius: '14px', marginBottom: '8px' }}>
                        <Folder size={24} />
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>No Photos Yet</span>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="apple-folder-name" title={folder.folder_name}>{folder.folder_name}</h3>
                  <p className="apple-folder-path" title={folder.folder_path}>{folder.folder_path}</p>
                </div>

                <div className="apple-folder-card-footer">
                  <span className="apple-folder-count-pill">
                    Tracked Folder
                  </span>
                  <span className="apple-folder-sync-time">
                    <CheckCircle2 size={12} style={{ color: '#10b981' }} />
                    Synced {new Date(folder.last_synced_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
