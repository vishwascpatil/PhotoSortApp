import React, { useState, useEffect } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useApp } from '../contexts/AppContext'

export default function WelcomePage() {
  const { navigateTo, dispatch } = useApp();
  const [hasExistingLibrary, setHasExistingLibrary] = useState<boolean>(false);

  useEffect(() => {
    async function checkLibrary() {
      try {
        if (window.photoVault) {
          const [folders, stats] = await Promise.all([
            window.photoVault.getImportedFolders ? window.photoVault.getImportedFolders() : [],
            window.photoVault.getStats ? window.photoVault.getStats() : { totalPhotos: 0 }
          ]);

          const hasFolders = Array.isArray(folders) && folders.length > 0;
          const hasPhotos = stats && stats.totalPhotos > 0;

          if (hasFolders && hasPhotos) {
            setHasExistingLibrary(true);
            // setChecking(false); // removed unused state
            // Show loader for 2 seconds then navigate to overview
            setTimeout(() => {
              navigateTo('overview');
            }, 2000);
            return;
          }
        }
      } catch (err) {
        console.error('Error checking imported folders:', err);
      }
      setHasExistingLibrary(false);
    }

    checkLibrary();
  }, [navigateTo]);

  const handleGetStarted = () => {
    // Directly navigate to the main overview with the Import Folders sidebar active
    navigateTo('folders');
  }

  return (
    <div className="welcome-container welcome-white">
      {/* Main Center Content */}
      <div className="welcome-content">
        {/* App Title */}
        <h1 className="welcome-app-title welcome-app-title-dark">
          <span className="title-photo-dark">Photo</span>
          <span className="title-sort-gradient">Sort</span>
        </h1>

        {/* Horizontal Subtle Divider Accent */}
        <div className="welcome-accent-line" />

        {/* Tagline Statements */}
        <div className="welcome-hero-text">
          <h2 className="hero-heading hero-heading-dark">
            All your memories.<br />
            Organized beautifully.
          </h2>
          <p className="hero-subtext hero-subtext-dark">
            The intelligent way to browse, find, and relive<br />
            your photos and videos.
          </p>
        </div>

        {/* Action Area: Loader for returning users, Get Started for new users */}
        <div className="welcome-action-area">
          {hasExistingLibrary ? (
            <div className="welcome-library-loader">
              <div className="welcome-progress-container">
                <div className="welcome-progress-bar"></div>
              </div>
              <span className="loader-text-subtle">Loading your media library...</span>
            </div>
          ) : (
            <button 
              type="button"
              className="welcome-btn-primary" 
              onClick={handleGetStarted}
            >
              <span>Get Started</span>
              <ArrowRight className="btn-icon-arrow" size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
