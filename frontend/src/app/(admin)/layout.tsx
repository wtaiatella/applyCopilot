'use client'

import React from 'react'
import AppLayout from '@/components/layouts/AppLayout'

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AppLayout>
      {children}
    </AppLayout>
  )
}
