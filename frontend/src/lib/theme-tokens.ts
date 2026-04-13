/**
 * Design Tokens - Single Source of Truth
 * 
 * All colors, radii, and spacing for ApplyCopilot are defined here.
 * This file is consumed by antd-theme.ts and mirrored in globals.css.
 */

export const themeTokens = {
  colors: {
    brand: {
      primary: '#3b82f6',
      accent: '#06b6d4',
    },
    ui: {
      background: '#020617',
      surface: '#0f172a',
      surfaceElevated: '#1e293b',
      border: 'rgba(255, 255, 255, 0.1)',
      borderLight: 'rgb(0, 255, 0)',
    },
    text: {
      primary: '#f8fafc',
      secondary: '#94a3b8',
      muted: '#64748b',
    },
    status: {
      success: '#10b981',
      warning: '#f59e0b',
      warningLight: 'rgba(245, 158, 11, 0.05)', // bg-warning/5
      warningBorder: 'rgba(245, 158, 11, 0.4)', // border-warning/40
      error: '#ef4444',
      info: '#3b82f6',
    }
  },
  radius: {
    card: 24, // px (1.5rem)
    button: 12, // px (0.75rem)
    badge: 9999, // px
  }
} as const;

export type ThemeTokens = typeof themeTokens;
