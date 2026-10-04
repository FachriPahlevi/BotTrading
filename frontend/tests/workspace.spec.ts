import { test, expect, type Page } from '@playwright/test'

function marketFixture(symbol = 'XAUUSDm', interval = '1h', stale = false) {
  const end = Math.floor(Date.now() / 3_600_000) * 3_600_000
  return {
    symbol,
    interval,
    provider: 'Fixture MT5',
    updated_at: new Date(Date.now() - (stale ? 120_000 : 0)).toISOString(),
    candles: Array.from({ length: 180 }, (_, i) => {
      const open = 2640 + i * 0.4 + Math.sin(i * 0.6) * 5
      const close = open + Math.cos(i * 0.7) * 3
      return {
        time: end - (179 - i) * 3_600_000,
        open,
        close,
        high: Math.max(open, close) + 2,
        low: Math.min(open, close) - 2,
        volume: 100 + i,
      }
    }),
  }
}

const summary = {
  generated_at: new Date().toISOString(),
  overview: {
    total_signals: 24,
    open_signals: 1,
    risk_alerts: 1,
    average_confluence: 72,
    high_confidence_signals: 0,
    latest_regime: 'TRENDING_UP',
  },
  open_signal_feed: [
    {
      id: 42,
      symbol: 'XAUUSDm',
      direction: 'BUY',
      entry: 2700,
      stop_loss: 2690,
      status: 'open',
    },
  ],
  risk_feed: [
    {
      id: 1,
      event_type: 'SPREAD_LIMIT',
      action_taken: 'Entry ditunda',
      resolved: false,
      created_at: new Date().toISOString(),
    },
  ],
  latest_regimes: [
    {
      symbol: 'XAUUSDm',
      regime: 'TRENDING_UP',
      volatility_state: 'NORMAL',
      timestamp: new Date().toISOString(),
    },
  ],
  confluence_feed: [
    {
      signal_id: 42,
      total: 72,
      flag: 'MODERATE',
      trend_score: 70,
      momentum_score: 74,
    },
  ],
}

async function mockApi(
  page: Page,
  options: { failed?: boolean; stale?: boolean; empty?: boolean } = {},
) {
  await page.route('**/health', (route) =>
    route.fulfill({ json: { status: 'ok' } }),
  )
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/src/')) return route.continue()
    if (options.failed)

      return route.fulfill({
        status: 503,
        json: { detail: 'MT5 bridge unavailable' },
      })
    if (url.pathname === '/api/market/chart') {
      const data = marketFixture(
        url.searchParams.get('symbol')!,
        url.searchParams.get('interval')!,
        options.stale,
      )
      if (options.empty) data.candles = []
      return route.fulfill({ json: data })
    }
    if (url.pathname === '/api/account') return route.fulfill({ json: {
      login: '123456', name: 'Test User', company: 'Test Broker', server: 'Test-Demo',
      currency: 'USC', trade_mode: 'DEMO', leverage: 100, balance: 200, equity: 190,
      profit: -10, credit: 0, margin: 20, margin_free: 170, margin_level: 950,
      positions_count: 1, connected: true,
      updated_at: new Date(Date.now() - (options.stale ? 120_000 : 0)).toISOString(),
    } })
    if (url.pathname === '/api/ai/analyze') return route.fulfill({ json: {
      symbol: url.searchParams.get('symbol') || 'XAUUSDm',
      interval: url.searchParams.get('interval') || '1h',
      bias: 'LONG',
      confidence: 82,
      rationale: ['Struktur bullish di atas EMA-14', 'Support kunci di swing low'],
      scenarios: { main: { direction: 'LONG', entry_min: 2700, entry_max: 2705, stop_loss: 2690, take_profit_1: 2720, take_profit_2: 2740, rr_ratio: 1.5 } },
      chart_overlays: [{ type: 'stop_loss', label: 'Stop Loss', price: 2690, style: 'solid', color: '#f43f5e' }],
      provider: 'deterministic_engine',
    } })
    if (url.pathname === '/api/diagnostics') return route.fulfill({ json: {
      session_id: 'test-session', started_at: new Date().toISOString(), generated_at: new Date().toISOString(),
      capacity: 1000, dropped: 0,
      connection: { mode: 'EA_PUSH', account_age_seconds: null, account_fresh: false, markets: [], explanation: 'Belum ada kiriman EA.' },
      events: [
        { id: 2, timestamp: new Date().toISOString(), level: 'ERROR', source: 'api', message: 'Request gagal', details: { method: 'GET', path: '/api/account', status: 503, request_id: 'fixture-request', reason: 'Akun belum diterima dari EA.' } },
        { id: 1, timestamp: new Date().toISOString(), level: 'INFO', source: 'system', message: 'API siap menerima request', details: {} },
      ],
    } })
    return route.fulfill({ json: summary })
  })
}

