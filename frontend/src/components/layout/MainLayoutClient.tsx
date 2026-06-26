"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Layout, Menu, Splitter, Button, Typography } from "antd";
import ThemeToggle from "./ThemeToggle";
import { useTheme } from "../providers/AntdThemeProvider";
import {
  LayoutDashboard,
  User,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Briefcase,
} from "lucide-react";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

interface MainLayoutClientProps {
  children: React.ReactNode;
  user: {
    id: string;
    email?: string | null;
    role: string;
  };
}

export default function MainLayoutClient({ children, user }: MainLayoutClientProps) {
  const pathname = usePathname();
  const { themeMode } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(250);

  const isDark = themeMode === "dark";
  const bgColor = isDark ? "#000000" : "#ffffff";
  const surfaceColor = isDark ? "#09090b" : "#f4f4f5";
  const borderColor = isDark ? "#1f2937" : "#e4e4e7";
  const btnColor = isDark ? "#18181b" : "#f4f4f5";
  const btnBorder = isDark ? "#27272a" : "#e4e4e7";
  const btnTextColor = isDark ? "#a1a1aa" : "#71717a";
  const titleColor = isDark ? "#e4e4e7" : "#09090b";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // 1. Initialize sidebar collapse state
    const savedPreference = localStorage.getItem("sidebar_collapsed");
    if (savedPreference !== null) {
      setCollapsed(savedPreference === "true");
    } else {
      setCollapsed(window.innerWidth < 1280);
    }

    // 2. Initialize sidebar width
    const savedWidth = localStorage.getItem("sidebar_width");
    if (savedWidth !== null) {
      setSidebarWidth(Number(savedWidth));
    }

    setMounted(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const toggleSidebar = () => {
    const nextState = !collapsed;
    setCollapsed(nextState);
    localStorage.setItem("sidebar_collapsed", String(nextState));
  };

  const onResize = (sizes: number[]) => {
    const newWidth = sizes[0];
    if (newWidth <= 100) {
      setCollapsed(true);
      localStorage.setItem("sidebar_collapsed", "true");
    } else {
      setCollapsed(false);
      setSidebarWidth(newWidth);
      localStorage.setItem("sidebar_collapsed", "false");
      localStorage.setItem("sidebar_width", String(newWidth));
    }
  };

  const menuItems = [
    {
      key: "/dashboard",
      icon: <LayoutDashboard className="h-5 w-5" />,
      label: <Link href="/dashboard">Dashboard</Link>,
    },
    {
      key: "/profile",
      icon: <User className="h-5 w-5" />,
      label: <Link href="/profile">Profile</Link>,
    },
  ];

  // Visible settings page only for ADMIN role
  if (user.role === "ADMIN") {
    menuItems.push({
      key: "/settings",
      icon: <Settings className="h-5 w-5" />,
      label: <Link href="/settings">Settings</Link>,
    });
  }

  // Prevent server-side rendering mismatch for states
  if (!mounted) {
    return (
      <div className="flex h-screen bg-black text-white items-center justify-center">
        <span>Loading interface...</span>
      </div>
    );
  }

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <Splitter
        onResize={onResize}
        style={{ height: "100%", background: bgColor }}
      >
        <Splitter.Panel
          size={collapsed ? 80 : sidebarWidth}
          min={80}
          max={400}
          resizable={!collapsed}
          style={{ height: "100%", position: "relative" }}
        >
          {/* Sidebar Layout */}
          <Layout
            style={{
              height: "100%",
              background: surfaceColor,
              display: "flex",
              flexDirection: "column",
              borderRight: `1px solid ${borderColor}`,
            }}
          >
            {/* Toggle Button */}
            <Button
              onClick={toggleSidebar}
              shape="circle"
              size="small"
              icon={collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              style={{
                position: "absolute",
                right: -12,
                top: 80,
                zIndex: 10,
                background: btnColor,
                border: `1px solid ${btnBorder}`,
                color: btnTextColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            />

            {/* Sidebar Logo */}
            <div className="flex h-16 items-center gap-2 px-6 border-b border-slate-900 shrink-0">
              <Briefcase className="h-6 w-6 text-blue-500 shrink-0" />
              {!collapsed && (
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                  ApplyCopilot
                </span>
              )}
            </div>

            {/* Navigation Items */}
            <div className="flex-1 overflow-y-auto py-6">
              <Menu
                mode="inline"
                selectedKeys={[pathname]}
                items={menuItems}
                theme="dark"
                style={{ borderRight: 0, background: "transparent" }}
              />
            </div>

            {/* Sidebar Footer (User info & signout) */}
            <div className="border-t border-slate-900 p-4 shrink-0">
              {collapsed ? (
                <Button
                  type="text"
                  danger
                  icon={<LogOut className="h-5 w-5" />}
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full flex items-center justify-center"
                />
              ) : (
                <Button
                  type="text"
                  danger
                  icon={<LogOut className="h-5 w-5" />}
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="w-full flex items-center gap-3 justify-start px-3 text-slate-400 hover:text-red-400"
                >
                  Log Out
                </Button>
              )}
            </div>
          </Layout>
        </Splitter.Panel>

        <Splitter.Panel style={{ height: "100%" }}>
          <Layout style={{ height: "100%", background: bgColor }}>
            {/* Header bar */}
            <Header
              className="flex h-16 items-center justify-between border-b border-slate-900 px-8"
              style={{
                background: surfaceColor,
                padding: "0 32px",
                height: 64,
                borderBottom: `1px solid ${borderColor}`,
              }}
            >
              <div>
                <Title level={5} style={{ margin: 0, color: titleColor }}>
                  {pathname === "/dashboard"
                    ? "Dashboard"
                    : pathname === "/profile"
                    ? "Profile Settings"
                    : pathname === "/settings"
                    ? "Administration Settings"
                    : "System"}
                </Title>
              </div>

              <div className="flex items-center gap-4">
                <ThemeToggle />
                <Text type="secondary" className="text-xs font-medium">
                  {user.email}
                </Text>
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white uppercase shadow-sm">
                  {user.email?.charAt(0) || "U"}
                </div>
              </div>
            </Header>

            {/* Main Content Area */}
            <Content
              style={{
                padding: 32,
                overflowY: "auto",
                background: bgColor,
                height: "calc(100vh - 64px)",
              }}
            >
              {children}
            </Content>
          </Layout>
        </Splitter.Panel>
      </Splitter>
    </Layout>
  );
}
