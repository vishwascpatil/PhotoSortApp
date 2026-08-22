import React, { useState, useEffect, useCallback } from 'react'
import { Upload } from 'lucide-react'
import { AppProvider, useApp } from './contexts/AppContext'
import { PhotoProvider, usePhotos } from './contexts/PhotoContext'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import PhotoViewer from './components/PhotoViewer'
import PhotoEditor from './components/PhotoEditor'
import ToastContainer from './components/Toast'
import PhotosPage from './pages/PhotosPage'
import FavoritesPage from './pages/FavoritesPage'
import VideosPage from './pages/VideosPage'

import TrashPage from './pages/TrashPage'
import SearchPage from './pages/SearchPage'
import ExplorePage from './pages/ExplorePage'
import DuplicatesPage from './pages/DuplicatesPage'
import ScreenshotsPage from './pages/ScreenshotsPage'
import LargeFilesPage from './pages/LargeFilesPage'
import JunkPage from './pages/JunkPage'
import DocumentsPage from './pages/DocumentsPage'

import FoldersPage from './pages/FoldersPage'
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal'

import WelcomePage from './pages/WelcomePage'

import OverviewPage from './pages/OverviewPage'
import ScanningLibraryPage from './pages/ScanningLibraryPage'

function AppContent() {
  const { state } = useApp()
  const { state: photoState } = usePhotos()
  const [isDragging, setIsDragging] = useState(false)

  // Drag and drop handler
  useEffect(() => {
    function handleDragOver(e: DragEvent) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(true)
    }
    function handleDragLeave(e: DragEvent) {
      e.preventDefault()
      e.stopPropagation()
      if (e.clientX === 0 && e.clientY === 0) {
        setIsDragging(false)
      }
    }
    function handleDrop(e: DragEvent) {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      if (e.dataTransfer?.files.length) {
        window.photoVault.importFolder()
      }
    }
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
    }
  }, [])

  const [shortcutsModal, setShortcutsModal] = useState(false)

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === '?' || (e.key === '/' && e.shiftKey) || (e.code === 'Slash' && e.shiftKey)) {
        e.preventDefault()
        setShortcutsModal(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  if (state.currentView === 'welcome') {
    return (
      <div className="welcome-app-wrapper">
        <WelcomePage />
        <ToastContainer />
      </div>
    )
  }

  

  function renderPage() {
    switch (state.currentView) {
      case 'welcome':
        return <WelcomePage />

      case 'overview':
        return <OverviewPage />
      case 'scanning-library':
        return <ScanningLibraryPage />
      case 'photos':
        return <PhotosPage />
      case 'videos':
        return <VideosPage />
      case 'explore':
        return <ExplorePage />
      case 'people':
        return <ExplorePage initialTab="people" />
      case 'places':
      case 'tags':
        return <ExplorePage initialTab="map" />
      case 'documents':
        return <DocumentsPage />
      case 'duplicates':
      case 'similar':
        return <DuplicatesPage />
      case 'screenshots':
        return <ScreenshotsPage />
      case 'large-files':
        return <LargeFilesPage />
      case 'junk':
      case 'whatsapp':
        return <JunkPage />
      case 'folders':
      case 'google-photos':
        return <FoldersPage />
      case 'favorites':
        return <FavoritesPage />
      case 'trash':
        return <TrashPage />
      case 'search':
        return <SearchPage />
      default:
        return <PhotosPage />
    }
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <TopBar />
        <div className="app-content">
          {renderPage()}
        </div>
      </div>

      {/* Photo Viewer Overlay */}
      {photoState.viewerPhotoId !== null && <PhotoViewer />}

      {/* Photo Editor Overlay */}
      {photoState.editingPhotoId !== null && <PhotoEditor />}

      {/* Toasts */}
      <ToastContainer />

      {/* Keyboard Shortcuts Modal (?) */}
      {shortcutsModal && (
        <KeyboardShortcutsModal onClose={() => setShortcutsModal(false)} />
      )}

      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            <Upload size={64} />
            <h2>Drop photos here</h2>
            <p>Release to import your photos</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <PhotoProvider>
        <AppContent />
      </PhotoProvider>
    </AppProvider>
  )
}
