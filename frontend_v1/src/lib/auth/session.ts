import { getServerSession } from 'next-auth/next'
import { authOptions } from './config'
import type { Session } from 'next-auth'

/**
 * Get the current session on the server side
 * Use this in Server Components and API routes
 */
export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions)
}

/**
 * Get the current user from the session
 * Returns null if not authenticated
 */
export async function getCurrentUser() {
  const session = await getSession()
  return session?.user ?? null
}

/**
 * Check if the user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return !!session?.user
}

/**
 * Require authentication - throws if not authenticated
 * Use this in protected server actions
 */
export async function requireAuth() {
  const user = await getCurrentUser()
  
  if (!user) {
    throw new Error('Unauthorized')
  }
  
  return user
}
