import { theme } from 'antd'
import type { ThemeConfig } from 'antd'

export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#3b82f6',
    colorSuccess: '#10b981',
    colorWarning: '#f59e0b',
    colorError: '#ef4444',
    borderRadius: 16,
    wireframe: false,
    colorBgBase: '#020617',
    colorBgContainer: '#0f172a',
    colorBorder: 'rgba(255, 255, 255, 0.05)',
    colorTextBase: '#f8fafc',
    colorTextSecondary: '#94a3b8',
    colorBgLayout: '#020617',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
  },
  components: {
    Layout: {
      siderBg: '#020617',
      headerBg: '#020617',
      triggerBg: '#0f172a',
      bodyBg: '#020617'
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(59, 130, 246, 0.1)',
      itemSelectedColor: '#3b82f6',
      itemHoverBg: 'rgba(255, 255, 255, 0.03)',
      itemActiveBg: 'transparent',
      itemBorderRadius: 12,
    },
    Button: {
      borderRadius: 12,
      borderRadiusLG: 16,
      controlHeightLG: 48,
    },
    Card: {
      borderRadiusLG: 24,
      colorBgContainer: '#0f172a',
    },
    Input: {
      borderRadius: 12,
      controlHeight: 40,
      colorBgContainer: 'rgba(255, 255, 255, 0.03)',
    },
    Select: {
      borderRadius: 12,
      controlHeight: 40,
    },
  },
}
