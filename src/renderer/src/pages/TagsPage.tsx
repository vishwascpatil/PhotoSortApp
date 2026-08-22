import React, { useState, useEffect, useMemo } from 'react'
import { Tag, Plus, Trash2, Edit2, Sparkles, Filter, Check, MoreVertical, Layers } from 'lucide-react'
import { usePhotos, Photo } from '../contexts/PhotoContext'
import { useApp } from '../contexts/AppContext'
import PhotoGrid from '../components/PhotoGrid'
import SelectionBar from '../components/SelectionBar'
import EmptyState from '../components/EmptyState'
import TagModal from '../components/TagModal'

interface TagItem {
  id: number
  name: string
  color: string
  photo_count?: number
  created_at?: string
}

const DEFAULT_SUGGESTIONS = ['Family', 'Travel', 'Vacation', 'Work', 'Friends', 'Pets', 'Receipts', 'Nature']

export default function TagsPage() {
  const { state: photoState, dispatch: photoDispatch, refreshPhotos } = usePhotos()
  const { showToast } = useApp()

  const [tags, setTags] = useState<TagItem[]>([])
  const [activeTagId, setActiveTagId] = useState<number | 'all'>('all')
  const [photos, setPhotos] = useState<Photo[]>([])
  const [loading, setLoading] = useState(false)
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [editingTag, setEditingTag] = useState<TagItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('#3b82f6')
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)

  useEffect(() => {
    loadTags()
    loadPhotos()
  }, [])

  useEffect(() => {
    loadPhotos()
  }, [activeTagId])

  async function loadTags() {
    try {
      if (window.photoVault?.getAllTags) {
        const loaded = await window.photoVault.getAllTags()
        setTags(loaded || [])
      }
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
  }

  async function loadPhotos() {
    setLoading(true)
    try {
      if (activeTagId === 'all') {
        if (window.photoVault?.getAllTaggedPhotos) {
          const allTagged = await window.photoVault.getAllTaggedPhotos()
          setPhotos(allTagged || [])
        }
      } else {
        if (window.photoVault?.getPhotosByTag) {
          const tagPhotos = await window.photoVault.getPhotosByTag(activeTagId)
          setPhotos(tagPhotos || [])
        }
      }
    } catch (err) {
      console.error('Failed to load tagged photos:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateSuggestedTag = async (name: string) => {
    try {
      if (window.photoVault?.createTag) {
        const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#f97316']
        const randomColor = colors[Math.floor(Math.random() * colors.length)]
        const created = await window.photoVault.createTag(name, randomColor)
        await loadTags()
        setActiveTagId(created.id)
        showToast(`Created tag "${name}"`)
      }
    } catch (err: any) {
      showToast(`Error: ${err?.message || err}`)
    }
  }

  const handleDeleteTag = async (tagId: number, tagName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Delete tag "${tagName}"? Photos will not be deleted.`)) return

    try {
      if (window.photoVault?.deleteTag) {
        await window.photoVault.deleteTag(tagId)
        if (activeTagId === tagId) {
          setActiveTagId('all')
        }
        await loadTags()
        await loadPhotos()
        showToast(`Deleted tag "${tagName}"`)
      }
    } catch (err: any) {
      showToast(`Error deleting tag: ${err?.message || err}`)
    }
  }

  const handleSaveEditTag = async () => {
    if (!editingTag || !editName.trim()) return

    try {
      if (window.photoVault?.renameTag) {
        await window.photoVault.renameTag(editingTag.id, editName.trim(), editColor)
        await loadTags()
        setEditingTag(null)
        showToast('Tag updated')
      }
    } catch (err: any) {
      showToast(`Error updating tag: ${err?.message || err}`)
    }
  }

  const currentActiveTag = useMemo(() => {
    if (activeTagId === 'all') return null
    return tags.find(t => t.id === activeTagId) || null
  }, [tags, activeTagId])

  const totalTaggedCount = useMemo(() => {
    return tags.reduce((acc, t) => acc + (t.photo_count || 0), 0)
  }, [tags])

  return (
    <div className="photos-page" style={{ padding: '20px 28px' }}>
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: currentActiveTag
                ? currentActiveTag.color
                : 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              boxShadow: '0 3px 10px rgba(139, 92, 246, 0.3)',
              transition: 'background 0.2s ease'
            }}
          >
            <Tag size={20} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {currentActiveTag ? currentActiveTag.name : 'Tags'}
              </h1>
              <span
                style={{
                  background: currentActiveTag ? `${currentActiveTag.color}22` : 'rgba(139, 92, 246, 0.12)',
                  color: currentActiveTag ? currentActiveTag.color : '#8b5cf6',
                  fontWeight: 700,
                  fontSize: '12px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: currentActiveTag ? `1px solid ${currentActiveTag.color}44` : 'none'
                }}
              >
                {photos.length} photo{photos.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsCreatingTag(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '6px 14px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)'
            }}
          >
            <Plus size={14} /> New Tag
          </button>
        </div>
      </div>

      {/* ─── Tag Filter Pills Bar ────────────────────────────────────────── */}
      {tags.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            overflowX: 'auto',
            paddingBottom: '12px',
            marginBottom: '16px',
            borderBottom: '1px solid var(--border, #334155)'
          }}
        >
          {/* All Tagged Photos Pill */}
          <button
            type="button"
            onClick={() => setActiveTagId('all')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              border: activeTagId === 'all' ? '1.5px solid var(--primary, #3b82f6)' : '1px solid var(--border, #334155)',
              backgroundColor: activeTagId === 'all' ? 'var(--primary, #3b82f6)' : 'var(--bg-secondary, #1e293b)',
              color: activeTagId === 'all' ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
              transition: 'all 0.15s ease'
            }}
          >
            <Layers size={14} />
            All Tagged Photos
          </button>

          {/* Individual Tag Pills */}
          {tags.map((t) => {
            const isActive = activeTagId === t.id
            return (
              <div
                key={t.id}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  borderRadius: '20px',
                  border: isActive ? `1.5px solid ${t.color}` : '1px solid var(--border, #334155)',
                  backgroundColor: isActive ? t.color : 'var(--bg-secondary, #1e293b)',
                  color: isActive ? '#ffffff' : 'var(--text-primary, #f8fafc)',
                  padding: '2px 4px 2px 10px',
                  fontSize: '13px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer'
                }}
                onClick={() => setActiveTagId(t.id)}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: isActive ? '#ffffff' : t.color,
                    marginRight: '6px'
                  }}
                />
                <span>{t.name}</span>
                <span
                  style={{
                    fontSize: '11px',
                    marginLeft: '6px',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)',
                    color: isActive ? '#ffffff' : 'var(--text-secondary, #94a3b8)'
                  }}
                >
                  {t.photo_count || 0}
                </span>

                {/* Edit Tag button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingTag(t)
                    setEditName(t.name)
                    setEditColor(t.color)
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isActive ? '#ffffff' : 'var(--text-secondary, #94a3b8)',
                    cursor: 'pointer',
                    padding: '4px',
                    marginLeft: '2px',
                    display: 'flex'
                  }}
                  title="Edit Tag"
                >
                  <Edit2 size={11} />
                </button>

                {/* Delete Tag button */}
                <button
                  type="button"
                  onClick={(e) => handleDeleteTag(t.id, t.name, e)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: isActive ? '#ffffff' : 'rgba(239, 68, 68, 0.7)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex'
                  }}
                  title="Delete Tag"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Tagged Photos Grid / Empty States ───────────────────────────── */}
      {tags.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <EmptyState
            icon={<Tag size={48} color="var(--primary)" />}
            title="No Tags Created Yet"
            description="Organize your photos with custom tags like Family, Vacation, Pets, or Work."
            actionLabel="Create Tag"
            onAction={() => setIsCreatingTag(true)}
          />

          <div style={{ marginTop: '24px' }}>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Quick Suggestions:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {DEFAULT_SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => handleCreateSuggestedTag(sug)}
                  style={{
                    fontSize: '12px',
                    padding: '6px 14px',
                    borderRadius: '20px',
                    border: '1px solid var(--border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={12} /> {sug}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : photos.length === 0 ? (
        <EmptyState
          icon={<Tag size={48} color={currentActiveTag ? currentActiveTag.color : 'var(--primary)'} />}
          title={currentActiveTag ? `No Photos Tagged as "${currentActiveTag.name}"` : 'No Tagged Photos Found'}
          description="Select photos from your library or open a photo in the viewer to assign tags."
          actionLabel="View All Photos"
          onAction={() => photoDispatch({ type: 'SET_FILTER', payload: {} })}
        />
      ) : (
        <PhotoGrid photos={photos} />
      )}

      {/* ─── Selection Bar ───────────────────────────────────────────────── */}
      <SelectionBar
        onTag={() => setIsTagModalOpen(true)}
      />

      {/* ─── Tag Selection / Application Modal ────────────────────────────── */}
      <TagModal
        photoIds={Array.from(photoState.selectedIds)}
        isOpen={isTagModalOpen || isCreatingTag}
        onClose={() => {
          setIsTagModalOpen(false)
          setIsCreatingTag(false)
          loadTags()
          loadPhotos()
        }}
        onApplied={() => {
          loadTags()
          loadPhotos()
          refreshPhotos()
        }}
      />

      {/* ─── Edit Tag Modal ──────────────────────────────────────────────── */}
      {editingTag && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
          onClick={() => setEditingTag(null)}
        >
          <div
            style={{
              width: '380px',
              maxWidth: '92vw',
              backgroundColor: 'var(--bg-secondary, #1e293b)',
              borderRadius: '16px',
              border: '1px solid var(--border, #334155)',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              color: 'var(--text-primary, #f8fafc)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 700 }}>
              Edit Tag
            </h3>

            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveEditTag()}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border, #334155)',
                backgroundColor: 'var(--bg-primary, #0f172a)',
                color: 'var(--text-primary, #f8fafc)',
                fontSize: '13px',
                marginBottom: '14px'
              }}
            />

            {/* Color Palette */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px' }}>
              {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#f97316', '#6366f1'].map((c) => (
                <div
                  key={c}
                  onClick={() => setEditColor(c)}
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    cursor: 'pointer',
                    border: editColor === c ? '2.5px solid #ffffff' : 'none'
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingTag(null)}
                style={{ fontSize: '12px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveEditTag}
                disabled={!editName.trim()}
                style={{ fontSize: '12px' }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
