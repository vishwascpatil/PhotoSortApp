import React from 'react'
import {
  CheckCircle2,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  Info,
  Trash2,
  RefreshCw,
  FolderCheck,
  X
} from 'lucide-react'
import { useApp, Toast } from '../contexts/AppContext'

interface ParsedToast {
  type: 'success' | 'error' | 'warning' | 'info'
  title: string
  message: string
  icon: React.ReactNode
}

function parseToast(toast: Toast): ParsedToast {
  const rawMsg = toast.message || ''
  const lower = rawMsg.toLowerCase()

  let type: 'success' | 'error' | 'warning' | 'info' = toast.type || 'info'
  let title = toast.title || ''
  let displayMessage = rawMsg

  // Automatically detect type if not explicitly supplied
  if (!toast.type) {
    if (lower.includes('fail') || lower.includes('error') || lower.includes('denied')) {
      type = 'error'
    } else if (
      lower.includes('complete') ||
      lower.includes('finished') ||
      lower.includes('success') ||
      lower.includes('cleared') ||
      lower.includes('synced') ||
      lower.includes('restored') ||
      lower.includes('kept') ||
      lower.includes('merged')
    ) {
      type = 'success'
    } else if (lower.includes('warning') || lower.includes('stopped') || lower.includes('cancel')) {
      type = 'warning'
    } else {
      type = 'info'
    }
  }

  // Automatically determine title & polish message display
  if (!title) {
    if (lower.includes('scan') && (lower.includes('complete') || lower.includes('finished'))) {
      title = 'Scan Complete'
      // Strip redundant heading phrases if present in raw string
      displayMessage = rawMsg
        .replace(/^complete scan finished!/i, '')
        .replace(/^scan complete:?/i, '')
        .replace(/^scan completed!/i, '')
        .replace(/^large files scan completed!/i, 'Large files scan completed successfully.')
        .replace(/^face scanning complete!/i, 'Face recognition and grouping complete.')
        .replace(/^deep scan complete!/i, 'Deep scan and neural analysis complete.')
        .replace(/^document scanning complete!/i, 'Document detection and classification complete.')
        .trim()
      if (!displayMessage) {
        displayMessage = rawMsg
      }
    } else if (lower.includes('sync')) {
      title = 'Sync Complete'
      displayMessage = rawMsg.replace(/^disk sync complete!/i, '').trim() || rawMsg
    } else if (lower.includes('trash') || lower.includes('deleted')) {
      title = 'Moved to Trash'
    } else if (lower.includes('jumped to year')) {
      title = 'Timeline Jump'
    } else if (type === 'error') {
      title = 'Action Failed'
    } else if (type === 'success') {
      title = 'Success'
    } else {
      title = 'Notification'
    }
  }

  // Assign tailored status icon
  let icon: React.ReactNode
  if (type === 'error') {
    icon = <AlertCircle size={18} strokeWidth={2.2} />
  } else if (type === 'warning') {
    icon = <AlertTriangle size={18} strokeWidth={2.2} />
  } else if (lower.includes('trash') || lower.includes('delete')) {
    icon = <Trash2 size={18} strokeWidth={2.1} />
  } else if (lower.includes('sync')) {
    icon = <RefreshCw size={17} strokeWidth={2.2} />
  } else if (lower.includes('library') || lower.includes('folder')) {
    icon = <FolderCheck size={18} strokeWidth={2.1} />
  } else if (type === 'success') {
    icon = <CheckCircle2 size={18} strokeWidth={2.2} />
  } else {
    icon = <Sparkles size={18} strokeWidth={2.1} />
  }

  return { type, title, message: displayMessage, icon }
}

function ToastItem({
  toast,
  onDismiss
}: {
  toast: Toast
  onDismiss: (id: string) => void
}) {
  const parsed = parseToast(toast)
  const duration = toast.duration || 5000

  return (
    <div
      className={`toast toast-${parsed.type}`}
      role="alert"
      aria-live="polite"
    >
      {/* Accent Glass Glow Line */}
      <div className={`toast-accent-line toast-accent-${parsed.type}`} />

      {/* Rich Status Icon Badge */}
      <div className={`toast-icon-badge toast-badge-${parsed.type}`}>
        {parsed.icon}
      </div>

      {/* Main Notification Body */}
      <div className="toast-body">
        <div className="toast-header-row">
          <span className="toast-title">{parsed.title}</span>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>

        <p className="toast-message">{parsed.message}</p>

        {toast.undoAction && (
          <button
            type="button"
            className="toast-undo"
            onClick={() => {
              toast.undoAction?.()
              onDismiss(toast.id)
            }}
          >
            Undo
          </button>
        )}
      </div>

      {/* Timed Progress Countdown Bar */}
      <div className="toast-progress-track">
        <div
          className={`toast-progress-fill toast-progress-${parsed.type}`}
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  )
}

export default function ToastContainer() {
  const { state, dispatch } = useApp()

  if (state.toasts.length === 0) return null

  return (
    <aside className="toast-container" aria-label="Notifications">
      {state.toasts.map(toast => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={(id) => dispatch({ type: 'REMOVE_TOAST', payload: id })}
        />
      ))}
    </aside>
  )
}
