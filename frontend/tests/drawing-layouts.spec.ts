import { expect, test } from '@playwright/test'

test('manual drawings autosave and layouts can be renamed and duplicated', async ({ page }) => {
  const candles = Array.from({ length: 100 }, (_, index) => ({
    time: 1704067200000 + index * 3600000,
    open: 2000 + index,
    high: 2004 + index,
    low: 1998 + index,
    close: 2002 + index,
    volume: 100,
  }))
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.includes('/src/')) return route.continue()
    if (path === '/api/lab/catalog') return route.fulfill({ json: { indicators: [], strategies: [], datasets: [], schemas: {}, runs: [], run_count: 0, history_bridge_configured: false } })
    if (path === '/api/market/chart') return route.fulfill({ json: { symbol: 'XAUUSDm', interval: '1h', provider: 'test', updated_at: new Date().toISOString(), candles } })
    if (path === '/api/account') return route.fulfill({ status: 503, json: { detail: 'No account in UI test' } })
    if (path === '/api/dashboard/summary') return route.fulfill({ json: { signals: [], risk: {}, regime: {}, news: [], events: [] } })
    if (path === '/api/diagnostics') return route.fulfill({ json: { events: [], markets: [] } })
    return route.fulfill({ json: {} })
  })
  await page.route('**/health', (route) => route.fulfill({ json: { status: 'ok' } }))
  await page.goto('/workspace/')
  const chart = page.getByTestId('market-chart')
  await expect(chart).toBeVisible()

  await page.getByRole('button', { name: 'Garis tren' }).click()
  const box = await chart.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width * 0.35, box!.y + box!.height * 0.65)
  await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.35)
  await page.mouse.click(box!.x + box!.width * 0.65, box!.y + box!.height * 0.35)
  await expect.poll(() => page.evaluate(() => {
    const layouts = JSON.parse(localStorage.getItem('aurum.chart.drawing-layouts.v1') ?? '[]')
    return layouts[0]?.drawings?.length ?? 0
  })).toBe(1)

  await page.getByRole('button', { name: 'Buka alat gambar' }).click()
  await expect(page.getByRole('heading', { name: 'Alat gambar & layout' })).toBeVisible()
  await page.getByLabel('Nama layout').fill('Analisis London')
  await page.getByRole('button', { name: 'Simpan nama' }).click()
  await page.getByRole('button', { name: 'Duplikat' }).click()
  await expect.poll(() => page.evaluate(() => {
    const layouts = JSON.parse(localStorage.getItem('aurum.chart.drawing-layouts.v1') ?? '[]')
    return { count: layouts.length, drawings: layouts[1]?.drawings?.length, name: layouts[0]?.name }
  })).toEqual({ count: 2, drawings: 1, name: 'Analisis London' })
})
