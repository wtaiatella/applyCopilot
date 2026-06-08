import { ThemeConfig } from 'antd'
import { theme } from 'antd'

/**
 * Ant Design Theme Configuration
 * 
 * IMPORTANT: All Ant Design color and style customizations MUST be defined here.
 * DO NOT add Ant Design color overrides to globals.css.
 * The globals.css file should only contain Tailwind CSS utilities and 
 * very specific edge cases that cannot be handled by Ant Design's theme system.
 * 
 * This ensures:
 * - Single source of truth for Ant Design theming
 * - Consistent dark/light mode switching
 * - Type-safe theme configuration
 * - Easier maintenance and updates
 */

export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    // Primary brand colors
    colorPrimary: '#1677ff',
    colorPrimaryHover: '#4096ff',
    colorPrimaryActive: '#0958d9',
    
    // Border radius
    borderRadius: 6,
    
    // Typography
    fontSize: 14,
    
    // Spacing
    padding: 16,
    paddingSM: 12,
    paddingLG: 24,
    
    // Dark mode specific tokens
    colorBgBase: '#0a0a0a',
    colorTextBase: '#ededed',
  },
  components: {
    // Component-specific overrides can be added here
    // Example: Button, Card, Modal customizations
  },
}

/**
 * Light theme configuration (for future use)
 * Currently the app uses dark mode by default
 */
export const antdLightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#1677ff',
    colorPrimaryHover: '#4096ff',
    colorPrimaryActive: '#0958d9',
    borderRadius: 6,
    fontSize: 14,
    padding: 16,
    paddingSM: 12,
    paddingLG: 24,
    colorBgBase: '#ffffff',
    colorTextBase: '#171717',
  },
}
