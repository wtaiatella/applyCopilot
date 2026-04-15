import { test, expect } from '@playwright/test'

test.describe('ApplyCopilot E2E Tests', () => {
  test('should load the home page', async ({ page }) => {
    await page.goto('/')
    
    // Check if the page loads successfully
    await expect(page).toHaveTitle(/ApplyCopilot/)
    
    // Check for Ant Design test component
    await expect(page.getByText('ApplyCopilot - Ant Design Integration Test')).toBeVisible()
  })

  test('should display Ant Design components', async ({ page }) => {
    await page.goto('/')
    
    // Check for buttons
    await expect(page.getByRole('button', { name: 'Primary Button' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Default Button' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dashed Button' })).toBeVisible()
    
    // Check for configuration status
    await expect(page.getByText('Next.js 16:')).toBeVisible()
    await expect(page.getByText('Ant Design 6:')).toBeVisible()
    await expect(page.getByText('Tailwind CSS 4:')).toBeVisible()
  })

  test('should handle button interactions', async ({ page }) => {
    await page.goto('/')
    
    // Click primary button
    const primaryButton = page.getByRole('button', { name: 'Primary Button' })
    await primaryButton.click()
    
    // Button should still be visible (no specific action expected in test component)
    await expect(primaryButton).toBeVisible()
  })

  test('should be responsive', async ({ page }) => {
    await page.goto('/')
    
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })
    await expect(page.getByText('ApplyCopilot - Ant Design Integration Test')).toBeVisible()
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 })
    await expect(page.getByText('ApplyCopilot - Ant Design Integration Test')).toBeVisible()
    
    // Test desktop viewport
    await page.setViewportSize({ width: 1200, height: 800 })
    await expect(page.getByText('ApplyCopilot - Ant Design Integration Test')).toBeVisible()
  })
})
