import React, { ReactNode } from 'react'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export default function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="apple-empty-state-wrapper">
      <div className="apple-empty-state-card">
        <div className="apple-empty-icon-glow">
          <div className="apple-empty-icon-inner">
            {icon}
          </div>
        </div>
        <h2 className="apple-empty-title">{title}</h2>
        <p className="apple-empty-desc">{description}</p>
        {actionLabel && onAction && (
          <button type="button" className="apple-empty-action-btn" onClick={onAction}>
            <span>{actionLabel}</span>
          </button>
        )}
      </div>
    </div>
  )
}
