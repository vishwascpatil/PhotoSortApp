import React, { createContext, useContext, useReducer, useCallback, useEffect, ReactNode } from 'react'

export interface Photo {
  id: number
  file_path: string
  thumbnail_path: string | null
  preview_path: string | null
  filename: string
  mime_type: string
  width: number
  height: number
  file_size: number
  created_at: string
  imported_at: string
  is_favorite: number
  is_archived: number
  is_trashed: number
  trashed_at: string | null
  rating: number
  orientation: number
  blur_score?: number
  perceptual_hash?: string
  extracted_text?: string
  is_document?: number
  document_category?: string | null
  location_name?: string | null
}

interface PhotoState {
  photos: Photo[]
  selectedIds: Set<number>
  isSelecting: boolean
  viewerPhotoId: number | null
  viewerPhotos: Photo[] | null
  editingPhotoId: number | null
  isLoading: boolean
  totalCount: number
  activeFilter: Record<string, unknown>
}

type PhotoAction =
  | { type: 'SET_PHOTOS'; payload: Photo[] }
  | { type: 'APPEND_PHOTOS'; payload: Photo[] }
  | { type: 'UPDATE_PHOTO'; payload: Photo }
  | { type: 'REMOVE_PHOTOS'; payload: number[] }
  | { type: 'SELECT_PHOTO'; payload: number }
  | { type: 'DESELECT_PHOTO'; payload: number }
  | { type: 'TOGGLE_FAVORITE'; payload: number }
  | { type: 'UPDATE_THUMBNAIL'; payload: { id: number; timestamp: number } }
  | { type: 'TOGGLE_SELECT'; payload: number }
  | { type: 'SELECT_ALL' }
  | { type: 'DESELECT_ALL' }
  | { type: 'SELECT_RANGE'; payload: { from: number; to: number } }
  | { type: 'SET_VIEWER'; payload: number | null }
  | { type: 'SET_VIEWER_SCOPED'; payload: { photoId: number | null; photos: Photo[] } }
  | { type: 'SET_EDITING'; payload: number | null }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_TOTAL_COUNT'; payload: number }
  | { type: 'SET_ACTIVE_FILTER'; payload: Record<string, unknown> }

const initialState: PhotoState = {
  photos: [],
  selectedIds: new Set(),
  isSelecting: false,
  viewerPhotoId: null,
  viewerPhotos: null,
  editingPhotoId: null,
  isLoading: false,
  totalCount: 0,
  activeFilter: {}
}

