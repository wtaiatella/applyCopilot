'use client'

import { ReactNode } from 'react'
import { AntdProvider } from '@/components/ui/antd-provider'
import { AuthProvider } from '@/contexts/auth.context'
import { ReactQueryProvider } from './react-query-provider'

interface AppProvidersProps {
  children: ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <ReactQueryProvider>
      <AuthProvider>
        <AntdProvider>
          {children}
        </AntdProvider>
      </AuthProvider>
    </ReactQueryProvider>
  )
}
