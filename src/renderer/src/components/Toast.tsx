import React from 'react'
import { useApp } from '../contexts/AppContext'

export default function ToastContainer() {
  const { state, dispatch } = useApp()

  if (state.toasts.length === 0) return null

  return (
    <div className="toast-container">
      {state.toasts.map(toast => (
        <div key={toast.id} className="toast">
          <span>{toast.message}</span>
          {toast.undoAction && (
            <button
              className="toast-undo"
              onClick={() => {
                toast.undoAction?.()
                dispatch({ type: 'REMOVE_TOAST', payload: toast.id })
              }}
            >
              Undo
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
