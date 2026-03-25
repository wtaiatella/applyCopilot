import { create } from 'zustand'

interface UIStore {
  sidebarCollapsed: boolean
  theme: 'light' | 'dark'
  loading: Record<string, boolean>
  notifications: Array<{
    id: string
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
    timestamp: Date
  }>
  
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
  setLoading: (key: string, loading: boolean) => void
  addNotification: (notification: Omit<UIStore['notifications'][0], 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

export const useUIStore = create<UIStore>((set, get) => ({
  sidebarCollapsed: false,
  theme: 'light',
  loading: {},
  notifications: [],

  toggleSidebar: () => set((state) => ({
    sidebarCollapsed: !state.sidebarCollapsed,
  })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  setTheme: (theme) => set({ theme }),

  setLoading: (key, loading) => set((state) => ({
    loading: { ...state.loading, [key]: loading },
  })),

  addNotification: (notification) => {
    const id = Date.now().toString()
    const timestamp = new Date()
    
    set((state) => ({
      notifications: [...state.notifications, { ...notification, id, timestamp }],
    }))

    // Auto-remove notification after 5 seconds
    setTimeout(() => {
      get().removeNotification(id)
    }, 5000)
  },

  removeNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id),
  })),

  clearNotifications: () => set({ notifications: [] }),
}))
