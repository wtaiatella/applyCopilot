'use client'

import { ConfigProvider, App } from 'antd'
import { ReactNode } from 'react'
import { antdTheme } from '@/lib/antd-theme'

interface AntdProviderProps {
  children: ReactNode
}

export function AntdProvider({ children }: AntdProviderProps) {
  return (
    <ConfigProvider theme={antdTheme}>
      <App>
        {children}
      </App>
    </ConfigProvider>
  )
}
