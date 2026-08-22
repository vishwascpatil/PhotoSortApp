import React, { createContext, useContext, useReducer, useCallback, ReactNode, useEffect } from 'react'

interface Toast {
  id: string
  message: string
  undoAction?: () => void
  duration?: number
}

interface AppState {
  currentView: 
    | 'welcome'
    | 'scanning-library'
    | 'overview'
    | 'photos'
    | 'favorites'
    | 'videos'
    | 'albums'
    | 'album-detail'
    | 'people'
    | 'places'
    | 'tags'
    | 'documents'
    | 'duplicates'
    | 'similar'
    | 'screenshots'
    | 'large-files'
    | 'junk'
    | 'whatsapp'
    | 'folders'
    | 'google-photos'
    | 'trash'
    | 'search'
    | 'loading'
  currentAlbumId: number | null
  sidebarCollapsed: boolean
  theme: 'dark' | 'light'
  gridDensity: 'comfortable' | 'medium' | 'dense'
  toasts: Toast[]
  searchQuery: string
  platform: string
  importStatus: {
    active: boolean
    stage: string
    message: string
    total: number
    completed: number
  }
}

type AppAction =
  | { type: 'SET_VIEW'; payload: AppState['currentView'] }
  | { type: 'SET_ALBUM_ID'; payload: number | null }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_THEME'; payload: 'dark' | 'light' }
  | { type: 'SET_GRID_DENSITY'; payload: 'comfortable' | 'medium' | 'dense' }
  | { type: 'ADD_TOAST'; payload: Toast }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'SET_SEARCH'; payload: string }
  | { type: 'SET_PLATFORM'; payload: string }
  | { type: 'SET_IMPORT_STATUS'; payload: AppState['importStatus'] }

const initialState: AppState = {
  currentView: 'loading',
  currentAlbumId: null,
  sidebarCollapsed: false,
  theme: 'light',
  gridDensity: 'dense',
  toasts: [],
  searchQuery: '',
  platform: 'win32',
  importStatus: {
    active: false,
    stage: '',
    message: '',
    total: 0,
    completed: 0
  }
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VIEW':
      return { ...state, currentView: action.payload, currentAlbumId: null }
    case 'SET_ALBUM_ID':
      return { ...state, currentView: 'album-detail', currentAlbumId: action.payload }
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarCollapsed: !state.sidebarCollapsed }
    case 'SET_THEME':
      return { ...state, theme: action.payload }
    case 'SET_GRID_DENSITY':
      return { ...state, gridDensity: action.payload }
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, action.payload] }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) }
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.payload, currentView: action.payload ? 'search' : 'photos' }
    case 'SET_PLATFORM':
      return { ...state, platform: action.payload }
    case 'SET_IMPORT_STATUS': {
      const { stage, message, total = 0, completed } = action.payload;
      const active = stage !== 'done';
      let newCompleted = completed ?? 0;
      if (stage === 'scanning') {
        newCompleted = 0;
      } else if (stage === 'done') {
        newCompleted = total;
      }
      return {
        ...state,
        importStatus: { active, stage, message, total, completed: newCompleted }
      };
    }
    default:
      return state
  }
}

interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  navigateTo: (view: AppState['currentView']) => void
  openAlbum: (albumId: number) => void
  showToast: (message: string, undoAction?: () => void) => void
  toggleTheme: () => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  const navigateTo = useCallback((view: AppState['currentView']) => {
    dispatch({ type: 'SET_VIEW', payload: view })
  }, [])

  const openAlbum = useCallback((albumId: number) => {
    dispatch({ type: 'SET_ALBUM_ID', payload: albumId })
  }, [])

  const showToast = useCallback((message: string, undoAction?: () => void) => {
    const id = Date.now().toString()
    dispatch({ type: 'ADD_TOAST', payload: { id, message, undoAction, duration: 5000 } })
    setTimeout(() => {
      dispatch({ type: 'REMOVE_TOAST', payload: id })
    }, 5000)
  }, [])

  const toggleTheme = useCallback(() => {
    const newTheme = state.theme === 'dark' ? 'light' : 'dark'
    dispatch({ type: 'SET_THEME', payload: newTheme })
    document.documentElement.setAttribute('data-theme', newTheme)
  }, [state.theme])

  // Initialize default theme & platform
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme)
    window.photoVault.getPlatform().then(platform => {
      dispatch({ type: 'SET_PLATFORM', payload: platform })
    })
  }, [])

  useEffect(() => {
    // Always start on the welcome screen; it will handle loading and navigation
    dispatch({ type: 'SET_VIEW', payload: 'welcome' })
  }, [])


  // Listen for import status
  useEffect(() => {
    const cleanup = window.photoVault.onImportStatus((status) => {
      const isDone = status.stage === 'done'
      dispatch({
        type: 'SET_IMPORT_STATUS',
        payload: {
          active: !isDone,
          stage: status.stage,
          message: status.message,
          total: status.total || 0,
          completed: status.completed || 0
        }
      })

      if (!isDone && (status.stage === 'scanning' || status.stage === 'processing')) {
        dispatch({ type: 'SET_VIEW', payload: 'scanning-library' })
      }

      if (isDone) {
        // Scanning finished – go to main photos view
        dispatch({ type: 'SET_VIEW', payload: 'photos' })
      }
    })
    return cleanup
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch, navigateTo, openAlbum, showToast, toggleTheme }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextType {
  const context = useContext(AppContext)
  if (!context) throw new Error('useApp must be used within AppProvider')
  return context
}
