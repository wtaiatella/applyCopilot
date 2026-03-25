'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { AuthState, AuthUser } from '@/types'
import { authService } from '@/lib/services'

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>
  register: (userData: { email: string; full_name: string; password: string; confirm_password: string }) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  })

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token')
        if (token) {
          const response = await authService.getCurrentUser()
          if (response.success && response.data) {
            setAuthState({
              user: response.data,
              token,
              isAuthenticated: true,
              isLoading: false,
            })
          } else {
            localStorage.removeItem('auth_token')
            setAuthState({
              user: null,
              token: null,
              isAuthenticated: false,
              isLoading: false,
            })
          }
        } else {
          setAuthState(prev => ({ ...prev, isLoading: false }))
        }
      } catch (error) {
        localStorage.removeItem('auth_token')
        setAuthState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        })
      }
    }

    initAuth()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }))
      
      const response = await authService.login({ email, password })
      
      if (response.success && response.data) {
        const { user, token } = response.data
        localStorage.setItem('auth_token', token)
        
        setAuthState({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
        })
      } else {
        throw new Error('Login failed')
      }
    } catch (error) {
      setAuthState(prev => ({ ...prev, isLoading: false }))
      throw error
    }
  }

  const register = async (userData: {
    email: string
    full_name: string
    password: string
    confirm_password: string
  }) => {
    try {
      setAuthState(prev => ({ ...prev, isLoading: true }))
      
      const response = await authService.register(userData)
      
      if (response.success) {
        // Auto-login after successful registration
        await login(userData.email, userData.password)
      } else {
        throw new Error('Registration failed')
      }
    } catch (error) {
      setAuthState(prev => ({ ...prev, isLoading: false }))
      throw error
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
    } catch (error) {
      // Even if logout API fails, clear local state
      console.error('Logout API error:', error)
    } finally {
      localStorage.removeItem('auth_token')
      setAuthState({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  }

  const refreshUser = async () => {
    try {
      const response = await authService.getCurrentUser()
      if (response.success && response.data) {
        setAuthState(prev => ({
          ...prev,
          user: response.data || null,
        }))
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
    }
  }

  const value: AuthContextType = {
    ...authState,
    login,
    register,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
