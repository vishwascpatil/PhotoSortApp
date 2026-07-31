import React, { useState, useEffect } from 'react'
import { Lock, Unlock, KeyRound, ShieldAlert, RotateCcw } from 'lucide-react'
import { usePhotos } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import EmptyState from '../components/EmptyState'

export default function LockedFolderPage() {
  const { state, loadPhotos, dispatch, refreshPhotos } = usePhotos()
  const { showToast } = useApp()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [storedPin, setStoredPin] = useState<string | null>(localStorage.getItem('photovault_locked_pin'))
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated) {
      loadPhotos({ isLocked: true })
    }
  }, [isAuthenticated, loadPhotos])

  function handlePinSubmit(digit: string) {
    if (pin.length >= 4) return
    const newPin = pin + digit
    setPin(newPin)
    setError('')

    if (newPin.length === 4) {
      if (!storedPin) {
        // Setup initial PIN
        localStorage.setItem('photovault_locked_pin', newPin)
        setStoredPin(newPin)
        setIsAuthenticated(true)
        showToast('Locked Folder PIN set successfully!')
      } else if (newPin === storedPin) {
        setIsAuthenticated(true)
      } else {
        setError('Incorrect PIN. Try again.')
        setPin('')
      }
    }
  }

  function handleClearPin() {
    setPin('')
    setError('')
  }

  async function handleUnlockSelected() {
    const ids = Array.from(state.selectedIds)
    if (ids.length === 0) return
    await window.photoVault.lockPhotos(ids, false)
    dispatch({ type: 'REMOVE_PHOTOS', payload: ids })
    showToast(`${ids.length} photo${ids.length > 1 ? 's' : ''} moved out of Locked Folder`)
  }

  if (!isAuthenticated) {
    return (
      <div className="locked-folder-auth">
        <div className="locked-folder-card">
          <div className="locked-folder-icon">
            <Lock size={48} color="var(--accent)" />
          </div>

          <h2 className="locked-folder-title">
            {storedPin ? 'Locked Folder' : 'Set up Locked Folder'}
          </h2>
          <p className="locked-folder-subtitle">
            {storedPin
              ? 'Enter your 4-digit PIN to view protected photos'
              : 'Create a 4-digit PIN to protect sensitive photos'}
          </p>

          {/* PIN Dots */}
          <div className="pin-dots">
            {[0, 1, 2, 3].map(idx => (
              <div key={idx} className={`pin-dot ${idx < pin.length ? 'filled' : ''}`} />
            ))}
          </div>

          {error && <div className="pin-error">{error}</div>}

          {/* Keypad */}
          <div className="pin-keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'C'].map((btn, idx) => {
              if (btn === '') return <div key={idx} />
              if (btn === 'C') return (
                <button key={idx} className="keypad-btn action" onClick={handleClearPin}>
                  C
                </button>
              )
              return (
                <button key={idx} className="keypad-btn" onClick={() => handlePinSubmit(btn)}>
                  {btn}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (!state.isLoading && state.photos.length === 0) {
    return (
      <EmptyState
        icon={<Lock size={48} />}
        title="Locked Folder is empty"
        description="Photos moved to Locked Folder are hidden from your main library, search, and albums."
      />
    )
  }

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Locked Folder</h1>
        <div className="page-actions">
          <button className="btn btn-ghost" onClick={() => setIsAuthenticated(false)}>
            <Lock size={16} /> Lock Vault
          </button>
        </div>
      </div>

      {state.selectedIds.size > 0 && (
        <div className="selection-bar">
          <div className="selection-bar-count">
            <button className="selection-bar-btn" onClick={() => dispatch({ type: 'DESELECT_ALL' })}>
              ✕
            </button>
            {state.selectedIds.size} selected
          </div>
          <button className="selection-bar-btn" onClick={handleUnlockSelected} title="Move out of Locked Folder">
            <Unlock size={20} />
          </button>
        </div>
      )}

      <PhotoGrid photos={state.photos} showDateHeaders={true} />
    </>
  )
}
