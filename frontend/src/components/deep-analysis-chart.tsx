import { useMemo, useState } from 'react'
import type { StrategyPlanItem, VisualOverlayData } from '@/types/strategy'

export interface DeepAnalysisChartProps {
  symbol?: string
  interval?: string
  lastPrice?: number
  activePlan?: StrategyPlanItem | null
  visualData?: VisualOverlayData
  marketCandles?: { time: number; open: number; high: number; low: number; close: number }[]
  showZones?: boolean
  showTrade?: boolean
  showPath?: boolean
  showEma?: boolean
  showLabels?: boolean
}

// 23 fallback benchmark candles if none provided
const DEFAULT_CANDLES: [string, number, number, number, number][] = [
  ['7 Sep', 4427.79, 4436.03, 4381.08, 4405.07],
  ['8 Sep', 4406.55, 4443.1, 4346.07, 4355.65],
  ['9 Sep', 4360.4, 4434.18, 4341.44, 4401.55],
  ['10 Sep', 4404.82, 4433.0, 4313.71, 4317.3],
  ['11 Sep', 4319.31, 4402.7, 4295.55, 4348.72],
  ['14 Sep', 4332.7, 4355.65, 4253.3, 4298.8],
  ['15 Sep', 4299.35, 4318.08, 4261.39, 4294.0],
  ['16 Sep', 4294.5, 4368.04, 4235.08, 4263.5],
  ['17 Sep', 4263.97, 4382.63, 4257.55, 4341.3],
  ['18 Sep', 4342.73, 4399.77, 4334.34, 4378.17],
  ['21 Sep', 4383.44, 4387.51, 4322.63, 4343.56],
  ['22 Sep', 4343.57, 4378.25, 4291.42, 4355.48],
  ['23 Sep', 4357.02, 4371.45, 4274.73, 4287.51],
  ['24 Sep', 4287.38, 4304.95, 4244.63, 4278.52],
  ['25 Sep', 4279.12, 4316.81, 4254.45, 4287.25],
  ['28 Sep', 4277.9, 4280.56, 4110.95, 4115.27],
  ['29 Sep', 4113.87, 4185.42, 4113.57, 4182.8],
  ['30 Sep', 4182.8, 4219.46, 4147.47, 4157.34],
  ['1 Okt', 4157.35, 4193.03, 4139.29, 4178.86],
  ['2 Okt', 4175.31, 4225.62, 4125.25, 4142.96],
  ['4 Okt', 4141.79, 4148.39, 4132.83, 4142.7],
  ['5 Okt', 4144.15, 4170.51, 4122.9, 4134.47],
  ['6 Okt', 4134.39, 4152.29, 4103.7, 4131.97],
]