function photoReducer(state: PhotoState, action: PhotoAction): PhotoState {
  switch (action.type) {
    case 'SET_PHOTOS':
      return { ...state, photos: action.payload, isLoading: false }
    case 'APPEND_PHOTOS':
      return { ...state, photos: [...state.photos, ...action.payload], isLoading: false }
    case 'UPDATE_PHOTO': {
      const updated = state.photos.map(p => p.id === action.payload.id ? action.payload : p)
      return { ...state, photos: updated }
    }
    case 'REMOVE_PHOTOS': {
      const idsToRemove = new Set(action.payload)
      const filtered = state.photos.filter(p => !idsToRemove.has(p.id))
      const newSelected = new Set([...state.selectedIds].filter(id => !idsToRemove.has(id)))
      return { ...state, photos: filtered, selectedIds: newSelected, isSelecting: newSelected.size > 0 }
    }
    case 'SELECT_PHOTO': {
      const newSelected = new Set(state.selectedIds)
      newSelected.add(action.payload)
      return { ...state, selectedIds: newSelected, isSelecting: true }
    }
    case 'DESELECT_PHOTO': {
      const newSelected = new Set(state.selectedIds)
      newSelected.delete(action.payload)
      return { ...state, selectedIds: newSelected, isSelecting: newSelected.size > 0 }
    }
    case 'TOGGLE_SELECT': {
      const newSelected = new Set(state.selectedIds)
      if (newSelected.has(action.payload)) {
        newSelected.delete(action.payload)
      } else {
        newSelected.add(action.payload)
      }
      return { ...state, selectedIds: newSelected, isSelecting: newSelected.size > 0 }
    }
    case 'SELECT_ALL': {
      const allIds = new Set(state.photos.map(p => p.id))
      return { ...state, selectedIds: allIds, isSelecting: true }
    }
    case 'DESELECT_ALL':
      return { ...state, selectedIds: new Set(), isSelecting: false }
    case 'SELECT_RANGE': {
      const { from, to } = action.payload
      const startIdx = state.photos.findIndex(p => p.id === from)
      const endIdx = state.photos.findIndex(p => p.id === to)
      if (startIdx === -1 || endIdx === -1) return state
      const [minIdx, maxIdx] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)]
      const newSelected = new Set(state.selectedIds)
      for (let i = minIdx; i <= maxIdx; i++) {
        newSelected.add(state.photos[i].id)
      }
      return { ...state, selectedIds: newSelected, isSelecting: true }
    }
    case 'UPDATE_THUMBNAIL': {
      const idx = state.photos.findIndex(p => p.id === action.payload.id)
      if (idx === -1) return state
      const updatedPhotos = [...state.photos]
      if (updatedPhotos[idx].thumbnail_path) {
        updatedPhotos[idx] = {
          ...updatedPhotos[idx],
          thumbnail_path: `${updatedPhotos[idx].thumbnail_path!.split('?')[0]}?t=${action.payload.timestamp}`
        }
      }
      return { ...state, photos: updatedPhotos }
    }
    case 'SET_VIEWER':
      return { ...state, viewerPhotoId: action.payload, viewerPhotos: null }
    case 'SET_VIEWER_SCOPED':
      return { ...state, viewerPhotoId: action.payload.photoId, viewerPhotos: action.payload.photos }
    case 'SET_EDITING':
      return { ...state, editingPhotoId: action.payload }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'SET_TOTAL_COUNT':
      return { ...state, totalCount: action.payload }
    case 'SET_ACTIVE_FILTER':
      if (JSON.stringify(state.activeFilter) === JSON.stringify(action.payload)) return state
      return { ...state, activeFilter: action.payload }
    default:
      return state
  }
}

interface PhotoContextType {
  state: PhotoState
  dispatch: React.Dispatch<PhotoAction>
  loadPhotos: (filter?: Record<string, unknown>) => Promise<void>
  refreshPhotos: () => Promise<void>
}

const PhotoContext = createContext<PhotoContextType | null>(null)

export function PhotoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(photoReducer, initialState)

  const loadPhotos = useCallback(async (filter: Record<string, unknown> = {}) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    dispatch({ type: 'SET_ACTIVE_FILTER', payload: filter })
    try {
      const photos = await window.photoVault.getPhotos(filter as any)
      dispatch({ type: 'SET_PHOTOS', payload: photos })
      const count = await window.photoVault.getPhotoCount(filter as any)
      dispatch({ type: 'SET_TOTAL_COUNT', payload: count })
    } catch (err) {
      console.error('Failed to load photos:', err)
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false })
    }
  }, [])

  const refreshPhotos = useCallback(async () => {
    await loadPhotos(state.activeFilter || {})
  }, [loadPhotos, state.activeFilter])

  // Pre-fetch photos on app start so in-memory navigation across tabs is 0ms instant
  useEffect(() => {
    loadPhotos({})
  }, [loadPhotos])

  useEffect(() => {
    if (window.photoVault?.onPhotoThumbnailUpdated) {
      const cleanup1 = window.photoVault.onPhotoThumbnailUpdated((photoId) => {
        dispatch({ type: 'UPDATE_THUMBNAIL', payload: { id: photoId, timestamp: Date.now() } })
      })
      const cleanup2 = window.photoVault.onImportStatus ? window.photoVault.onImportStatus((status) => {
        if (status.stage === 'done') {
          refreshPhotos()
        }
      }) : () => {}
      return () => {
        cleanup1()
        cleanup2()
      }
    }
  }, [refreshPhotos])

  return (
    <PhotoContext.Provider value={{ state, dispatch, loadPhotos, refreshPhotos }}>
      {children}
    </PhotoContext.Provider>
  )
}

export function usePhotos(): PhotoContextType {
  const context = useContext(PhotoContext)
  if (!context) throw new Error('usePhotos must be used within PhotoProvider')
  return context
}
