"use client";

import React, { useState } from 'react';
import { Layout, Menu, theme, Dropdown, Avatar, Space, Button } from 'antd';
import { 
  UserOutlined, 
  SearchOutlined, 
  DashboardOutlined, 
  SettingOutlined,
  LogoutOutlined
} from '@ant-design/icons';
import { useRouter, usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';

const { Header, Sider, Content } = Layout;

export function MainLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const {
    token: { colorBgContainer, colorBgLayout, colorText },
  } = theme.useToken();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: 'Dashboard',
    },
    {
      key: '/profile',
      icon: <UserOutlined />,
      label: 'My Profile',
    },
    {
      key: '/jobs',
      icon: <SearchOutlined />,
      label: 'Job Search',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
  ];

  // Map exactly to first segment
  const activeKey = '/' + (pathname.split('/')[1] || '');

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: <Link href="/profile">My Profile</Link>,
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: <Link href="/settings">Settings</Link>,
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Logout',
      danger: true,
      onClick: () => signOut({ callbackUrl: '/auth/login' }),
    },
  ];

  return (
    <Layout className="min-h-screen">
      <Sider 
        collapsible 
        collapsed={collapsed} 
        onCollapse={(value) => setCollapsed(value)}
        theme="dark"
      >
        <div className="h-16 flex items-center justify-center font-bold text-white text-lg tracking-wide border-b border-gray-800">
          {collapsed ? 'AC' : 'ApplyCopilot'}
        </div>
        <Menu 
          theme="dark" 
          mode="inline" 
          selectedKeys={[activeKey]} 
          items={menuItems}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>
      <Layout>
        <Header className="px-4 flex items-center shadow-sm z-10" style={{ padding: 0, background: colorBgContainer }}>
          <div className="flex items-center justify-between px-4 w-full">
            <h1 className="text-lg font-semibold m-0 capitalize" style={{ color: colorText }}>
              {pathname === '/' ? 'Home' : pathname.split('/')[1]?.replace('-', ' ')}
            </h1>
            
            <div>
              {status === 'loading' ? null : session?.user ? (
                <Dropdown menu={{ items: userMenuItems as any }} placement="bottomRight" trigger={['click']}>
                  <div className="cursor-pointer flex items-center gap-2 hover:bg-gray-800 p-1 px-2 rounded-md transition-colors">
                    <Avatar src={session.user.image} icon={!session.user.image && <UserOutlined />} />
                    <span className="hidden sm:inline-block" style={{ color: colorText }}>{session.user.name}</span>
                  </div>
                </Dropdown>
              ) : (
                <Link href="/auth/login">
                  <Button type="primary">Sign In</Button>
                </Link>
              )}
            </div>
          </div>
        </Header>
        <Content className="p-6 overflow-auto" style={{ background: colorBgLayout }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
