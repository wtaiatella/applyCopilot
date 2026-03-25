'use client'

import React, { useState } from 'react'
import { Layout, ConfigProvider, theme } from 'antd'
import { Sidebar } from './sidebar'
import { Header } from './header'

const { Content } = Layout

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <ConfigProvider 
      theme={{ 
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#3b82f6',
          borderRadius: 16,
          colorBgContainer: '#020617',
          colorBgLayout: '#020617',
          colorBorder: 'rgba(255, 255, 255, 0.05)',
          colorTextBase: '#f8fafc',
          colorTextQuaternary: '#64748b',
        },
        components: {
          Menu: {
            itemBg: 'transparent',
            itemSelectedBg: 'rgba(59, 130, 246, 0.1)',
            itemSelectedColor: '#3b82f6',
            itemHoverBg: 'rgba(255, 255, 255, 0.03)',
            itemActiveBg: 'transparent',
            subMenuItemBg: 'transparent',
            itemBorderRadius: 12,
            groupTitleFontSize: 10,
          },
          Button: {
            borderRadiusLG: 16,
            colorPrimary: '#3b82f6',
            controlHeightLG: 48,
          }
        }
      }}
    >
      <Layout className="min-h-screen bg-[#020617]">
        <Sidebar collapsed={collapsed} />
        <Layout className="bg-transparent overflow-x-hidden">
          <Header 
            collapsed={collapsed} 
            onToggle={() => setCollapsed(!collapsed)} 
          />
          <Content className="p-4 md:p-6 lg:p-8 xl:p-10 max-w-[1600px] mx-auto w-full">
            {children}
          </Content>
        </Layout>
      </Layout>
      
      {/* Global CSS for some Antd overrides and custom animations */}
      <style jsx global>{`
        .ant-layout-sider {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .ant-menu-item-selected::after {
          border-right: 3px solid #3b82f6 !important;
          border-radius: 99px;
        }
        .ant-menu-inline .ant-menu-item {
          height: 48px !important;
          line-height: 48px !important;
        }
        .ant-menu-submenu-title {
          height: 48px !important;
          line-height: 48px !important;
        }
      `}</style>
    </ConfigProvider>
  )
}
