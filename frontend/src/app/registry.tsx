'use client'

import { ConfigProvider, theme } from 'antd'
import React from 'react'
import { AuthProvider } from '@/components/auth'

// Ant Design registry for Next.js 16 with AuthProvider
export default function Registry({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: {
            colorPrimary: '#1677ff',
            borderRadius: 6,
            fontSize: 14,
          },
        }}
      >
        {children}
      </ConfigProvider>
    </AuthProvider>
  )
}
