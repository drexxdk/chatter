import { test, expect } from '@playwright/test'

test.describe('Frontend', () => {
  test('root redirects to the admin panel', async ({ page }) => {
    await page.goto('http://localhost:3000')

    await expect(page).toHaveURL(/\/admin/)
  })
})
