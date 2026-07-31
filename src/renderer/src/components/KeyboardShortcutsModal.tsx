import React from 'react'
import { X, Keyboard, Command } from 'lucide-react'

interface KeyboardShortcutsModalProps {
  onClose: () => void
}

const shortcuts = [
  { key: 'F', description: 'Favorite / Unfavorite photo' },
  { key: 'E', description: 'Open photo editor' },
  { key: 'I', description: 'Toggle EXIF info panel' },
  { key: 'Space', description: 'Play / Pause slideshow or story' },
  { key: '← / →', description: 'Navigate to previous / next photo' },
  { key: 'Del / Backspace', description: 'Move selected photo to Trash' },
  { key: 'Ctrl + A / Cmd + A', description: 'Select all photos in view' },
  { key: 'Esc', description: 'Close lightbox, editor, or clear selection' },
  { key: '?', description: 'Open keyboard shortcuts menu' },
]

export default function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Keyboard size={22} color="var(--accent)" />
            <h3 className="modal-title">Keyboard Shortcuts</h3>
          </div>
          <button className="viewer-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px' }}>
          {shortcuts.map(item => (
            <div key={item.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: '8px' }}>
              <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{item.description}</span>
              <kbd style={{
                background: 'var(--bg-secondary)', border: '1px solid var(--border-strong)',
                borderRadius: '6px', padding: '3px 8px', fontSize: '12px', fontFamily: 'monospace',
                fontWeight: 600, color: 'var(--accent)'
              }}>
                {item.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
