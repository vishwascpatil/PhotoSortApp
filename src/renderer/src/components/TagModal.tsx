import React, { useState, useEffect, useMemo } from 'react'
import { X, Tag, Plus, Check, Search, Sparkles } from 'lucide-react'
import { useApp } from '../contexts/AppContext'
import { usePhotos } from '../contexts/PhotoContext'

interface TagItem {
  id: number
  name: string
  color: string
  photo_count?: number
}

interface TagModalProps {
  photoIds: number[]
  isOpen: boolean
  onClose: () => void
  onApplied?: () => void
}

const TAG_COLOR_PALETTE = [
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#14b8a6'  // Teal
]

export default function TagModal({ photoIds, isOpen, onClose, onApplied }: TagModalProps) {
  const { showToast } = useApp()
  const { refreshPhotos } = usePhotos()

  const [allTags, setAllTags] = useState<TagItem[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_PALETTE[0])
  const [isCreating, setIsCreating] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadTags()
      setSearchQuery('')
      setIsCreating(false)
    }
  }, [isOpen, photoIds])

  async function loadTags() {
    try {
      if (window.photoVault?.getAllTags) {
        const tags = await window.photoVault.getAllTags()
        setAllTags(tags || [])

        // If single photo, pre-populate existing tags
        if (photoIds.length === 1 && window.photoVault.getTagsForPhoto) {
          const photoTags = await window.photoVault.getTagsForPhoto(photoIds[0])
          setSelectedTagIds(new Set((photoTags || []).map(t => t.id)))
        } else if (photoIds.length > 1 && window.photoVault.getTagsForPhoto) {
          // For multiple photos, find common tags or start clean
          const firstPhotoTags = await window.photoVault.getTagsForPhoto(photoIds[0])
          setSelectedTagIds(new Set((firstPhotoTags || []).map(t => t.id)))
        } else {
          setSelectedTagIds(new Set())
        }
      }
    } catch (err) {
      console.error('Failed to load tags in TagModal:', err)
    }
  }

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return allTags
    const q = searchQuery.toLowerCase()
    return allTags.filter(t => t.name.toLowerCase().includes(q))
  }, [allTags, searchQuery])

  const handleToggleTag = (tagId: number) => {
    setSelectedTagIds(prev => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleCreateTag = async () => {
    const trimmed = newTagName.trim() || searchQuery.trim()
    if (!trimmed) return

    try {
      if (window.photoVault?.createTag) {
        const created = await window.photoVault.createTag(trimmed, newTagColor)
        setAllTags(prev => {
          if (prev.some(t => t.id === created.id)) return prev
          return [...prev, created]
        })
        setSelectedTagIds(prev => new Set(prev).add(created.id))
        setNewTagName('')
        setSearchQuery('')
        setIsCreating(false)
        showToast(`Created and selected tag "${trimmed}"`)
      }
    } catch (err: any) {
      showToast(`Error creating tag: ${err?.message || err}`)
    }
  }

  const handleApplyTags = async () => {
    if (photoIds.length === 0) return
    setLoading(true)

    try {
      const tagIds = Array.from(selectedTagIds)
      if (window.photoVault?.syncPhotoTags) {
        await window.photoVault.syncPhotoTags(photoIds, tagIds)
      } else if (window.photoVault?.addTagsToPhotos) {
        await window.photoVault.addTagsToPhotos(photoIds, tagIds)
      }

      showToast(
        photoIds.length > 1
          ? `Updated tags for ${photoIds.length} photos`
          : `Tags updated (${tagIds.length} tag${tagIds.length === 1 ? '' : 's'} assigned)`
      )

      if (onApplied) onApplied()
      refreshPhotos()
      onClose()
    } catch (err: any) {
      showToast(`Failed to apply tags: ${err?.message || err}`)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '460px',
          maxWidth: '92vw',
          backgroundColor: 'var(--bg-secondary, #1e293b)',
          borderRadius: '16px',
          border: '1px solid var(--border, #334155)',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          color: 'var(--text-primary, #f8fafc)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--primary, #3b82f6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Tag size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                {photoIds.length > 1 ? `Tag ${photoIds.length} Selected Photos` : 'Manage Photo Tags'}
              </h3>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                Select existing tags or create new ones
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary, #94a3b8)',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search / Filter Existing Tags Bar */}
        <div style={{ position: 'relative', marginBottom: '16px' }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary, #94a3b8)'
            }}
          />
          <input
            type="text"
            placeholder="Search existing tags or type to create..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (filteredTags.length === 1) {
                  handleToggleTag(filteredTags[0].id)
                } else if (filteredTags.length === 0 && searchQuery.trim()) {
                  handleCreateTag()
                }
              }
            }}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: '10px',
              border: '1px solid var(--border, #334155)',
              backgroundColor: 'var(--bg-primary, #0f172a)',
              color: 'var(--text-primary, #f8fafc)',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* Existing Tags Cloud */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary, #94a3b8)' }}>
              Existing Tags ({allTags.length})
            </label>
            <span style={{ fontSize: '11px', color: 'var(--primary, #3b82f6)', fontWeight: 600 }}>
              {selectedTagIds.size} selected
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              maxHeight: '170px',
              overflowY: 'auto',
              padding: '6px 2px'
            }}
          >
            {allTags.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)', padding: '12px 0', textAlign: 'center', width: '100%' }}>
                No tags created yet. Create your first tag below!
              </div>
            ) : filteredTags.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 0' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary, #94a3b8)' }}>
                  No match for "{searchQuery}"
                </span>
                <button
                  type="button"
                  onClick={handleCreateTag}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--primary, #3b82f6)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    color: 'var(--primary, #3b82f6)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={12} /> Create "{searchQuery.trim()}"
                </button>
              </div>
            ) : (
              filteredTags.map((tag) => {
                const isSelected = selectedTagIds.has(tag.id)
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggleTag(tag.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: `1.5px solid ${tag.color}`,
                      backgroundColor: isSelected ? tag.color : 'transparent',
                      color: isSelected ? '#ffffff' : tag.color,
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? `0 2px 8px ${tag.color}55` : 'none'
                    }}
                  >
                    {isSelected ? (
                      <Check size={12} strokeWidth={3} />
                    ) : (
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: tag.color
                        }}
                      />
                    )}
                    {tag.name}
                    {tag.photo_count !== undefined && (
                      <span
                        style={{
                          fontSize: '10px',
                          opacity: 0.8,
                          backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.2)',
                          padding: '1px 5px',
                          borderRadius: '8px'
                        }}
                      >
                        {tag.photo_count}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Create New Tag Collapsible */}
        {isCreating ? (
          <div
            style={{
              backgroundColor: 'var(--bg-primary, #0f172a)',
              padding: '14px',
              borderRadius: '12px',
              marginBottom: '18px',
              border: '1px solid var(--border, #334155)'
            }}
          >
            <input
              type="text"
              placeholder="Tag name (e.g. Vacation, Family, Work)..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border, #334155)',
                backgroundColor: 'var(--bg-secondary, #1e293b)',
                color: 'var(--text-primary, #f8fafc)',
                fontSize: '13px',
                marginBottom: '10px',
                outline: 'none'
              }}
            />

            {/* Color Palette */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary, #94a3b8)', marginRight: '4px' }}>Color:</span>
              {TAG_COLOR_PALETTE.map((c) => (
                <div
                  key={c}
                  onClick={() => setNewTagColor(c)}
                  style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: c,
                    cursor: 'pointer',
                    border: newTagColor === c ? '2px solid #ffffff' : 'none',
                    boxShadow: newTagColor === c ? '0 0 8px ' + c : 'none'
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsCreating(false)}
                style={{ fontSize: '12px', padding: '4px 10px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleCreateTag}
                disabled={!newTagName.trim()}
                style={{ fontSize: '12px', padding: '4px 14px' }}
              >
                Add & Select
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setIsCreating(true)
              setNewTagName(searchQuery.trim())
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              marginBottom: '18px',
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px dashed var(--border, #334155)',
              width: '100%',
              justifyContent: 'center',
              color: 'var(--primary, #3b82f6)'
            }}
          >
            <Plus size={14} /> Create a New Tag
          </button>
        )}

        {/* Footer Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid var(--border, #334155)' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            style={{ fontSize: '13px', padding: '8px 16px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleApplyTags}
            disabled={loading}
            style={{ fontSize: '13px', padding: '8px 20px', minWidth: '110px' }}
          >
            {loading ? 'Saving...' : 'Apply Tags'}
          </button>
        </div>
      </div>
    </div>
  )
}
