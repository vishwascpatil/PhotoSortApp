import React, { useState, useCallback, useEffect } from 'react'
import { Search, Grid3x3, LayoutGrid, Sun, Moon, Menu, Minus, Square, X, FolderTree, Download } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { debounce } from '../utils/helpers'

export default function TopBar() {
  const { state, dispatch, toggleTheme, openExportModal } = useApp()
  const [searchInput, setSearchInput] = useState('')
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    async function checkMaximized() {
      if (window.photoVault?.isWindowMaximized) {
        const max = await window.photoVault.isWindowMaximized()
        setIsMaximized(max)
      }
    }
    checkMaximized()
  }, [])

  const debouncedSearch = useCallback(
    debounce((query: string) => {
      dispatch({ type: 'SET_SEARCH', payload: query })
    }, 300),
    [dispatch]
  )

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setSearchInput(val)
    debouncedSearch(val)
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setSearchInput('')
      dispatch({ type: 'SET_SEARCH', payload: '' })
    }
  }

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
        <Menu size={20} />
      </button>

      {/* Search */}
      <div className="topbar-search">
        <Search size={18} className="topbar-search-icon" />
        <input
          className="topbar-search-input"
          placeholder="Search your photos"
          value={searchInput}
          onChange={handleSearchChange}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      {/* Actions */}
      <div className="topbar-actions">
        {/* Organize & Export Folder Button */}
        <button
          className="btn btn-primary"
          onClick={() => openExportModal({ mode: 'copy' })}
          title="Organize files by Year -> Trips -> Documents -> Months and Export"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 700,
            padding: '6px 13px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
            boxShadow: '0 2px 8px rgba(14, 165, 233, 0.25)',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer'
          }}
        >
          <FolderTree size={15} />
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
          {state.gridDensity === 'comfortable' ? <LayoutGrid size={20} /> : state.gridDensity === 'medium' ? <Grid3x3 size={20} /> : <Grid3x3 size={20} style={{ transform: 'scale(0.8)' }} />}
        </button>

        <button
          className="topbar-btn"
          onClick={toggleTheme}
          title="Toggle theme"
        >
          {state.theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Window Controls */}
        <div className="topbar-window-controls">
          <button
            type="button"
            className="topbar-btn window-control-btn"
            onClick={handleMinimize}
            title="Minimize"
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            className="topbar-btn window-control-btn"
            onClick={handleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            <Square size={13} />
          </button>
          <button
            type="button"
            className="topbar-btn window-control-btn window-control-close"
            onClick={handleClose}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  )
}
