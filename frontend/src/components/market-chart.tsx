import { useEffect, useRef, useState, useMemo } from 'react'
import {
  init,
  dispose,
  registerOverlay,
  type Chart,
  type KLineData,
  type Period,
  type CandleType,
} from 'klinecharts'
import {
  ArrowRight,
  Brush,
  Camera,
  Check,
  ChevronDown,
  Crosshair,
  Maximize2,
  Minimize2,
  Minus,
  MoveUpRight,
  Orbit,
  Palette,
  RotateCcw,
  Rows3,
  Settings,
  Sliders,
  SplitSquareVertical,
  Square,
  Trash2,
  TrendingUp,
  Type,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { number, type ChartOverlayItem, type Market, type Signal } from '@/lib/api'
import { cn } from '@/lib/utils'

const periods: Record<string, Period> = {
  '1m': { type: 'minute', span: 1 },
  '5m': { type: 'minute', span: 5 },
  '15m': { type: 'minute', span: 15 },
  '1h': { type: 'hour', span: 1 },
  '4h': { type: 'hour', span: 4 },
  '1d': { type: 'day', span: 1 },
}

// Register Custom Price Zone Overlay
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

const availableIndicators = [
  { name: 'MA', label: 'Moving Average', isOverlay: true },
  { name: 'EMA', label: 'Exponential MA', isOverlay: true },
  { name: 'BOLL', label: 'Bollinger Bands', isOverlay: true },
  { name: 'SAR', label: 'Parabolic SAR', isOverlay: true },
  { name: 'VOL', label: 'Volume', isOverlay: false },
  { name: 'MACD', label: 'MACD Oscillator', isOverlay: false },
  { name: 'RSI', label: 'RSI Indicator', isOverlay: false },
  { name: 'KDJ', label: 'KDJ Oscillator', isOverlay: false },
  { name: 'WR', label: 'Williams %R', isOverlay: false },
  { name: 'CCI', label: 'Commodity Channel Index', isOverlay: false },
]

export function MarketChart({
  market,
  signal,
  overlays,
  currentInterval,
  onIntervalChange,
}: {
  market: Market
  signal: Signal | null
  overlays?: ChartOverlayItem[]
  currentInterval?: string
  onIntervalChange?: (interval: string) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chart = useRef<Chart | null>(null)
  const latest = useRef(market)
  const subscriber = useRef<((bar: KLineData) => void) | null>(null)
  const lastTime = useRef(0)

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
  const [showIndicatorMenu, setShowIndicatorMenu] = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [activeDrawing, setActiveDrawing] = useState<string | null>(null)

  const [indicators, setIndicators] = useState<string[]>(['VOL', 'EMA'])
  const [notice, setNotice] = useState('Scroll untuk zoom · geser untuk melihat histori')

  latest.current = market
  const currentTheme = colorThemes[candleTheme]

  // Apply chart styles helper
  const applyStyles = (
    c: Chart,
    type: CandleType = candleType,
    theme: CandleTheme = candleTheme,
    hGrid = showHGrid,
    vGrid = showVGrid,
    priceLine = showPriceLine
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
    instance.createIndicator({ name: 'EMA', paneId: 'candle_pane' }, false)

    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(host.current)

    return () => {
      observer.disconnect()
      subscriber.current = null
      dispose(instance)
      chart.current = null
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
        `Highlight sinyal #${signal.id} (${signal.symbol}): Entry ${number(signal.entry, 5)}, SL ${number(signal.stop_loss, 5)}.`
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

  // Toggle Indicator
  function toggleIndicator(name: string, isOverlay: boolean) {
    const enabled = indicators.includes(name)
    if (enabled) {
      chart.current?.removeIndicator({ name })
      setIndicators((curr) => curr.filter((i) => i !== name))
    } else {
      if (isOverlay) {
        chart.current?.createIndicator({ name, paneId: 'candle_pane' }, false)
      } else {
        chart.current?.createIndicator(name, false)
      }
      setIndicators((curr) => [...curr, name])
    }
  }

  // Draw Overlay Tool
  function draw(name: string, label: string) {
    setActiveDrawing(name)
    chart.current?.createOverlay({ name, groupId: 'manual' })
    setNotice(`Mode Gambar: ${label}. Klik pada canvas chart untuk meletakkan titik.`)
  }

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

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex flex-col bg-[#0a0f18] text-foreground select-none transition-all',
        isFullscreen ? 'fixed inset-0 z-50 h-screen w-screen p-4' : 'w-full'
      )}
    >
      {/* TradingView Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border/80 bg-[#0d131f] px-3 py-2 text-xs">
        {/* Left Section: Symbol, Timeframes, Candle Type, Indicators */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-xs font-bold border-primary/40 text-primary px-2 h-7 gap-1.5">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
            {market.symbol}
          </Badge>

          {/* Timeframe Selector Pills */}
          {onIntervalChange && (
            <div className="flex items-center gap-0.5 bg-muted/30 p-0.5 rounded-md border border-border/60">
              {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
                <Button
                  key={tf}
                  size="xs"
                  variant={currentInterval === tf ? 'secondary' : 'ghost'}
                  onClick={() => onIntervalChange(tf)}
                  className={cn(
                    'h-6 px-1.5 text-[11px] font-mono',
                    currentInterval === tf && 'font-bold bg-muted shadow-xs'
                  )}
                >
                  {tf.toUpperCase()}
                </Button>
              ))}
            </div>
          )}

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          {/* Candle Type Dropdown */}
          <div className="relative">
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                setShowTypeMenu(!showTypeMenu)
                setShowIndicatorMenu(false)
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
                      candleType === type.id && 'font-bold text-primary bg-muted/60'
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

          {/* Indicator Menu Dropdown */}
          <div className="relative">
            <Button
              size="xs"
              variant={indicators.length > 0 ? 'secondary' : 'outline'}
              onClick={() => {
                setShowIndicatorMenu(!showIndicatorMenu)
                setShowTypeMenu(false)
                setShowSettings(false)
              }}
              className="h-7 text-xs gap-1.5 border-border/80"
            >
              <TrendingUp className="size-3.5 text-primary" />
              <span>Indikator ({indicators.length})</span>
              <ChevronDown className="size-3 text-muted-foreground" />
            </Button>

            {showIndicatorMenu && (
              <div className="absolute left-0 top-8 z-30 w-64 rounded-md border border-border bg-[#0d131f] p-2.5 shadow-xl space-y-2">
                <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                  <span className="text-xs font-bold">Koleksi Indikator</span>
                  <span className="text-[10px] text-muted-foreground">TradingView Style</span>
                </div>
                <div className="space-y-1 max-h-56 overflow-y-auto pr-1 text-xs">
                  {availableIndicators.map((ind) => {
                    const active = indicators.includes(ind.name)
                    return (
                      <button
                        key={ind.name}
                        type="button"
                        onClick={() => toggleIndicator(ind.name, ind.isOverlay)}
                        className={cn(
                          'flex w-full items-center justify-between rounded p-1.5 hover:bg-muted text-left',
                          active && 'bg-muted/60 font-semibold text-primary'
                        )}
                      >
                        <div>
                          <span className="font-mono font-bold mr-2">{ind.name}</span>
                          <span className="text-[10px] text-muted-foreground">{ind.label}</span>
                        </div>
                        {active && <Check className="size-3 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Section: Drawing Tools, Zoom, Settings, Screenshot, Fullscreen */}
        <div className="flex items-center gap-1">
          {/* Drawing Tools Quick Bar */}
          <div className="flex items-center gap-0.5 bg-muted/30 p-0.5 rounded-md border border-border/60">
            <Button
              variant={activeDrawing === 'segment' ? 'secondary' : 'ghost'}
              size="icon-xs"
              title="Garis Tren (Trendline)"
              onClick={() => draw('segment', 'Garis Tren')}
            >
              <MoveUpRight className="size-3.5" />
            </Button>
            <Button
              variant={activeDrawing === 'horizontalStraightLine' ? 'secondary' : 'ghost'}
              size="icon-xs"
              title="Garis Horizontal"
              onClick={() => draw('horizontalStraightLine', 'Garis Horizontal')}
            >
              <Minus className="size-3.5" />
            </Button>
            <Button
              variant={activeDrawing === 'horizontalRayLine' ? 'secondary' : 'ghost'}
              size="icon-xs"
              title="Sinar Horizontal (Ray)"
              onClick={() => draw('horizontalRayLine', 'Sinar Horizontal')}
            >
              <ArrowRight className="size-3.5" />
            </Button>
            <Button
              variant={activeDrawing === 'fibonacciLine' ? 'secondary' : 'ghost'}
              size="icon-xs"
              title="Fibonacci Retracement"
              onClick={() => draw('fibonacciLine', 'Fibonacci')}
            >
              <Orbit className="size-3.5 text-amber-400" />
            </Button>
            <Button
              variant={activeDrawing === 'priceZone' ? 'secondary' : 'ghost'}
              size="icon-xs"
              title="Zona Harga / Kotak (Rectangle)"
              onClick={() => draw('priceZone', 'Zona Harga')}
            >
              <Square className="size-3.5 text-emerald-400" />
            </Button>
            <Button
              variant={activeDrawing === 'parallelStraightLine' ? 'secondary' : 'ghost'}
              size="icon-xs"
              title="Kanal Tren Paralel"
              onClick={() => draw('parallelStraightLine', 'Kanal Paralel')}
            >
              <Rows3 className="size-3.5 text-sky-400" />
            </Button>
            <Button
              variant={activeDrawing === 'brush' ? 'secondary' : 'ghost'}
              size="icon-xs"
              title="Kuas Gambar Bebas (Brush)"
              onClick={() => draw('brush', 'Kuas Bebas')}
            >
              <Brush className="size-3.5" />
            </Button>
            <Button
              variant={activeDrawing === 'simpleAnnotation' ? 'secondary' : 'ghost'}
              size="icon-xs"
              title="Teks Catatan (Annotation)"
              onClick={() => draw('simpleAnnotation', 'Catatan Teks')}
            >
              <Type className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Hapus Semua Gambar Manual"
              onClick={() => {
                chart.current?.removeOverlay({ groupId: 'manual' })
                setActiveDrawing(null)
                setNotice('Gambar manual dibersihkan.')
              }}
              className="text-rose-400 hover:text-rose-300"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>

          <div className="h-4 w-px bg-border/60 mx-1 hidden sm:block" />

          {/* Candle Spacing / Zoom Controls */}
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              title="Perkecil Candle / Zoom Out"
              onClick={() => handleBarSpace(-1)}
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Perbesar Candle / Zoom In"
              onClick={() => handleBarSpace(1)}
            >
              <ZoomIn className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Reset ke Candle Terbaru"
              onClick={() => chart.current?.scrollToRealTime()}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>

          <div className="h-4 w-px bg-border/60 mx-1" />

          {/* Screenshot / Camera */}
          <Button
            variant="ghost"
            size="icon-xs"
            title="Ambil Foto Chart (Camera)"
            onClick={handleScreenshot}
          >
            <Camera className="size-3.5 text-muted-foreground hover:text-foreground" />
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
                setShowIndicatorMenu(false)
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
                            active && 'bg-muted/60 font-semibold'
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
                        showHGrid && 'border-primary/50 text-primary font-semibold bg-primary/10'
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
                        showVGrid && 'border-primary/50 text-primary font-semibold bg-primary/10'
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
                      showPriceLine && 'border-primary/50 text-primary font-semibold bg-primary/10'
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
          isFullscreen ? 'flex-1 h-full min-h-[85vh]' : 'h-[420px] sm:h-[480px]'
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
          <span className="hidden sm:inline">Model: {chartTypes.find((t) => t.id === candleType)?.label}</span>
          <span className="text-foreground font-semibold">UTC+7</span>
        </div>
      </div>
    </div>
  )
}