test('live chart, timeframe, signal overlays and risk calculator work without mutations', async ({
  page,
}, testInfo) => {
  const errors: string[] = []
  const mutations: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {


    if (request.url().includes('/api/') && request.method() !== 'GET')
      mutations.push(request.method())
  })
  await mockApi(page)
  await page.goto('/workspace/')
  await expect(page.getByTestId('market-chart')).toBeVisible()
  await expect(page.getByText('Data diterima', { exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Analisis chart aktif', exact: true }),
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Analisis chart aktif', exact: true }).click()
  await expect(page.getByText('LONG (82%)')).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Mulai trading dengan AI' }),
  ).toBeDisabled()

  await page.getByRole('button', { name: '15M', exact: true }).click()
  await expect(page.getByTestId('market-chart')).toBeVisible()
  await page.getByRole('button', { name: 'RSI', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'RSI', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Lihat sinyal 42 pada chart' }).click()
  await expect(
    page.getByText('Entry 2,700.00000', { exact: false }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Zona harga', exact: true }).click()
  await expect(
    page.getByText('Zona harga: klik', { exact: false }),
  ).toBeVisible()
  const box = await page.getByTestId('market-chart').boundingBox()
  if (box) {
    await page.mouse.click(box.x + 80, box.y + 80)
    await page.mouse.click(box.x + 180, box.y + 140)
  }
  await page.getByRole('button', { name: 'Hapus gambar manual' }).click()
  await expect(page.getByLabel('Saldo MT5 (USC)')).toHaveAttribute('readonly', '')
  await expect(page.getByTestId('risk-budget')).toHaveText('1.00 USC')
  await expect(page.getByTestId('account-balance')).toHaveText('200.00 USC')
  await page.getByRole('tab', { name: 'Risiko', exact: true }).click()
  await expect(page.getByText('SPREAD_LIMIT')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy()
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.screenshot({
    path: `test-results/workspace-${testInfo.project.name}.png`,
    fullPage: true,
  })
  expect(errors).toEqual([])
  expect(mutations).toEqual([])
})

test('symbol picker loads the requested instrument and closes accessibly', async ({
  page,
}) => {
  await mockApi(page)
  await page.goto('/workspace/')
  await page.getByRole('button', { name: 'Cari instrumen' }).click()
  await page.getByLabel('Simbol MT5').fill('EURUSDm')
  await page.getByRole('button', { name: 'Buka chart', exact: true }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await expect(
    page.getByText('Simbol diterima: EURUSDm', { exact: false }),
  ).toBeVisible()
  await expect(page.getByTestId('market-chart')).toBeVisible()
})

test('offline API shows recoverable errors and never fabricates market values', async ({
  page,
}) => {
  await mockApi(page, { failed: true })
  await page.goto('/workspace/')
  await expect(page.getByText('Chart siap. Menunggu feed MT5.')).toBeVisible()
  await expect(page.getByTestId('market-chart')).not.toBeVisible()
  await expect(
    page.getByText('Data pasar belum bisa diperbarui.'),
  ).toBeVisible()
  await expect(page.getByText('Sinyal belum dapat dimuat')).toBeVisible()
  await page.unroute('**/api/**')
  await mockApi(page)
  await page.getByRole('button', { name: 'Coba hubungkan' }).click()
  await expect(page.getByTestId('market-chart')).toBeVisible()
})

test('old payload is labeled stale despite a successful HTTP response', async ({
  page,
}) => {
  await mockApi(page, { stale: true })
  await page.goto('/workspace/')
  await expect(
    page.getByText('Data kedaluwarsa', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('Data diterima', { exact: true }),
  ).not.toBeVisible()
  await expect(page.getByTestId('market-chart')).toBeVisible()
})

test('empty candles and invalid risk inputs are explicit', async ({ page }) => {
  await mockApi(page, { empty: true })
  await page.goto('/workspace/')
  await expect(page.getByText('Chart siap. Menunggu feed MT5.')).toBeVisible()
  await page.getByLabel('Risiko per trade (%)').fill('101')
  await expect(page.getByTestId('risk-budget')).toHaveText('—')
  await expect(
    page.getByRole('alert').filter({ hasText: 'Saldo harus positif' }),
  ).toBeVisible()
})

test('navigation and feature-status dialog are reachable on every viewport', async ({
  page,
}, testInfo) => {
  await mockApi(page)
  await page.goto('/workspace/')
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Buka navigasi' }).click()
  await page.getByRole('button', { name: 'Panduan workspace' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(
    page.getByRole('dialog').getByText('Tersedia:', { exact: true }),
  ).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.getByRole('link', { name: 'Konteks pasar' }).click()
  await expect(page.locator('#fundamental')).toBeInViewport()
  if (testInfo.project.name === 'mobile')
    await expect(
      page.getByRole('button', { name: 'Tutup navigasi' }),
    ).not.toBeVisible()
})

test('account refresh uses terminal balance, preserves zero, and clears data on disconnect', async ({ page }) => {
  await mockApi(page)
  await page.goto('/workspace/')
  await expect(page.getByTestId('account-balance')).toHaveText('200.00 USC')
  await expect(page.getByText('Test User', { exact: true })).toBeVisible()
  await page.route('**/api/account', route => route.fulfill({ json: {
    login: '654321', name: 'Second Test User', company: 'Test Broker', server: 'Test-Real',
    currency: 'EUR', trade_mode: 'REAL', leverage: 200, balance: 0, equity: 0,
    profit: 0, credit: 0, margin: 0, margin_free: 0, margin_level: null,
    positions_count: 0, connected: true, updated_at: new Date().toISOString(),
  } }))
  await page.getByRole('button', { name: 'Perbarui semua data' }).click()
  await expect(page.getByTestId('account-balance')).toHaveText('0.00 EUR')
  await expect(page.getByText('Second Test User', { exact: true })).toBeVisible()
  await expect(page.getByTestId('risk-budget')).toHaveText('—')
  await page.route('**/api/account', route => route.fulfill({ status: 503, json: { detail: 'Terminal terputus' } }))
  await page.getByRole('button', { name: 'Perbarui semua data' }).click()
  await expect(page.getByTestId('account-balance')).toHaveText('—')
  await expect(page.getByText('Terminal terputus', { exact: true })).toBeVisible()
  await expect(page.getByText('Second Test User', { exact: true })).not.toBeVisible()
})

test('stale account cannot be presented as a current balance', async ({ page }) => {
  await mockApi(page, { stale: true })
  await page.goto('/workspace/')
  await expect(page.getByText('Data akun kedaluwarsa. Menunggu pembaruan terminal.')).toBeVisible()
  await expect(page.getByTestId('account-balance')).toHaveText('—')
  await expect(page.getByTestId('risk-budget')).toHaveText('—')
})

test('sidebar logs show diagnostics, filter, details and downloadable events', async ({ page }, testInfo) => {
  await mockApi(page)
  await page.goto('/workspace/')
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Buka navigasi' }).click()
  await page.getByRole('link', { name: 'Log sistem' }).click()
  await expect(page.locator('#logs')).toBeInViewport()
  await expect(page.getByText('Jalur koneksi: EA → API')).toBeVisible()
  await page.getByLabel('Level log').selectOption('ERROR')
  await expect(page.getByTestId('log-events').locator('details')).toHaveCount(1)
  await page.getByTestId('log-events').locator('summary').click()
  await expect(page.getByText('Akun belum diterima dari EA.', { exact: true })).toBeVisible()
  await page.getByLabel('Cari log').fill('no-match')
  await expect(page.getByText('Tidak ada log yang cocok dengan filter.')).toBeVisible()
  await page.getByLabel('Cari log').fill('fixture-request')
  await page.getByRole('button', { name: 'Jeda log', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lanjutkan log', exact: true })).toBeVisible()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Unduh JSON' }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('aurum-system-log.json')
  await page.getByLabel('Sumber log').selectOption('bridge')
  await expect(page.getByTestId('log-events').locator('details')).toHaveCount(0)
})
