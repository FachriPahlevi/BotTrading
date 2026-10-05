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
} from 'klinecharts'
import {
  Crosshair,
  Settings2,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { number, type ChartOverlayItem, type Market, type Signal } from '@/lib/api'
import {ChartIndicatorDialog} from '@/components/chart-indicator-dialog'
import {ChartDrawingManager} from '@/components/chart-drawing-manager'
import {request,type Catalog,type ChartIndicatorConfig,type IndicatorCalculation} from '@/components/lab/api'





const periods: Record<string, Period> = {
  '1m': { type: 'minute', span: 1 },
  '5m': { type: 'minute', span: 5 },
  '15m': { type: 'minute', span: 15 },
  '1h': { type: 'hour', span: 1 },
  '4h': { type: 'hour', span: 4 },
  '1d': { type: 'day', span: 1 },
}

registerIndicator<Record<string,number>,unknown,Record<number,Record<string,number>>>({
  name:'AURUM_CONFIGURED',shortName:'Aurum',figures:[],
  calc:(bars,indicator)=>bars.map(bar=>indicator.extendData?.[bar.timestamp]??{}),
})

function storedList<T>(key:string):T[] {
  try { const value=JSON.parse(localStorage.getItem(key)??'[]');return Array.isArray(value)?value:[] } catch { return [] }
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
    const [start,end]=coordinates
    const data=overlay.extendData
    return [
      {type:'line',attrs:{coordinates:[start,end]},styles:{color:data.color,size:2,style:data.dashed?'dashed':'solid'}},
      ...(data.label?[{type:'text',attrs:{x:end.x+7,y:end.y,text:data.label,align:'left',baseline:'middle'},styles:{color:'#f8fafc',backgroundColor:data.color,borderColor:data.color,borderSize:1,padding:[4,7]}}]:[]),
    ]
  },
})

registerOverlay<BosVisualData>({
  name: 'bosZone',
  totalStep: 3,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({coordinates,overlay})=>{
    if(coordinates.length<2)return []
    const [a,b]=coordinates,data=overlay.extendData
    return [{type:'rect',attrs:{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)},styles:{style:'fill',color:data.color}}]
  },
})

