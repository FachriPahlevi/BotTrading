import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  init,
  dispose,
  registerIndicator,
  registerOverlay,
  type Chart,
  type KLineData,
  type Period,
  type CandleType,
} from 'klinecharts'
import {
  Camera,
  Check,
  ChevronDown,
  Crosshair,
  Maximize2,
  Minimize2,
  Palette,
  RotateCcw,
  Settings,
  Settings2,
  Sliders,
  Square,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { number, type ChartOverlayItem, type Market, type Signal } from '@/lib/api'
import { ChartIndicatorDialog } from '@/components/chart-indicator-dialog'
import { ChartDrawingManager } from '@/components/chart-drawing-manager'
import {
  request,
  type Catalog,
  type ChartIndicatorConfig,
  type IndicatorCalculation,
} from '@/components/lab/api'

const periods: Record<string, Period> = {
  '1m': { type: 'minute', span: 1 },
  '5m': { type: 'minute', span: 5 },
  '15m': { type: 'minute', span: 15 },
  '1h': { type: 'hour', span: 1 },
  '4h': { type: 'hour', span: 4 },
  '1d': { type: 'day', span: 1 },
}

registerIndicator<Record<string, number>, unknown, Record<number, Record<string, number>>>({
  name: 'AURUM_CONFIGURED',
  shortName: 'Aurum',
  figures: [],
  calc: (bars, indicator) => bars.map((bar) => indicator.extendData?.[bar.timestamp] ?? {}),
})

function storedList<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

registerOverlay({
  name: 'priceZone',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates }) => {
    if (coordinates.length < 2) return []
    const [a, b] = coordinates
    return [
      {
        type: 'rect',
        attrs: {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
        },
        styles: {
          style: 'stroke_fill',
          color: '#68dfbe18',
          borderColor: '#68dfbe',
          borderSize: 1,
        },
      },
    ]
  },
})

type BosVisualData = { color: string; label?: string; opacity?: number; dashed?: boolean }

registerOverlay<BosVisualData>({
  name: 'bosLevel',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return []
    const [start, end] = coordinates
    const data = overlay.extendData
    return [
      {
        type: 'line',
        attrs: { coordinates: [start, end] },
        styles: { color: data.color, size: 2, style: data.dashed ? 'dashed' : 'solid' },
      },
      ...(data.label
        ? [
            {
              type: 'text' as const,
              attrs: { x: end.x + 7, y: end.y, text: data.label, align: 'left' as const, baseline: 'middle' as const },
              styles: {
                color: '#f8fafc',
                backgroundColor: data.color,
                borderColor: data.color,
                borderSize: 1,
                padding: [4, 7] as [number, number],
              },
            },
          ]
        : []),
    ]
  },
})

registerOverlay<BosVisualData>({
  name: 'bosZone',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return []
    const [a, b] = coordinates
    const data = overlay.extendData
    return [
      {
        type: 'rect',
        attrs: {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
        },
        styles: { style: 'fill', color: data.color },
      },
    ]
  },
})

export type CandleTheme = 'emerald' | 'neon' | 'cyberpunk' | 'blue_orange' | 'monochrome'

const colorThemes: Record<
  CandleTheme,
  { name: string; up: string; down: string; bgUp: string; bgDown: string }
> = {
  emerald: {
    name: 'TradingView Emerald & Rose',
    up: '#10b981',
    down: '#f43f5e',
    bgUp: '#10b98125',
    bgDown: '#f43f5e25',
  },
  neon: {
    name: 'Classic Neon Green & Coral',
    up: '#39c9a4',
    down: '#f07b86',
    bgUp: '#39c9a425',
    bgDown: '#f07b8625',
  },
  cyberpunk: {
    name: 'Cyberpunk Cyan & Magenta',
    up: '#00f2fe',
    down: '#ec4899',
    bgUp: '#00f2fe25',
    bgDown: '#ec489925',
  },
  blue_orange: {
    name: 'Modern Blue & Orange',
    up: '#3b82f6',
    down: '#f97316',
    bgUp: '#3b82f625',
    bgDown: '#f9731625',
  },
  monochrome: {
    name: 'Monochrome Pro (White & Dark)',
    up: '#e2e8f0',
    down: '#64748b',
    bgUp: '#e2e8f025',
    bgDown: '#64748b25',
  },
}

