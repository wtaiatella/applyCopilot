'use client'

import { App } from 'antd'
import { useEffect } from 'react'
import { antdStatic } from '@/lib/antd-static'

export const AntdBridgeProvider = ({ children }: { children: React.ReactNode }) => {
  const { message, modal, notification } = App.useApp()

  useEffect(() => {
    antdStatic.setHandlers(message, modal, notification)
  }, [message, modal, notification])

  return <>{children}</>
}