export function DeepAnalysisChart({
  symbol = 'XAUUSD',
  interval = '1D',
  lastPrice,
  activePlan,
  visualData,
  marketCandles,
  showZones = true,
  showTrade = true,
  showPath = true,
  showEma = true,
  showLabels = true,
}: DeepAnalysisChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Parse raw candles from visualData, marketCandles, or default
  const candles: [string, number, number, number, number][] = useMemo(() => {
    if (visualData?.candles_sample && visualData.candles_sample.length >= 5) {
      return visualData.candles_sample.map((c) => [
        String(c[0]),
        Number(c[1]),
        Number(c[2]),
        Number(c[3]),
        Number(c[4]),
      ])
    }
    if (marketCandles && marketCandles.length >= 5) {
      const slice = marketCandles.slice(-25)
      return slice.map((c, i) => {
        let label = `Bar ${i + 1}`
        if (c.time) {
          const dt = new Date(c.time > 100_000_000_000 ? c.time : c.time * 1000)
          if (interval?.toLowerCase() === '1d') {
            label = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
          } else {
            label = dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false })
          }
        }
        return [label, c.open, c.high, c.low, c.close]
      })
    }
    return DEFAULT_CANDLES
  }, [visualData?.candles_sample, marketCandles, interval])

  // Canvas dimensions
  const N = candles.length
  const SW = Math.max(16, Math.min(28, Math.floor(680 / (N || 25))))
  const L = 10
  const TOP = 26
  const H = 470
  const R = L + SW * (N + 9)
  const W = Math.max(980, R + 80)

  // Compute dynamic price bounds
  const { PT, PB, stepPrice } = useMemo(() => {
    let minP = Infinity
    let maxP = -Infinity
    for (const c of candles) {
      if (c[2] > maxP) maxP = c[2]
      if (c[3] < minP) minP = c[3]
    }
    if (activePlan) {
      if (activePlan.stop_loss) {
        maxP = Math.max(maxP, activePlan.stop_loss)
        minP = Math.min(minP, activePlan.stop_loss)
      }
      if (activePlan.entry) {
        maxP = Math.max(maxP, activePlan.entry)
        minP = Math.min(minP, activePlan.entry)
      }
      if (activePlan.take_profit_3) {
        maxP = Math.max(maxP, activePlan.take_profit_3)
        minP = Math.min(minP, activePlan.take_profit_3)
      }
    }
    if (visualData?.zones) {
      for (const z of visualData.zones) {
        maxP = Math.max(maxP, z.high)
        minP = Math.min(minP, z.low)
      }
    }

    const range = maxP - minP || 100
    const pad = range * 0.08
    const topP = maxP + pad
    const botP = minP - pad
    let step = 1
    if (range > 2000) step = 250
    else if (range > 800) step = 100
    else if (range > 300) step = 50
    else if (range > 100) step = 25
    else if (range > 40) step = 10
    else if (range > 10) step = 2
    else if (range > 2) step = 0.5
    else if (range > 0.5) step = 0.1
    else if (range > 0.05) step = 0.01
    else step = 0.001

    return { PT: topP, PB: botP, stepPrice: step }
  }, [candles, activePlan, visualData])

  const y = (p: number) => TOP + ((PT - p) / (PT - PB || 1)) * H
  const x = (i: number) => L + i * SW + SW / 2

  // EMA 10 curve
  const emaPoints = useMemo(() => {
    if (!candles.length) return ''
    let e = candles[0][4]
    const pts: string[] = []
    candles.forEach((d, i) => {
      e = i ? d[4] * (2 / 11) + e * (1 - 2 / 11) : d[4]
      pts.push(`${x(i)},${y(e)}`)
    })
    return pts.join(' ')
  }, [candles])

  // Price grid levels
  const gridPrices = useMemo(() => {
    const list: number[] = []
    for (let p = Math.ceil(PB / stepPrice) * stepPrice; p <= PT; p += stepPrice) {
      list.push(p)
    }
    return list
  }, [PB, PT, stepPrice])

  // Effective last price
  const effectiveLp = lastPrice ?? candles[N - 1]?.[4] ?? 4132

  // Trade Box geometry
  const X0 = x(N + 1)
  const BW = SW * 6

  // Current hovered candle details
  const hoveredCandle = hoveredIndex !== null ? candles[hoveredIndex] : null

  return (
    <div className="relative w-full overflow-x-auto rounded-lg border border-[#2a2e39] bg-[#131722] p-2 shadow-2xl selection:bg-none">
      {/* Tooltip Float */}
      {hoveredCandle && (
        <div className="absolute top-4 right-4 z-20 flex items-center gap-3 rounded border border-border/70 bg-[#1e2330]/90 px-3 py-1.5 text-xs backdrop-blur">
          <span className="font-semibold text-foreground">{hoveredCandle[0]}</span>
          <span className="text-muted-foreground">O: <b className="font-mono text-foreground">{hoveredCandle[1].toFixed(2)}</b></span>
          <span className="text-muted-foreground">H: <b className="font-mono text-emerald-400">{hoveredCandle[2].toFixed(2)}</b></span>
          <span className="text-muted-foreground">L: <b className="font-mono text-rose-400">{hoveredCandle[3].toFixed(2)}</b></span>
          <span className="text-muted-foreground">C: <b className="font-mono text-foreground">{hoveredCandle[4].toFixed(2)}</b></span>
        </div>
      )}

      <svg
        id="c"
        viewBox={`0 0 ${W} 540`}
        className="block h-auto w-full min-w-[900px] select-none font-sans"
        role="img"
        aria-label={`Chart ${symbol} ${interval}`}
      >
        {/* Background */}
        <rect width={W} height="540" fill="#131722" />

        {/* Title Header */}
        <text x={L + 6} y="16" fill="#b2b5be" fontSize="12" fontWeight="600">
          {symbol.toUpperCase()} · {interval.toUpperCase()} · Analisis Komprehensif Skenario
        </text>

        {/* Horizontal Grid & Price Axis */}
        {gridPrices.map((p) => {
          const yPos = y(p)
          return (
            <g key={p}>
              <line
                x1={L}
                x2={R}
                y1={yPos}
                y2={yPos}
                stroke="#2a2e39"
                strokeWidth="1"
              />
              <text
                x={R + 6}
                y={yPos + 4}
                fill="#787b86"
                fontSize="11"
                fontFamily="monospace"
              >
                {p < 10 ? p.toFixed(4) : p < 100 ? p.toFixed(2) : p.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
              </text>
            </g>
          )
        })}

        {/* X Axis Time Labels */}
        {candles.map((d, i) => {
          if (i % 3 !== 0) return null
          return (
            <text
              key={i}
              x={x(i)}
              y={TOP + H + 18}
              fill="#787b86"
              fontSize="11"
              textAnchor="middle"
            >
              {d[0]}
            </text>
          )
        })}

        {/* 1. ZONES & HORIZONTAL S/R LEVELS */}
        {showZones && (
          <g id="zones">
            {/* Shaded S/R Zones */}
            {visualData?.zones ? (
              visualData.zones.map((z, idx) => {
                const sIdx = z.start_idx ?? (idx === 0 ? 7 : 15)
                const yHigh = y(z.high)
                const yLow = y(z.low)
                const rectY = Math.min(yHigh, yLow)
                const rectH = Math.abs(yHigh - yLow)
                return (
                  <g key={`zone-${idx}`}>
                    <rect
                      x={x(sIdx)}
                      y={rectY}
                      width={R - x(sIdx)}
                      height={Math.max(4, rectH)}
                      fill={z.color}
                      opacity={z.opacity ?? 0.18}
                    />
                    <line
                      x1={x(sIdx)}
                      x2={R}
                      y1={y(z.low)}
                      y2={y(z.low)}
                      stroke={z.color}
                      strokeDasharray="6 4"
                      strokeWidth="1.5"
                    />
                    <text
                      x={x(0) + 4}
                      y={rectY + rectH / 2 + 4}
                      fill={z.color}
                      fontSize="11"
                      fontWeight="500"
                    >
                      {z.label}
                    </text>
                  </g>
                )
              })
            ) : (
              <>
                {/* Default Fallback Zones for XAUUSD */}
                <rect
                  x={x(7)}
                  y={y(4265)}
                  width={R - x(7)}
                  height={y(4230) - y(4265)}
                  fill="#ef5350"
                  opacity={0.18}
                />
                <line
                  x1={x(7)}
                  x2={R}
                  y1={y(4230)}
                  y2={y(4230)}
                  stroke="#ef5350"
                  strokeDasharray="6 4"
                  strokeWidth="1.5"
                />
                <text
                  x={x(0) + 4}
                  y={y(4248) + 4}
                  fill="#ef5350"
                  fontSize="11"
                >
                  Resistance / neckline H&S 4.230–4.265
                </text>

                <rect
                  x={x(15)}
                  y={y(4111)}
                  width={R - x(15)}
                  height={y(4098) - y(4111)}
                  fill="#26a69a"
                  opacity={0.2}
                />
                <text
                  x={x(0) + 4}
                  y={y(4105) + 4}
                  fill="#26a69a"
                  fontSize="11"
                >
                  Support 4.098–4.111
                </text>
              </>
            )}

            {/* Horizontal Line Levels */}
            {(visualData?.horizontal_levels || [
              { price: 4315, label: 'R 4.315 (high 25 Sep)', color: '#ef5350' },
              { price: 4440, label: 'R 4.440 (high 8 Sep)', color: '#ef5350' },
              { price: 4000, label: 'S 4.000 (psikologis)', color: '#26a69a' },
              { price: 3950, label: 'S 3.950 (low tahun ini)', color: '#26a69a' },
            ]).map((lvl, i) => (
              <g key={`hlvl-${i}`}>
                <line
                  x1={x(0)}
                  x2={R}
                  y1={y(lvl.price)}
                  y2={y(lvl.price)}
                  stroke={lvl.color}
                  strokeWidth="1"
                  strokeDasharray="2 4"
                  opacity="0.8"
                />
                <text
                  x={x(0) + 4}
                  y={y(lvl.price) - 4}
                  fill={lvl.color}
                  fontSize="11"
                >
                  {lvl.label}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* 2. CANDLESTICKS */}
        {candles.map((d, i) => {
          const isUp = d[4] >= d[1]
          const color = isUp ? '#26a69a' : '#ef5350'
          const top = y(Math.max(d[1], d[4]))
          const bh = Math.max(1.5, Math.abs(y(d[1]) - y(d[4])))
          const isHovered = hoveredIndex === i

          return (
            <g
              key={i}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer transition-opacity"
            >
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(d[2])}
                y2={y(d[3])}
                stroke={color}
                strokeWidth={isHovered ? 2.5 : 1.5}
              />
              <rect
                x={x(i) - 7}
                y={top}
                width="14"
                height={bh}
                fill={color}
                stroke={isHovered ? '#ffffff' : 'none'}
                strokeWidth={isHovered ? 1 : 0}
              />
            </g>
          )
        })}

        {/* 3. EMA 10 LINE */}
        {showEma && emaPoints && (
          <g id="ema">
            <polyline
              points={emaPoints}
              fill="none"
              stroke="#f5a623"
              strokeWidth="1.6"
            />
            <text
              x={x(N - 1) + 6}
              y={y(candles[N - 1]?.[4] ?? 4132) + 16}
              fill="#f5a623"
              fontSize="11"
              fontWeight="600"
            >
              EMA10
            </text>
          </g>
        )}

        {/* 4. CANDLE PATTERN LABELS */}
        {showLabels && (
          <g id="pat">
            {(visualData?.pattern_labels || [
              { x_idx: 8, y: 4375, text: 'Lower highs →', color: '#d1d4dc' },
              { x_idx: 15, y: 4144, text: '28 Sep: −4% breakdown', color: '#ef5350' },
              { x_idx: 19, y: 4218, text: 'Penolakan 4.226', color: '#ef5350' },
              { x_idx: 21, y: 4138, text: 'Doji di support', color: '#d1d4dc' },
            ]).map((pat, idx) => (
              <text
                key={`pat-${idx}`}
                x={x(pat.x_idx)}
                y={y(pat.y)}
                fill={pat.color}
                fontSize="11"
                textAnchor="middle"
                fontWeight="500"
              >
                {pat.text}
              </text>
            ))}
          </g>
        )}

        {/* 5. ACTIVE TRADE BOX (SL & TP ZONES) */}
        {showTrade && activePlan && (
          <g id="trade">
            {activePlan.direction === 'SELL' ? (
              <>
                {/* SL Risk Red Area */}
                <rect
                  x={X0}
                  y={y(activePlan.stop_loss)}
                  width={BW}
                  height={Math.max(4, y(activePlan.entry) - y(activePlan.stop_loss))}
                  fill="#ef5350"
                  opacity="0.35"
                />
                {/* TP Reward Green Area */}
                <rect
                  x={X0}
                  y={y(activePlan.entry)}
                  width={BW}
                  height={Math.max(4, y(activePlan.take_profit_3 || activePlan.take_profit_2 || activePlan.take_profit_1) - y(activePlan.entry))}
                  fill="#26a69a"
                  opacity="0.22"
                />
              </>
            ) : (
              <>
                {/* Buy: SL Area below entry */}
                <rect
                  x={X0}
                  y={y(activePlan.entry)}
                  width={BW}
                  height={Math.max(4, y(activePlan.stop_loss) - y(activePlan.entry))}
                  fill="#ef5350"
                  opacity="0.35"
                />
                {/* Buy: TP Area above entry */}
                <rect
                  x={X0}
                  y={y(activePlan.take_profit_3 || activePlan.take_profit_2 || activePlan.take_profit_1)}
                  width={BW}
                  height={Math.max(4, y(activePlan.entry) - y(activePlan.take_profit_3 || activePlan.take_profit_2 || activePlan.take_profit_1))}
                  fill="#26a69a"
                  opacity="0.22"
                />
              </>
            )}

            {/* Level lines & labels */}
            {[
              { val: activePlan.stop_loss, label: `SL ${activePlan.stop_loss.toLocaleString('id-ID')}`, color: '#ef5350' },
              { val: activePlan.entry, label: `Entry ${activePlan.entry.toLocaleString('id-ID')}`, color: '#d1d4dc' },
              { val: activePlan.take_profit_1, label: `TP1 ${activePlan.take_profit_1.toLocaleString('id-ID')}`, color: '#26a69a' },
              activePlan.take_profit_2 ? { val: activePlan.take_profit_2, label: `TP2 ${activePlan.take_profit_2.toLocaleString('id-ID')}`, color: '#26a69a' } : null,
              activePlan.take_profit_3 ? { val: activePlan.take_profit_3, label: `TP3 ${activePlan.take_profit_3.toLocaleString('id-ID')}`, color: '#26a69a' } : null,
            ]
              .filter(Boolean)
              .map((item, idx) => {
                if (!item) return null
                const yLvl = y(item.val)
                return (
                  <g key={`trade-line-${idx}`}>
                    <line
                      x1={X0}
                      x2={X0 + BW}
                      y1={yLvl}
                      y2={yLvl}
                      stroke={item.color}
                      strokeWidth="1.5"
                    />
                    <text
                      x={X0 + 6}
                      y={yLvl - 4}
                      fill={item.color}
                      fontSize="11"
                      fontWeight="600"
                    >
                      {item.label}
                    </text>
                  </g>
                )
              })}
          </g>
        )}

        {/* 6. SCENARIO PRICE PATH */}
        {showPath && activePlan?.price_path && activePlan.price_path.length > 1 && (
          <g id="path">
            <polyline
              points={activePlan.price_path.map(([idx, val]) => `${x(idx)},${y(val)}`).join(' ')}
              fill="none"
              stroke="#d1d4dc"
              strokeWidth="1.6"
              strokeDasharray="5 4"
            />
            {activePlan.path_labels?.map((pl, idx) => {
              const xPos = x(pl.x_idx ?? pl.step ?? 23)
              const yPos = y(pl.y ?? 4200)
              return (
                <text
                  key={`path-lbl-${idx}`}
                  x={xPos}
                  y={yPos - 12}
                  fill="#d1d4dc"
                  fontSize="11"
                  textAnchor="middle"
                  fontWeight="600"
                >
                  {pl.text}
                </text>
              )
            })}
          </g>
        )}

        {/* 7. LAST PRICE RUNNER LINE */}
        <line
          x1={L}
          x2={R}
          y1={y(effectiveLp)}
          y2={y(effectiveLp)}
          stroke="#2962ff"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <rect
          x={R + 2}
          y={y(effectiveLp) - 9}
          width="68"
          height="18"
          fill="#2962ff"
          rx="3"
        />
        <text
          x={R + 8}
          y={y(effectiveLp) + 4}
          fill="#ffffff"
          fontSize="11"
          fontWeight="600"
          fontFamily="monospace"
        >
          {effectiveLp.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </text>
      </svg>
    </div>
  )
}
