'use client'

import { useProtected } from '@/hooks/use-auth'
import { Spin } from 'antd'

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isLoading } = useProtected()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spin size="large" />
      </div>
    )
  }

  return <>{children}</>
}