export function MarketChart({
  market,
  signal,
  overlays,
  onOpenIndicatorManager,
}: {
  market: Market
  signal: Signal | null
  overlays?: ChartOverlayItem[]
  onOpenIndicatorManager: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const chart = useRef<Chart | null>(null)
  const [chartInstance,setChartInstance]=useState<Chart|null>(null)
  const latest = useRef(market)
  const subscriber = useRef<((bar: KLineData) => void) | null>(null)
  const lastTime = useRef(0)
  const [indicatorOpen,setIndicatorOpen]=useState(false)
  const [configured,setConfigured]=useState<ChartIndicatorConfig[]>(()=>storedList('aurum.chart.indicators'))
  const [favorites,setFavorites]=useState<string[]>(()=>storedList('aurum.indicator.favorites'))
  const customIds=useRef<string[]>([])
  const bosGroups=useRef<string[]>([])
  const [notice, setNotice] = useState(
    'Scroll untuk zoom · geser untuk melihat histori',
  )
  latest.current = market
  const visible=useMemo(()=>configured.filter(item=>item.visible),[configured])
  const catalog=useQuery({queryKey:['lab-catalog'],queryFn:()=>request<Catalog>('/catalog'),staleTime:15000})
  const calculation=useQuery({
    queryKey:['chart-indicators',market.symbol,market.interval,market.candles.at(-1)?.time,visible],
    queryFn:()=>request<IndicatorCalculation>('/indicators/calculate','POST',{symbol:market.symbol,interval:market.interval,candles:market.candles.map(({time,open,high,low,close,volume})=>({time,open,high,low,close,volume})),indicators:visible.map(({alias,version_id,params})=>({alias,version_id,params}))}),
    enabled:visible.length>0,
    retry:false,
  })

  useEffect(()=>{localStorage.setItem('aurum.chart.indicators',JSON.stringify(configured))},[configured])
  useEffect(()=>{localStorage.setItem('aurum.indicator.favorites',JSON.stringify(favorites))},[favorites])

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
      setChartInstance(null)
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

  useEffect(()=>{
    const instance=chart.current
    if(!instance)return
    for(const id of customIds.current)instance.removeIndicator({id})
    for(const groupId of bosGroups.current)instance.removeOverlay({groupId})
    customIds.current=[]
    bosGroups.current=[]
    if(!calculation.data)return
    let hasBos=false
    for(const item of calculation.data.instances){
      const config=visible.find(value=>value.alias===item.alias)
      if(!config)continue
      const allKeys=Object.keys(calculation.data.lines).filter(key=>key.startsWith(item.alias+'.'))
      const keys=item.kind==='boswaves_core'
        ? ['edge_glow','edge','mid','alma'].map(key=>`${item.alias}.${key}`).filter(key=>allKeys.includes(key))
        : allKeys.filter(key=>!/\.(trend|risk|bull_flip|bear_flip|conviction)$/.test(key))
      const values:Record<number,Record<string,number>>={}
      const scaleKeys=[`${item.alias}.stop`,`${item.alias}.target4`]
      const valueKeys=item.kind==='boswaves_core'?[...keys,...scaleKeys,`${item.alias}.trend`,`${item.alias}.conviction`]:keys
      market.candles.forEach((bar,index)=>{values[bar.time]={};for(const key of valueKeys){const value=calculation.data!.lines[key]?.[index];if(value!==null&&value!==undefined)values[bar.time][key]=value}})
      const id=`configured_${config.key}`
      const trendKey=`${item.alias}.trend`
      const bosFigures=[...keys,...scaleKeys].map(key=>{
        const part=key.split('.').at(-1)
        const styles=({data}:{data:{current?:Record<string,number>|null}})=>{
          if(part==='stop'||part==='target4')return {color:'#00000000',size:0}
          const trend=data.current?.[trendKey]??0
          const color=trend>=0?'#59f58b':'#ff4f91'
          if(part==='edge_glow')return {color:trend>=0?'#59f58b35':'#ff4f9135',size:10}
          if(part==='edge')return {color,size:3}
          if(part==='mid')return {color:trend>=0?'#59f58b55':'#ff4f9155',size:5}
          return {color:'#f8fafccc',size:1}
        }
        return {key,title:part+': ',type:'line' as const,styles}
      })
      instance.createIndicator({id,name:'AURUM_CONFIGURED',paneId:['rsi','atr'].includes(item.kind)?`pane_${config.key}`:'candle_pane',shortName:config.name,figures:item.kind==='boswaves_core'?bosFigures:keys.map(key=>({key,title:key.split('.').at(-1)+': ',type:'line' as const})),extendData:values},true)
      customIds.current.push(id)
      if(item.kind==='boswaves_core'){
        hasBos=true
        const groupId=`boswaves_${config.key}`
        bosGroups.current.push(groupId)
        const bull=calculation.data.lines[`${item.alias}.bull_flip`]??[]
        const bear=calculation.data.lines[`${item.alias}.bear_flip`]??[]
        const risk=calculation.data.lines[`${item.alias}.risk`]??[]
        const flips=market.candles.map((_,index)=>bull[index]===1||bear[index]===1?index:-1).filter(index=>index>=0)
        const keep=Math.max(1,Math.min(12,config.params.keepPositions??4))
        const targetCount=Math.max(2,Math.min(4,config.params.targetCount??4))
        const zonePct=Math.max(.01,Math.min(.25,config.params.zonePct??.06))
        const extend=Math.max(5,Math.min(200,config.params.extendBars??30))
        const spacing=market.candles.length>1?market.candles.at(-1)!.time-market.candles.at(-2)!.time:3600000
        for(const positionIndex of flips.slice(-keep)){
          const flipOrder=flips.indexOf(positionIndex)
          const nextIndex=flips[flipOrder+1]
          const candle=market.candles[positionIndex]
          const direction=bull[positionIndex]===1?1:-1
          const distance=risk[positionIndex]
          if(!candle||distance===null||!Number.isFinite(distance)||distance<=0)continue
          const endTime=nextIndex===undefined?market.candles.at(-1)!.time+spacing*extend:market.candles[nextIndex].time
          const entry=candle.close,stop=entry-direction*distance
          const activeColor=direction===1?'#5ee785':'#ff3f83'
          const level=(value:number,label:string,color:string,dashed=false)=>instance.createOverlay({name:'bosLevel',groupId,lock:true,points:[{timestamp:candle.time,value},{timestamp:endTime,value}],extendData:{color,label,dashed}})
          const zone=(top:number,bottom:number,color:string)=>instance.createOverlay({name:'bosZone',groupId,lock:true,points:[{timestamp:candle.time,value:top},{timestamp:endTime,value:bottom}],extendData:{color}})
          zone(Math.max(entry,stop),Math.min(entry,stop),'#ff3f8312')
          level(entry,direction===1?'LONG':'SHORT',activeColor)
          level(stop,'SL  -1R','#ff3f83')
          let previous=entry
          for(let target=1;target<=targetCount;target++){
            const price=entry+direction*distance*target
            const high=price+distance*zonePct,low=price-distance*zonePct
            zone(Math.max(previous,price),Math.min(previous,price),'#5ee7850b')
            zone(high,low,'#5ee78518')
            level(price,`T${target}  ${target}R`,'#5ee785',target>1)
            previous=price
          }
        }
      }
    }
    instance.setOffsetRightDistance(hasBos?170:35)
  },[calculation.data,market.candles,visible])

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-y border-border px-3 py-2">
        <Button size="sm" variant="outline" onClick={()=>setIndicatorOpen(true)}><Settings2 className="size-3.5"/>Indikator <span className="rounded bg-muted px-1.5 font-mono text-[10px]">{configured.length}</span></Button>
        {configured.slice(0,4).map(item=><Button key={item.key} size="xs" variant={item.visible?'secondary':'ghost'} onClick={()=>setConfigured(current=>current.map(value=>value.key===item.key?{...value,visible:!value.visible}:value))}>{item.name}</Button>)}
        {configured.length>4&&<span className="text-[10px] text-muted-foreground">+{configured.length-4}</span>}
        <span className="mx-2 h-4 border-l border-border" />
        <ChartDrawingManager chart={chartInstance} symbol={market.symbol} interval={market.interval} onNotice={setNotice}/>
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
      {(calculation.isError||calculation.data)&&<div className={`border-t border-border px-4 py-2 text-[10px] ${calculation.isError?'text-rose-300':calculation.data?.ready?'text-emerald-300':'text-amber-200'}`}>{calculation.isError?calculation.error.message:calculation.data?.note}</div>}
      <ChartIndicatorDialog open={indicatorOpen} onOpenChange={setIndicatorOpen} catalog={catalog.data} configs={configured} onChange={setConfigured} favorites={favorites} onFavoritesChange={setFavorites} onOpenManager={()=>{setIndicatorOpen(false);onOpenIndicatorManager()}}/>
    </div>
  )
}
