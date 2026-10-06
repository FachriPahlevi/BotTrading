import { test, expect } from '@playwright/test'

test('Strategy Management page displays saved plans, interactive chart, and plan switcher', async ({
  page,
}, info) => {
  // Mock necessary endpoints
  await page.route('**/api/account', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        login: '12345678',
        name: 'Demo Trader',
        company: 'Exness Ltd',
        server: 'Exness-MT5Trial',
        currency: 'USD',
        trade_mode: 'DEMO',
        leverage: 200,
        balance: 10000.0,
        equity: 10000.0,
        profit: 0.0,
        credit: 0.0,
        margin: 0.0,
        margin_free: 10000.0,
        margin_level: 0.0,
        positions_count: 0,
        connected: true,
        updated_at: new Date().toISOString(),
      }),
    })
  })

  await page.route('**/api/market/chart*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        symbol: 'XAUUSDm',
        interval: '1h',
        updated_at: new Date().toISOString(),
        candles: [
          { time: Date.now() - 3600000, open: 4130, high: 4135, low: 4125, close: 4132, volume: 100 },
          { time: Date.now(), open: 4132, high: 4138, low: 4129, close: 4134, volume: 120 },
        ],
      }),
    })
  })

  await page.route('**/api/market/summary*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recorded_signals: 1,
        open_signals: 1,
        active_risk_events: 0,
        avg_confluence: 85,
        recent_signals: [],
      }),
    })
  })

  await page.goto('/workspace/')

  // On mobile viewport open the navigation drawer first
  if (info.project.name === 'mobile') {
    await page.getByRole('button', { name: 'Buka navigasi' }).click()
  }

  // Navigate to Manajemen Strategi tab
  const stratNav = page.getByRole('link', { name: 'Manajemen Strategi' })
  await expect(stratNav).toBeVisible()
  await stratNav.click()

  // Verify page title
  await expect(
    page.getByRole('heading', { name: 'Manajemen Strategi & Rencana Trading' })
  ).toBeVisible()

  // Verify KPI stats row
  await expect(page.getByText('Total Strategi Tersimpan')).toBeVisible()

  // Verify plan cards exist (using heading role with .first() to avoid strict-mode ambiguity)
  await expect(
    page.getByRole('heading', { name: 'XAUUSD – Analisis Mendalam & Skenario H&S' }).first()
  ).toBeVisible()

  // Verify interactive vector chart is visible
  await expect(page.locator('svg#c')).toBeVisible()

  // Verify 6 detailed analysis sections
  await expect(page.getByRole('heading', { name: '1. Kesimpulan' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '2. Fundamental' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '3. Teknikal & Pola Candle' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '4. Volume & Momentum' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '5. Musim & Waktu' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '6. Rencana Trading' })).toBeVisible()

  // Verify clicking plan scenario switcher (Plan B: Sell breakdown)
  const planBButton = page.getByRole('button', { name: 'B. Sell breakdown' })
  if (await planBButton.isVisible()) {
    await planBButton.click()
    await expect(page.getByText('Entry 4.095')).toBeVisible()
  }

  // Verify "+ Buat Strategi Baru" modal opens
  await page.getByRole('button', { name: '+ Buat Strategi Baru' }).click()
  await expect(page.getByText('Buat Strategi / Rencana Baru')).toBeVisible()
  await page.getByRole('button', { name: 'Batal' }).click()
  await expect(page.getByText('Buat Strategi / Rencana Baru')).not.toBeVisible()
})
