import { useEffect, useRef, useState } from 'react'
import {
  init,
  dispose,
  registerOverlay,
  type Chart,
  type KLineData,
  type Period,
} from 'klinecharts'
import {
  Crosshair,
  Minus,
  MoveUpRight,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Market, Signal } from '@/lib/api'

const periods: Record<string, Period> = {
  '1m': { type: 'minute', span: 1 },
  '5m': { type: 'minute', span: 5 },
  '15m': { type: 'minute', span: 15 },
  '1h': { type: 'hour', span: 1 },
  '4h': { type: 'hour', span: 4 },
  '1d': { type: 'day', span: 1 },
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

export function MarketChart({
  market,
  signal,
  overlays,
}: {
  market: Market
  signal: Signal | null
  overlays?: ChartOverlayItem[]
}) {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<Chart | null>(null)
  const latest = useRef(market)
  const subscriber = useRef<((bar: KLineData) => void) | null>(null)
  const lastTime = useRef(0)
  const [indicators, setIndicators] = useState<string[]>(['VOL'])
  const [notice, setNotice] = useState(
    'Scroll untuk zoom · geser untuk melihat histori',
  )
  latest.current = market

  useEffect(() => {
    if (!host.current) return
    const instance = init(host.current, {
      timezone: 'Asia/Jakarta',
      locale: 'en-US',
      styles: 'dark',
    })
    if (!instance) return
    chart.current = instance
    instance.setStyles({
      grid: {
        horizontal: { color: '#1d2733' },
        vertical: { color: '#18212c' },
      },
      candle: {
        bar: {
          upColor: '#39c9a4',
          downColor: '#f07b86',
          upBorderColor: '#39c9a4',
          downBorderColor: '#f07b86',
          upWickColor: '#39c9a4',
          downWickColor: '#f07b86',
        },
      },
      xAxis: { tickText: { color: '#8491a3', size: 10 } },
      yAxis: { tickText: { color: '#8491a3', size: 10 } },
    })
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
    instance.setPeriod(periods[latest.current.interval])
    instance.setBarSpace(7)
    instance.createIndicator('VOL')
    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(host.current)
    return () => {
      observer.disconnect()
      subscriber.current = null
      dispose(instance)
      chart.current = null
    }
  }, [])

  useEffect(() => {
    for (const candle of market.candles) {
      if (candle.time >= lastTime.current)
        subscriber.current?.({ ...candle, timestamp: candle.time })
    }
    lastTime.current = market.candles.at(-1)?.time ?? 0
  }, [market])

  useEffect(() => {
    const instance = chart.current
    if (!instance) return
    instance.removeOverlay({ groupId: 'signal' })
    if (signal) {
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


  function toggleIndicator(name: string) {
    const enabled = indicators.includes(name)
    if (enabled) chart.current?.removeIndicator({ name })
    else
      chart.current?.createIndicator(
        ['MA', 'EMA', 'BOLL'].includes(name)
          ? { name, paneId: 'candle_pane' }
          : name,
        true,
      )
    setIndicators((current) =>
      enabled ? current.filter((item) => item !== name) : [...current, name],
    )
  }

  function draw(name: string, label: string) {
    chart.current?.createOverlay({ name, groupId: 'manual' })
    setNotice(
      `${label}: klik pada chart untuk menentukan titik. Gambar manual, bukan sinyal AI.`,
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-y border-border px-3 py-2">
        <span className="mr-2 text-[10px] font-semibold tracking-widest text-muted-foreground">
          INDIKATOR
        </span>
        {['MA', 'EMA', 'BOLL', 'VOL', 'RSI', 'MACD'].map((name) => (
          <Button
            key={name}
            size="xs"
            variant={indicators.includes(name) ? 'secondary' : 'ghost'}
            aria-pressed={indicators.includes(name)}
            onClick={() => toggleIndicator(name)}
          >
            {name}
          </Button>
        ))}
        <span className="mx-2 h-4 border-l border-border" />
        <Button
          variant="ghost"
          size="icon-xs"
          title="Garis horizontal"
          aria-label="Garis horizontal"
          onClick={() => draw('horizontalStraightLine', 'Garis horizontal')}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Garis tren"
          aria-label="Garis tren"
          onClick={() => draw('segment', 'Garis tren')}
        >
          <MoveUpRight />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Zona harga"
          aria-label="Zona harga"
          onClick={() => draw('priceZone', 'Zona harga')}
        >
          <Square />
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
          <Trash2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          title="Kembali ke candle terbaru"
          aria-label="Kembali ke candle terbaru"
          onClick={() => chart.current?.scrollToRealTime()}
        >
          <RotateCcw />
        </Button>
      </div>
      <div
        ref={host}
        data-testid="market-chart"
        className="h-[370px] w-full sm:h-[440px]"
      />
      <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
        <Crosshair className="size-3 shrink-0" />
        <span aria-live="polite">{notice}</span>
        <span className="ml-auto shrink-0">UTC+7</span>
      </div>
    </div>
  )
}
