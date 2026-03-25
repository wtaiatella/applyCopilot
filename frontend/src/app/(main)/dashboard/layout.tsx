'use client'

import React from 'react'
import AppLayout from '@/components/layouts/AppLayout'

interface DashboardLayoutProps {
  children: React.ReactNode
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <AppLayout>
      {children}
    </AppLayout>
  )
}
