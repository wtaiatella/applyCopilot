'use client'

import { ConfigProvider, theme } from 'antd'
import React from 'react'

// Ant Design registry for Next.js 16
export default function Registry({ children }: { children: React.ReactNode }) {
  return (
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
  )
}
