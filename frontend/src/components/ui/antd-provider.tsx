'use client'

import { ConfigProvider, App } from 'antd'
import { ReactNode } from 'react'
import { antdTheme } from '@/lib/antd-theme'

import { AntdBridgeProvider } from '@/components/providers/antd-bridge-provider'

interface AntdProviderProps {
  children: ReactNode
}

export function AntdProvider({ children }: AntdProviderProps) {
  return (
    <ConfigProvider theme={antdTheme}>
      <App>
        <AntdBridgeProvider>
          {children}
        </AntdBridgeProvider>
      </App>
    </ConfigProvider>
  )
}
