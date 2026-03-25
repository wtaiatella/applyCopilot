'use client'

import { Button, Avatar, Space, Dropdown, Typography, Badge } from 'antd'
import { 
  UserOutlined, 
  SettingOutlined, 
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  SearchOutlined
} from '@ant-design/icons'
import { useAuth } from '@/contexts/auth.context'
import type { MenuProps } from 'antd'

const { Text } = Typography

interface HeaderProps {
  collapsed: boolean
  onToggle: () => void
}

export function Header({ collapsed, onToggle }: HeaderProps) {
  const { user, logout } = useAuth()

  const userMenuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: 'My Profile',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: 'Settings',
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Log Out',
      onClick: logout,
    },
  ]

  return (
    <div className="!bg-[#020617] border-b border-white/5 px-6 flex items-center justify-between h-20">
      <div className="flex items-center gap-6">
        <Button
          type="text"
          icon={collapsed ? <MenuUnfoldOutlined className="text-white/60" /> : <MenuFoldOutlined className="text-white/60" />}
          onClick={onToggle}
          className="text-lg hover:bg-white/5"
        />
        <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/5 rounded-full w-80 group hover:border-white/10 transition-all">
          <SearchOutlined className="text-white/40 group-hover:text-white/60" />
          <input 
            placeholder="Search jobs, analysis..." 
            className="bg-transparent border-none text-xs text-white/80 placeholder:text-white/20 focus:outline-none w-full" 
          />
        </div>
      </div>
      
      <Space size={20}>
         <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-positive/10 border border-positive/30">
            <span className="w-2 h-2 rounded-full bg-positive animate-pulse" />
            <span className="text-[10px] font-bold text-positive uppercase tracking-widest">AI Agent Active</span>
        </div>
        
        <Badge count={3} size="small" offset={[2, 0]} className="cursor-pointer hover:opacity-80">
          <Button type="text" shape="circle" icon={<BellOutlined className="text-white/60 text-lg" />} />
        </Badge>
        
        <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
          <Space className="cursor-pointer hover:bg-white/5 px-2 py-1.5 rounded-xl transition-all border border-transparent hover:border-white/5">
            <Avatar 
                icon={<UserOutlined />} 
                className="bg-primary/20 text-primary border border-primary/30"
                size="large"
            />
            <div className="hidden sm:flex flex-col text-left">
              <Text className="text-white text-xs font-bold leading-none">{user?.full_name ?? 'User Name'}</Text>
              <Text className="text-white/40 text-[10px] uppercase tracking-wider font-semibold">Premium Member</Text>
            </div>
          </Space>
        </Dropdown>
      </Space>
    </div>
  )
}
