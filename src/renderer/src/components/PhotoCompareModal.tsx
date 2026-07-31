import React from 'react'
import { X, Columns } from 'lucide-react'
import { Photo } from '../contexts/PhotoContext'
import { getBestDisplayUrl, formatDate } from '../utils/helpers'

interface PhotoCompareModalProps {
  photo1: Photo
  photo2: Photo
  onClose: () => void
}

export default function PhotoCompareModal({ photo1, photo2, onClose }: PhotoCompareModalProps) {
  const img1Src = getBestDisplayUrl(photo1)
  const img2Src = getBestDisplayUrl(photo2)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '90vw', width: '1200px', height: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Columns size={20} color="var(--accent)" />
            <h3 className="modal-title">Side-by-Side Photo Comparison</h3>
          </div>
          <button className="viewer-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', overflow: 'hidden' }}>
          {/* Photo 1 */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-tertiary)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '12px' }}>
              <img src={img1Src} alt={photo1.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{photo1.filename}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{formatDate(photo1.created_at)} · {photo1.width}×{photo1.height}</div>
            </div>
          </div>

          {/* Photo 2 */}
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-tertiary)', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '12px' }}>
              <img src={img2Src} alt={photo2.filename} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{photo2.filename}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{formatDate(photo2.created_at)} · {photo2.width}×{photo2.height}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
