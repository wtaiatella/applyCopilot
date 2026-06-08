// NextAuth configuration
export { authOptions, default } from './config'

// Session utilities
export {
  getSession,
  getCurrentUser,
  isAuthenticated,
  requireAuth,
} from './session'
