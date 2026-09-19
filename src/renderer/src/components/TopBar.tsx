import React, { useState, useEffect } from 'react'
import { Grid3x3, LayoutGrid, Sun, Moon, Menu, Minus, Square, X, FolderTree, Download } from 'lucide-react'
import { useApp } from '../contexts/AppContext'

export default function TopBar() {
  const { state, dispatch, toggleTheme, openExportModal } = useApp()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let mounted = true
    async function checkMaximized() {
      if (window.photoVault?.isWindowMaximized) {
        const max = await window.photoVault.isWindowMaximized()
        if (mounted) setIsMaximized(max)
      }
    }
    checkMaximized()

    const onResize = () => {
      checkMaximized()
    }
    window.addEventListener('resize', onResize)

    const cleanup = window.photoVault?.onWindowStateChanged?.((max: boolean) => {
      if (mounted) setIsMaximized(max)
    })

    return () => {
      mounted = false
      window.removeEventListener('resize', onResize)
      cleanup?.()
    }
  }, [])

  const handleMinimize = async () => {
    if (window.photoVault?.minimizeWindow) {
      await window.photoVault.minimizeWindow()
    }
  }

  const handleMaximize = async () => {
    if (window.photoVault?.maximizeWindow) {
      const max = await window.photoVault.maximizeWindow()
      setIsMaximized(max)
    }
  }

  const handleClose = async () => {
    if (window.photoVault?.closeWindow) {
      await window.photoVault.closeWindow()
    }
  }

  return (
    <div className={`topbar ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Hamburger */}
      <button
        className="topbar-btn"
        onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
        title="Toggle sidebar"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Menu size={18} />
      </button>

      {/* Actions */}
      <div className="topbar-actions">
        {/* Organize & Export Folder Button */}
        <button
          type="button"
          className="topbar-organize-btn"
          onClick={() => openExportModal({ mode: 'copy' })}
          title="Organize files by Year -> Trips -> Documents -> Months and Export"
        >
          <FolderTree size={14} />
          <span>Organize & Export</span>
        </button>

        <button
          className="topbar-btn"
          onClick={() => {
            let next: 'comfortable' | 'medium' | 'dense' = 'medium'
            if (state.gridDensity === 'comfortable') next = 'medium'
            else if (state.gridDensity === 'medium') next = 'dense'
            else next = 'comfortable'
            dispatch({ type: 'SET_GRID_DENSITY', payload: next })
          }}
          title={`Grid density: ${state.gridDensity}`}
        >
          {state.gridDensity === 'comfortable' ? <LayoutGrid size={17} /> : state.gridDensity === 'medium' ? <Grid3x3 size={17} /> : <Grid3x3 size={17} style={{ transform: 'scale(0.8)' }} />}
        </button>

        <button
          className="topbar-btn"
          onClick={toggleTheme}
          title="Toggle theme"
        >
          {state.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Window Controls */}
        <div className="topbar-window-controls">
          <button
            type="button"
            className="topbar-btn window-control-btn"
            onClick={handleMinimize}
            title="Minimize"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="topbar-btn window-control-btn"
            onClick={handleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? (
              <svg width={11} height={11} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M4.5 4.5V1.5C4.5 1.22386 4.72386 1 5 1H14.5C14.7761 1 15 1.22386 15 1.5V11C15 11.2761 14.7761 11.5 14.5 11.5H11.5" />
                <rect x="1" y="4.5" width="10.5" height="10.5" rx="0.5" />
              </svg>
            ) : (
              <Square size={11} />
            )}
          </button>
          <button
            type="button"
            className="topbar-btn window-control-btn window-control-close"
            onClick={handleClose}
            title="Close"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
