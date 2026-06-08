"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LayoutDashboard,
  User,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Briefcase,
} from "lucide-react";

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
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 1. Initialize sidebar collapse state
    const savedPreference = localStorage.getItem("sidebar_collapsed");
    if (savedPreference !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(savedPreference === "true");
    } else {
      setCollapsed(window.innerWidth < 1280);
    }
    setMounted(true);

    // 2. Window resize handler
    const handleResize = () => {
      if (localStorage.getItem("sidebar_collapsed") === null) {
        setCollapsed(window.innerWidth < 1280);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => {
    const nextState = !collapsed;
    setCollapsed(nextState);
    localStorage.setItem("sidebar_collapsed", String(nextState));
  };

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "Profile", href: "/profile", icon: User },
  ];

  // Visible settings page only for ADMIN role
  const isAdmin = user.role === "ADMIN";
  if (isAdmin) {
    navItems.push({ label: "Settings", href: "/settings", icon: Settings });
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
    <div className="flex h-screen overflow-hidden bg-black text-white">
      {/* Sidebar Navigation */}
      <aside
        className={`relative flex flex-col border-r border-slate-900 bg-slate-950 transition-all duration-300 ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          className="absolute -right-3 top-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-all shadow-md active:scale-90"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        {/* Sidebar Logo */}
        <div className="flex h-16 items-center gap-2 px-6 border-b border-slate-900">
          <Briefcase className="h-6 w-6 text-blue-500 shrink-0" />
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              ApplyCopilot
            </span>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1.5 px-4 py-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-blue-600 text-white font-semibold shadow-lg shadow-blue-600/10"
                    : "text-slate-400 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer (User info & signout) */}
        <div className="border-t border-slate-900 p-4">
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-400 hover:bg-red-950/20 hover:text-red-400 transition-all"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* Main Panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-900 bg-slate-950 px-8">
          <div>
            <h1 className="text-lg font-semibold text-slate-200">
              {pathname === "/dashboard"
                ? "Dashboard"
                : pathname === "/profile"
                ? "Profile Settings"
                : pathname === "/settings"
                ? "Administration Settings"
                : "System"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-slate-500 font-medium">{user.email}</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white uppercase shadow-sm">
              {user.email?.charAt(0) || "U"}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-black p-8">{children}</main>
      </div>
    </div>
  );
}
