'use client'

import { ConfigProvider, App } from 'antd'
import React from 'react'
import { AuthProvider } from '@/components/auth'
import { antdTheme } from '@/lib/theme'

// Ant Design registry for Next.js 16 with AuthProvider
// Theme configuration is imported from @/lib/theme to maintain single source of truth
export default function Registry({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConfigProvider theme={antdTheme}>
        <App>
          {children}
        </App>
      </ConfigProvider>
    </AuthProvider>
  )
}
