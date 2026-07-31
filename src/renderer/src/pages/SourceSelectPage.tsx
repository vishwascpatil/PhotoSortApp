import React from 'react'
import { ArrowRight, Folder, Monitor, Lock } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import folderIcon from '../assets/folder_card_icon.png'
import googlePhotosIcon from '../assets/google_photos_icon.png'

export default function SourceSelectPage() {
  const { navigateTo, showToast, dispatch } = useApp()

  const handleSelectFolder = async () => {
    try {
      if (window.photoVault && window.photoVault.importFolder) {
        // 1. Open native OS folder picker FIRST without navigating!
        const result = await window.photoVault.importFolder()

        // 2. If user canceled folder dialog or 0 files imported, STAY on current screen!
        if (result === null || result === false || (typeof result === 'object' && result.success === false)) {
          return
        }

        // 3. ONLY AFTER folder selection is confirmed, dispatch scanning status & navigate!
        dispatch({
          type: 'SET_IMPORT_STATUS',
          payload: {
            active: true,
            stage: 'scanning',
            message: 'Scanning folder structure for photos, videos & documents...',
            total: 0,
            completed: 0
          }
        })
        navigateTo('scanning-library')
      }
    } catch (err) {
      console.error('Import folder error:', err)
    }
  }

  const handleConnectGooglePhotos = () => {
    showToast('Google Photos integration: Connect account coming soon!')
    navigateTo('overview')
  }

  return (
    <div className="source-select-container">
      {/* Hero Headline Section */}
      <div className="source-hero-header">
        <h1 className="source-title">Where are your photos?</h1>
        <div className="welcome-accent-line" style={{ margin: '16px auto 20px' }} />
        <p className="source-subtitle">
          Choose a source to import and organize your memories<br />
          in <span className="title-sort-gradient" style={{ fontWeight: 700 }}>PhotoSort</span>.
        </p>
      </div>

      {/* Side-by-Side Source Cards */}
      <div className="source-cards-grid">
        {/* Card 1: Import from Folder */}
        <div className="source-card">
          <div className="source-card-icon-wrapper">
            <img 
              src={folderIcon} 
              alt="Folder Source" 
              className="source-card-img-icon"
            />
          </div>

          <h2 className="source-card-title">Import from Folder</h2>
          <p className="source-card-desc">
            Choose folders from your computer<br />or external drives.
          </p>

          <button 
            type="button"
            className="source-btn-gradient"
            onClick={handleSelectFolder}
          >
            <div className="btn-left-content">
              <div className="btn-icon-circle-white">
                <Folder size={15} className="icon-folder-blue-small" />
              </div>
              <span>Select Folder</span>
            </div>
            <ArrowRight size={18} className="icon-arrow-slide" />
          </button>

          <div className="source-card-footer">
            <Monitor size={16} className="footer-icon" />
            <span>Works with folders on this computer and connected drives.</span>
          </div>
        </div>

        {/* Card 2: Google Photos */}
        <div className="source-card">
          <div className="source-card-icon-wrapper">
            <img 
              src={googlePhotosIcon} 
              alt="Google Photos Source" 
              className="source-card-img-icon"
            />
          </div>

          <h2 className="source-card-title">Google Photos</h2>
          <p className="source-card-desc">
            Connect your Google account to access<br />your photos and videos.
          </p>

          <button 
            type="button"
            className="source-btn-gradient"
            onClick={handleConnectGooglePhotos}
          >
            <div className="btn-left-content">
              <div className="btn-icon-circle-white">
                <svg className="google-g-svg" viewBox="0 0 24 24" width="15" height="15">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
              </div>
              <span>Connect Google Photos</span>
            </div>
            <ArrowRight size={18} className="icon-arrow-slide" />
          </button>

          <div className="source-card-footer">
            <Lock size={16} className="footer-icon" />
            <span>We only access your media. Your data stays private and secure.</span>
          </div>
        </div>
      </div>
    </div>
  )
}
