import { theme } from 'antd'
import type { ThemeConfig } from 'antd'
import { themeTokens } from './theme-tokens'

export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: themeTokens.colors.brand.primary,
    colorSuccess: themeTokens.colors.status.success,
    colorWarning: themeTokens.colors.status.warning,
    colorError: themeTokens.colors.status.error,
    borderRadius: themeTokens.radius.button,
    wireframe: false,
    colorBgBase: themeTokens.colors.ui.background,
    colorBgContainer: themeTokens.colors.ui.surface,
    colorBorder: themeTokens.colors.ui.borderLight, // Use lighter border for internal dividers
    colorTextBase: themeTokens.colors.text.primary,
    colorTextSecondary: themeTokens.colors.text.secondary,
    colorBgLayout: themeTokens.colors.ui.background,
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
  },
  components: {
    Layout: {
      siderBg: themeTokens.colors.ui.background,
      headerBg: themeTokens.colors.ui.background,
      triggerBg: themeTokens.colors.ui.surface,
      bodyBg: themeTokens.colors.ui.background
    },
    Menu: {
      itemBg: 'transparent',
      itemSelectedBg: 'rgba(59, 130, 246, 0.1)',
      itemSelectedColor: themeTokens.colors.brand.primary,
      itemHoverBg: 'rgba(255, 255, 255, 0.03)',
      itemActiveBg: 'transparent',
      itemBorderRadius: themeTokens.radius.button,
    },
    Button: {
      borderRadius: themeTokens.radius.button,
      borderRadiusLG: themeTokens.radius.card,
      controlHeightLG: 48,
    },
    Card: {
      borderRadiusLG: themeTokens.radius.card,
      colorBgContainer: themeTokens.colors.ui.surface,
      bodyPaddingSM: 20,
      colorBorderSecondary: 'transparent',
    },
    Input: {
      borderRadius: themeTokens.radius.button,
      controlHeight: 40,
      colorBgContainer: 'rgba(255, 255, 255, 0.03)',
    },
    Select: {
      borderRadius: themeTokens.radius.button,
      controlHeight: 40,
    },
  },
}
