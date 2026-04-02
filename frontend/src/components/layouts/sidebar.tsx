'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Layout, Menu } from 'antd'
import {
  LayoutDashboard,
  User,
  Search,
  Briefcase,
  Settings,
  FileText,
  Star,
  CheckCircle,
  Rocket
} from 'lucide-react'
import type { MenuProps } from 'antd'

const { Sider } = Layout

interface SidebarProps {
  collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  const menuItems: MenuProps['items'] = [
    {
      key: '/dashboard',
      icon: <LayoutDashboard size={18} />,
      label: 'Dashboard',
    },
    {
      key: 'profile-group',
      icon: <User size={18} />,
      label: 'My Profile',
      children: [
        {
          key: '/profile/basic-data',
          label: 'Basic Data',
        },
        {
          key: '/profile/experiences',
          label: 'Experiences',
        },
        {
          key: '/profile/educations',
          label: 'Educations',
        },
        {
          key: '/profile/skills',
          label: 'Skills',
        },
        {
          key: '/profile/certifications',
          label: 'Certifications',
        },
        {
          key: '/profile/projects',
          label: 'Projects',
        },
        {
          key: '/profile/references',
          label: 'References',
        }
      ],
    },
    {
      key: '/cv-manager',
      icon: <FileText size={18} />,
      label: 'CV Manager',
      children: [
        {
          key: '/cv-manager/versions',
          label: 'Versions',
        },
        {
          key: '/cv-manager/create',
          label: 'Create CV',
        },
      ],
    },
    {
      key: '/jobs',
      icon: <Briefcase size={18} />,
      label: 'Job Board',
      children: [
        {
          key: '/jobs/discovered',
          icon: <Search size={14} />,
          label: 'Discovered',
        },
        {
          key: '/jobs/applied',
          icon: <CheckCircle size={14} />,
          label: 'Applied',
        },
        {
          key: '/jobs/favorites',
          icon: <Star size={14} />,
          label: 'Favorites',
        },
      ],
    },
    {
      key: '/settings',
      icon: <Settings size={18} />,
      label: 'Settings',
    },
  ]

  return (
    <Sider
      trigger={null}
      collapsible
      collapsed={collapsed}
      className="!bg-[#020617] border-r border-white/5"
      width={240}
    >
      <div className="p-6 h-20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
          <Rocket className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-bold text-lg tracking-tight text-white whitespace-nowrap">
            Apply<span className="text-primary italic">Copilot</span>
          </span>
        )}
      </div>

      <Menu
        mode="inline"
        theme="dark"
        selectedKeys={[pathname]}
        onClick={({ key }) => router.push(key)}
        items={menuItems}
        className="!bg-transparent border-none px-2"
        inlineIndent={16}
      />

      {!collapsed && (
        <div className="absolute bottom-8 left-6 right-6 p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-blue-500/10 border border-primary/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">PRO PLAN</p>
          <p className="text-xs text-text-secondary font-medium mb-3">Get unlimited AI applications</p>
          <button className="w-full py-2 bg-primary text-white text-[10px] font-bold rounded-xl hover:bg-primary/90 transition-all uppercase tracking-widest">
            Upgrade
          </button>
        </div>
      )}
    </Sider>
  )
}