const chartTypes: { id: CandleType; label: string; icon: string }[] = [
  { id: 'candle_solid', label: 'Candle Solid', icon: '🕯️' },
  { id: 'candle_stroke', label: 'Hollow Candle', icon: '🪟' },
  { id: 'ohlc', label: 'OHLC Bar', icon: '📊' },
  { id: 'area', label: 'Area Line', icon: '📈' },
]

export function MarketChart({
  market,
  signal,
  overlays,
  currentInterval,
  onIntervalChange,
  onOpenIndicatorManager,
}: {
  market: Market
  signal?: Signal | null
  overlays?: ChartOverlayItem[]
  currentInterval?: string
  onIntervalChange?: (interval: string) => void
  onOpenIndicatorManager?: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chart = useRef<Chart | null>(null)
  const [chartInstance, setChartInstance] = useState<Chart | null>(null)
  const latest = useRef(market)
  const subscriber = useRef<((bar: KLineData) => void) | null>(null)
  const lastTime = useRef(0)

  const [indicatorOpen, setIndicatorOpen] = useState(false)
  const [configured, setConfigured] = useState<ChartIndicatorConfig[]>(() =>
    storedList('aurum.chart.indicators'),
  )
  const [favorites, setFavorites] = useState<string[]>(() =>
    storedList('aurum.indicator.favorites'),
  )
  const customIds = useRef<string[]>([])
  const bosGroups = useRef<string[]>([])
  const [notice, setNotice] = useState('Scroll untuk zoom · geser untuk melihat histori')
  latest.current = market
  const visible = useMemo(() => configured.filter((item) => item.visible), [configured])

  const catalog = useQuery({
    queryKey: ['lab-catalog'],
    queryFn: () => request<Catalog>('/catalog'),
    staleTime: 15000,
  })

  const calculation = useQuery({
    queryKey: [
      'chart-indicators',
      market.symbol,
      market.interval,
      market.candles.at(-1)?.time,
      visible,
    ],
    queryFn: () =>
      request<IndicatorCalculation>('/indicators/calculate', 'POST', {
        symbol: market.symbol,
        interval: market.interval,
        candles: market.candles.map(({ time, open, high, low, close, volume }) => ({
          time,
          open,
          high,
          low,
          close,
          volume,
        })),
        indicators: visible.map(({ alias, version_id, params }) => ({
          alias,
          version_id,
          params,
        })),
      }),
    enabled: visible.length > 0,
    retry: false,
  })

  useEffect(() => {
    localStorage.setItem('aurum.chart.indicators', JSON.stringify(configured))
  }, [configured])

  useEffect(() => {
    localStorage.setItem('aurum.indicator.favorites', JSON.stringify(favorites))
  }, [favorites])

  // Chart customization states
  const [candleType, setCandleType] = useState<CandleType>('candle_solid')
  const [candleTheme, setCandleTheme] = useState<CandleTheme>('emerald')
  const [showHGrid, setShowHGrid] = useState(true)
  const [showVGrid, setShowVGrid] = useState(true)
  const [showPriceLine, setShowPriceLine] = useState(true)
  const [barSpace, setBarSpace] = useState(8)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Menus & Dialogs
  const [showSettings, setShowSettings] = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)

  // Apply chart styles helper
  const applyStyles = (
    c: Chart,
    type: CandleType = candleType,
    theme: CandleTheme = candleTheme,
    hGrid = showHGrid,
    vGrid = showVGrid,
    priceLine = showPriceLine,
  ) => {
    const t = colorThemes[theme]
    c.setStyles({
      grid: {
        horizontal: { show: hGrid, color: '#1e293b' },
        vertical: { show: vGrid, color: '#15202e' },
      },
      candle: {
        type,
        bar: {
          upColor: t.up,
          downColor: t.down,
          upBorderColor: t.up,
          downBorderColor: t.down,
          upWickColor: t.up,
          downWickColor: t.down,
        },
        area: {
          lineColor: t.up,
          backgroundColor: [
            { offset: 0, color: `${t.up}33` },
            { offset: 1, color: `${t.up}05` },
          ],
        },
        priceMark: {
          last: {
            show: priceLine,
            upColor: t.up,
            downColor: t.down,
          },
        },
      },
      xAxis: { tickText: { color: '#8491a3', size: 10 } },
      yAxis: { tickText: { color: '#8491a3', size: 10 } },
    })
  }

  // Initialize KlineCharts instance
  useEffect(() => {
    if (!host.current) return
    const instance = init(host.current, {
      timezone: 'Asia/Jakarta',
      locale: 'en-US',
      styles: 'dark',
    })
    if (!instance) return
    chart.current = instance
    setChartInstance(instance)

    applyStyles(instance, candleType, candleTheme, showHGrid, showVGrid, showPriceLine)

    instance.setDataLoader({
      getBars: ({ type, callback }) => {
        const bars = latest.current.candles.map((c) => ({
          ...c,
          timestamp: c.time,
        }))
        callback(type === 'init' ? bars : [], false)
        lastTime.current = bars.at(-1)?.timestamp ?? 0
      },
      subscribeBar: ({ callback }) => {
        subscriber.current = callback
      },
      unsubscribeBar: () => {
        subscriber.current = null
      },
    })

    instance.setSymbol({
      ticker: latest.current.symbol,
      pricePrecision: 5,
      volumePrecision: 0,
    })

    instance.setPeriod(periods[latest.current.interval] || periods['1h'])
    instance.setBarSpace(barSpace)

    // Load initial indicators
    instance.createIndicator('VOL', false)

    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(host.current)

    return () => {
      observer.disconnect()
      subscriber.current = null
      dispose(instance)
      chart.current = null
      setChartInstance(null)
    }
  }, [])

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
      setTimeout(() => chart.current?.resize(), 150)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // Real-time market feed update
  useEffect(() => {
    for (const candle of market.candles) {
      if (candle.time >= lastTime.current)
        subscriber.current?.({ ...candle, timestamp: candle.time })
    }
    lastTime.current = market.candles.at(-1)?.time ?? 0
  }, [market])

  // Signal Overlay
  useEffect(() => {
    const instance = chart.current
    if (!instance) return
    instance.removeOverlay({ groupId: 'signal' })
    if (signal) {
      setNotice(
        `Highlight sinyal #${signal.id} (${signal.symbol}): Entry ${number(signal.entry, 5)}, SL ${number(signal.stop_loss, 5)}.`,
      )
      for (const [label, price, color] of [
        ['Entry', signal.entry, '#e2b76e'],
        ['Stop loss', signal.stop_loss, '#f07b86'],
      ] as const) {
        if (price > 0)
          instance.createOverlay({
            name: 'horizontalStraightLine',
            groupId: 'signal',
            lock: true,
            points: [{ value: price }],
            styles: { line: { color, size: 1 } },
          })
      }
    }
  }, [signal])

  // AI Analysis Overlays
  useEffect(() => {
    const instance = chart.current
    if (!instance) return
    instance.removeOverlay({ groupId: 'ai_overlay' })
    if (overlays && overlays.length > 0) {
      for (const item of overlays) {
        if (item.price > 0) {
          instance.createOverlay({
            name: 'horizontalStraightLine',
            groupId: 'ai_overlay',
            lock: true,
            points: [{ value: item.price }],
            styles: {
              line: {
                color: item.color,
                size: 1,
                style: item.style === 'dashed' ? 'dashed' : 'solid',
              },
            },
          })
        }
      }
    }
  }, [overlays])

  // Change Candle Type
  function handleCandleTypeChange(type: CandleType) {
    setCandleType(type)
    if (chart.current) {
      applyStyles(chart.current, type, candleTheme, showHGrid, showVGrid, showPriceLine)
    }
    setShowTypeMenu(false)
  }

  // Change Color Theme
  function handleThemeChange(theme: CandleTheme) {
    setCandleTheme(theme)
    if (chart.current) {
      applyStyles(chart.current, candleType, theme, showHGrid, showVGrid, showPriceLine)
    }
  }

  // Adjust Bar Space (Candle Spacing & Thickness)
  function handleBarSpace(delta: number) {
    const next = Math.max(3, Math.min(30, barSpace + delta))
    setBarSpace(next)
    chart.current?.setBarSpace(next)
  }

  // Toggle Fullscreen
  function toggleFullscreen() {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  // Screenshot / Camera Download
  function handleScreenshot() {
    if (!chart.current) return
    try {
      const dataUrl = chart.current.getConvertPictureUrl(true, 'jpeg', '#0a0f18')
      if (dataUrl) {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = `Chart_${market.symbol}_${market.interval}_${Date.now()}.jpg`
        a.click()
        setNotice('Screenshot chart berhasil disimpan ke perangkat!')
      }
    } catch {
      setNotice('Gagal mengambil screenshot chart.')
    }
  }

  const [indicators, setIndicators] = useState<string[]>(['VOL', 'EMA'])

  function toggleIndicator(name: string) {
    const enabled = indicators.includes(name)
    if (enabled) {
      chart.current?.removeIndicator({ name })
      setIndicators((curr) => curr.filter((i) => i !== name))
    } else {
      if (['MA', 'EMA', 'BOLL', 'SAR'].includes(name)) {
        chart.current?.createIndicator({ name, paneId: 'candle_pane' }, false)
      } else {
        chart.current?.createIndicator(name, false)
      }
      setIndicators((curr) => [...curr, name])
    }
  }

  function draw(name: string, label: string) {
    chart.current?.createOverlay({ name, groupId: 'manual' })
    setNotice(`${label}: klik pada canvas chart untuk meletakkan titik.`)
  }

  // Configured Indicators & BOSWaves Render Effect
  useEffect(() => {
    const instance = chart.current
    if (!instance) return
    for (const id of customIds.current) instance.removeIndicator({ id })
    for (const groupId of bosGroups.current) instance.removeOverlay({ groupId })
    customIds.current = []
    bosGroups.current = []
    if (!calculation.data) return
    let hasBos = false
    for (const item of calculation.data.instances) {
      const config = visible.find((value) => value.alias === item.alias)
      if (!config) continue
      const allKeys = Object.keys(calculation.data.lines).filter((key) =>
        key.startsWith(item.alias + '.'),
      )
      const keys =
        item.kind === 'boswaves_core'
          ? ['edge_glow', 'edge', 'mid', 'alma']
              .map((key) => `${item.alias}.${key}`)
              .filter((key) => allKeys.includes(key))
          : allKeys.filter((key) => !/\.(trend|risk|bull_flip|bear_flip|conviction)$/.test(key))
      const values: Record<number, Record<string, number>> = {}
      const scaleKeys = [`${item.alias}.stop`, `${item.alias}.target4`]
      const valueKeys =
        item.kind === 'boswaves_core'
          ? [...keys, ...scaleKeys, `${item.alias}.trend`, `${item.alias}.conviction`]
          : keys
      market.candles.forEach((bar, index) => {
        values[bar.time] = {}
        for (const key of valueKeys) {
          const value = calculation.data!.lines[key]?.[index]
          if (value !== null && value !== undefined) values[bar.time][key] = value
        }
      })
      const id = `configured_${config.key}`
      const trendKey = `${item.alias}.trend`
      const bosFigures = [...keys, ...scaleKeys].map((key) => {
        const part = key.split('.').at(-1)
        const styles = ({ data }: { data: { current?: Record<string, number> | null } }) => {
          if (part === 'stop' || part === 'target4') return { color: '#00000000', size: 0 }
          const trend = data.current?.[trendKey] ?? 0
          const color = trend >= 0 ? '#59f58b' : '#ff4f91'
          if (part === 'edge_glow') return { color: trend >= 0 ? '#59f58b35' : '#ff4f9135', size: 10 }
          if (part === 'edge') return { color, size: 3 }
          if (part === 'mid') return { color: trend >= 0 ? '#59f58b55' : '#ff4f9155', size: 5 }
          return { color: '#f8fafccc', size: 1 }
        }
        return { key, title: part + ': ', type: 'line' as const, styles }
      })
      instance.createIndicator(
        {
          id,
          name: 'AURUM_CONFIGURED',
          paneId: ['rsi', 'atr'].includes(item.kind) ? `pane_${config.key}` : 'candle_pane',
          shortName: config.name,
          figures:
            item.kind === 'boswaves_core'
              ? bosFigures
              : keys.map((key) => ({ key, title: key.split('.').at(-1) + ': ', type: 'line' as const })),
          extendData: values,
        },
        true,
      )
      customIds.current.push(id)
      if (item.kind === 'boswaves_core') {
        hasBos = true
        const groupId = `boswaves_${config.key}`
        bosGroups.current.push(groupId)
        const bull = calculation.data.lines[`${item.alias}.bull_flip`] ?? []
        const bear = calculation.data.lines[`${item.alias}.bear_flip`] ?? []
        const risk = calculation.data.lines[`${item.alias}.risk`] ?? []
        const flips = market.candles
          .map((_, index) => (bull[index] === 1 || bear[index] === 1 ? index : -1))
          .filter((index) => index >= 0)
        const keep = Math.max(1, Math.min(12, config.params.keepPositions ?? 4))
        const targetCount = Math.max(2, Math.min(4, config.params.targetCount ?? 4))
        const zonePct = Math.max(0.01, Math.min(0.25, config.params.zonePct ?? 0.06))
        const extend = Math.max(5, Math.min(200, config.params.extendBars ?? 30))
        const spacing =
          market.candles.length > 1
            ? market.candles.at(-1)!.time - market.candles.at(-2)!.time
            : 3600000
        for (const positionIndex of flips.slice(-keep)) {
          const flipOrder = flips.indexOf(positionIndex)
          const nextIndex = flips[flipOrder + 1]
          const candle = market.candles[positionIndex]
          const direction = bull[positionIndex] === 1 ? 1 : -1
          const distance = risk[positionIndex]
          if (!candle || distance === null || !Number.isFinite(distance) || distance <= 0) continue
          const endTime =
            nextIndex === undefined
              ? market.candles.at(-1)!.time + spacing * extend
              : market.candles[nextIndex].time
          const entry = candle.close,
            stop = entry - direction * distance
          const activeColor = direction === 1 ? '#5ee785' : '#ff3f83'
          const level = (value: number, label: string, color: string, dashed = false) =>
            instance.createOverlay({
              name: 'bosLevel',
              groupId,
              lock: true,
              points: [
                { timestamp: candle.time, value },
                { timestamp: endTime, value },
              ],
              extendData: { color, label, dashed },
            })
          const zone = (top: number, bottom: number, color: string) =>
            instance.createOverlay({
              name: 'bosZone',
              groupId,
              lock: true,
              points: [
                { timestamp: candle.time, value: top },
                { timestamp: endTime, value: bottom },
              ],
              extendData: { color },
            })
          zone(Math.max(entry, stop), Math.min(entry, stop), '#ff3f8312')
          level(entry, direction === 1 ? 'LONG' : 'SHORT', activeColor)
          level(stop, 'SL  -1R', '#ff3f83')
          let previous = entry
          for (let target = 1; target <= targetCount; target++) {
            const price = entry + direction * distance * target
            const high = price + distance * zonePct,
              low = price - distance * zonePct
            zone(Math.max(previous, price), Math.min(previous, price), '#5ee7850b')
            zone(high, low, '#5ee78518')
            level(price, `T${target}  ${target}R`, '#5ee785', target > 1)
            previous = price
          }
        }
      }
    }
    instance.setOffsetRightDistance(hasBos ? 170 : 35)
  }, [calculation.data, market.candles, visible])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex flex-col bg-[#0a0f18] text-foreground select-none transition-all',
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen p-4' : 'w-full',
      )}
    >
      {/* Top Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/80 bg-[#0d131f] px-3 py-2 text-xs">
        {/* Left Section: Candle Type, Indicators */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Candle Type Dropdown */}
          <div className="relative">
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setShowTypeMenu(!showTypeMenu)
                setShowSettings(false)
              }}
              className="h-7 text-xs gap-1 border-border/80"
              title="Pilih Model Candle"
            >
              <span>{chartTypes.find((t) => t.id === candleType)?.icon}</span>
              <span className="hidden sm:inline">
                {chartTypes.find((t) => t.id === candleType)?.label}
              </span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </Button>

            {showTypeMenu && (
              <div className="absolute left-0 top-8 z-30 w-44 rounded-md border border-border bg-[#0d131f] p-1.5 shadow-xl space-y-1">
                {chartTypes.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => handleCandleTypeChange(type.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-muted text-left',
                      candleType === type.id && 'font-bold text-primary bg-muted/60',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span>{type.icon}</span>
                      <span>{type.label}</span>
                    </span>
                    {candleType === type.id && <Check className="size-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <Button
            size="xs"
            variant={indicators.includes('RSI') ? 'secondary' : 'ghost'}
            aria-pressed={indicators.includes('RSI')}
            onClick={() => toggleIndicator('RSI')}
            className="h-7 text-xs px-2"
          >
            RSI
          </Button>

          {/* Indicator Dialog Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIndicatorOpen(true)}
            className="h-7 text-xs gap-1 border-border/80"
          >
            <Settings2 className="size-3.5" />
            <span>Indikator</span>
            <span className="rounded bg-muted px-1.5 font-mono text-[10px]">
              {configured.length}
            </span>
          </Button>

          {configured.slice(0, 4).map((item) => (
            <Button
              key={item.key}
              size="xs"
              variant={item.visible ? 'secondary' : 'ghost'}
              className="h-7 text-xs"
              onClick={() =>
                setConfigured((current) =>
                  current.map((value) =>
                    value.key === item.key ? { ...value, visible: !value.visible } : value,
                  ),
                )
              }
            >
              {item.name}
            </Button>
          ))}
          {configured.length > 4 && (
            <span className="text-[10px] text-muted-foreground">+{configured.length - 4}</span>
          )}
        </div>

        {/* Right Section: Drawing Tools Manager, Zoom, Settings, Screenshot, Fullscreen */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            title="Zona harga"
            aria-label="Zona harga"
            onClick={() => draw('priceZone', 'Zona harga')}
          >
            <Square className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            title="Hapus gambar manual"
            aria-label="Hapus gambar manual"
            onClick={() => {
              chart.current?.removeOverlay({ groupId: 'manual' })
              setNotice('Gambar manual dihapus.')
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
          <ChartDrawingManager
            chart={chartInstance}
            symbol={market.symbol}
            interval={market.interval}
            onNotice={setNotice}
          />

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          {/* Candle Spacing / Zoom Controls */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Perlebar Jarak Candle (Zoom In)"
              onClick={() => handleBarSpace(2)}
            >
              <ZoomIn className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Persempit Jarak Candle (Zoom Out)"
              onClick={() => handleBarSpace(-2)}
            >
              <ZoomOut className="size-3.5" />
            </Button>
          </div>

          {/* Screenshot Camera */}
          <Button
            variant="ghost"
            size="icon-xs"
            title="Ambil Tangkapan Layar (Screenshot)"
            onClick={handleScreenshot}
          >
            <Camera className="size-3.5" />
          </Button>

          {/* Scroll to real-time reset button */}
          <Button
            variant="ghost"
            size="icon-xs"
            title="Kembali ke candle terbaru"
            aria-label="Kembali ke candle terbaru"
            onClick={() => chart.current?.scrollToRealTime()}
          >
            <RotateCcw className="size-3.5" />
          </Button>

          {/* Settings Button */}
          <div className="relative">
            <Button
              variant={showSettings ? 'secondary' : 'ghost'}
              size="icon-xs"
              title="Kustomisasi Tampilan Chart (Settings)"
              onClick={() => {
                setShowSettings(!showSettings)
                setShowTypeMenu(false)
              }}
            >
              <Settings className="size-3.5" />
            </Button>

            {/* Settings Dialog Popover */}
            {showSettings && (
              <div className="absolute right-0 top-8 z-30 w-72 rounded-md border border-border bg-[#0d131f] p-3 shadow-2xl space-y-3">
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Sliders className="size-3.5 text-primary" />
                    <span>Pengaturan Chart Canvas</span>
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => setShowSettings(false)}
                    className="h-5 w-5"
                  >
                    <X className="size-3" />
                  </Button>
                </div>

                {/* Color Palettes */}
                <div className="space-y-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                    <Palette className="size-3 text-primary" />
                    Tema Warna Lilin (Candle):
                  </span>
                  <div className="space-y-1 text-xs">
                    {(Object.keys(colorThemes) as CandleTheme[]).map((thm) => {
                      const t = colorThemes[thm]
                      const active = candleTheme === thm
                      return (
                        <button
                          key={thm}
                          type="button"
                          onClick={() => handleThemeChange(thm)}
                          className={cn(
                            'flex w-full items-center justify-between rounded p-1.5 hover:bg-muted text-left transition-colors',
                            active && 'bg-muted/60 font-semibold',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <span className="size-3 rounded-xs" style={{ backgroundColor: t.up }} />
                              <span className="size-3 rounded-xs" style={{ backgroundColor: t.down }} />
                            </div>
                            <span className="text-[11px]">{t.name}</span>
                          </div>
                          {active && <Check className="size-3 text-primary" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Grid Lines Toggle */}
                <div className="space-y-1.5 border-t border-border/60 pt-2">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    Garis Kisi (Grid):
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showHGrid
                        setShowHGrid(next)
                        if (chart.current)
                          applyStyles(chart.current, candleType, candleTheme, next, showVGrid, showPriceLine)
                      }}
                      className={cn(
                        'rounded border border-border p-1.5 text-center text-[11px] hover:bg-muted',
                        showHGrid && 'border-primary/50 text-primary font-semibold bg-primary/10',
                      )}
                    >
                      Horizontal: {showHGrid ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showVGrid
                        setShowVGrid(next)
                        if (chart.current)
                          applyStyles(chart.current, candleType, candleTheme, showHGrid, next, showPriceLine)
                      }}
                      className={cn(
                        'rounded border border-border p-1.5 text-center text-[11px] hover:bg-muted',
                        showVGrid && 'border-primary/50 text-primary font-semibold bg-primary/10',
                      )}
                    >
                      Vertikal: {showVGrid ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>

                {/* Price Mark Line Toggle */}
                <div className="border-t border-border/60 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showPriceLine
                      setShowPriceLine(next)
                      if (chart.current)
                        applyStyles(chart.current, candleType, candleTheme, showHGrid, showVGrid, next)
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded border border-border p-1.5 text-xs hover:bg-muted',
                      showPriceLine && 'border-primary/50 text-primary font-semibold bg-primary/10',
                    )}
                  >
                    <span>Garis Harga Pasar Terakhir:</span>
                    <span>{showPriceLine ? 'Aktif' : 'Nonaktif'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen Button */}
          <Button
            variant="ghost"
            size="icon-xs"
            title={isFullscreen ? 'Keluar Layar Penuh' : 'Mode Layar Penuh (Fullscreen)'}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </Button>
        </div>
      </div>

      {/* Main KlineChart Canvas Viewport */}
      <div
        ref={host}
        data-testid="market-chart"
        className={cn(
          'w-full transition-all',
          isFullscreen ? 'flex-1 h-full min-h-[85vh]' : 'h-[370px] sm:h-[440px]',
        )}
      />

      {/* TradingView Bottom Status Bar */}
      <div className="flex items-center justify-between border-t border-border/80 bg-[#0d131f] px-3 py-1.5 text-[10px] text-muted-foreground font-mono">
        <div className="flex items-center gap-2">
          <Crosshair className="size-3 shrink-0 text-primary" />
          <span className="truncate max-w-md" aria-live="polite">
            {notice}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span>Bar: {barSpace}px</span>
          <span className="hidden sm:inline">
            Model: {chartTypes.find((t) => t.id === candleType)?.label}
          </span>
          <span className="text-foreground font-semibold">UTC+7</span>
        </div>
      </div>

      {(calculation.isError || calculation.data) && (
        <div
          className={`border-t border-border px-4 py-2 text-[10px] ${
            calculation.isError
              ? 'text-rose-300'
              : calculation.data?.ready
                ? 'text-emerald-300'
                : 'text-amber-200'
          }`}
        >
          {calculation.isError ? calculation.error.message : calculation.data?.note}
        </div>
      )}

      <ChartIndicatorDialog
        open={indicatorOpen}
        onOpenChange={setIndicatorOpen}
        catalog={catalog.data}
        configs={configured}
        onChange={setConfigured}
        favorites={favorites}
        onFavoritesChange={setFavorites}
        onOpenManager={() => {
          setIndicatorOpen(false)
          onOpenIndicatorManager?.()
        }}
      />
    </div>
  )
}
