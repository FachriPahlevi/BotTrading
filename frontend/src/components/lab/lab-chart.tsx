import { useEffect, useRef } from 'react'
import { init, dispose, registerIndicator, type Period } from 'klinecharts'
import type { Preview } from './api'

registerIndicator<Record<string, number>, unknown, Record<number, Record<string, number>>>({
  name: 'LAB_SERIES', shortName: 'Lab', figures: [],
  calc: (bars, indicator) => bars.map(bar => indicator.extendData?.[bar.timestamp] ?? {}),
})
const periods: Record<string, Period> = {'1m':{type:'minute',span:1},'5m':{type:'minute',span:5},'15m':{type:'minute',span:15},'1h':{type:'hour',span:1},'4h':{type:'hour',span:4},'1d':{type:'day',span:1}}
export function LabChart({data}: {data: Preview}) {
  const ref=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    if(!ref.current) return
    const chart=init(ref.current,{styles:'dark',timezone:'UTC'})
    if(!chart) return
    chart.setDataLoader({getBars:({type,callback})=>callback(type==='init'?data.candles.map(c=>({...c,timestamp:c.time})):[],false)})
    chart.setSymbol({ticker:data.symbol,pricePrecision:5,volumePrecision:0})
    chart.setPeriod(periods[data.interval])
    for(const instance of data.instances) {
      const keys=Object.keys(data.lines).filter(k=>k.startsWith(instance.alias+'.') && !/\.(trend|risk|bull_flip|bear_flip)$/.test(k))
      const values: Record<number, Record<string,number>>={}
      data.candles.forEach((c,i)=>{ values[c.time]={}; keys.forEach(k=>{const v=data.lines[k][i];if(v!==null) values[c.time][k]=v}) })
      chart.createIndicator({id:`lab_${instance.alias}`,name:'LAB_SERIES', paneId:['rsi','atr'].includes(instance.kind)?`pane_${instance.alias}`:'candle_pane', shortName:instance.alias, figures:keys.map(k=>({key:k,title:k+': ',type:'line' as const})),extendData:values},true)
    }
    const observer=new ResizeObserver(()=>chart.resize());observer.observe(ref.current)
    return ()=>{observer.disconnect();dispose(chart)}
  },[data])
  return <div className="space-y-2"><p className="text-xs text-muted-foreground">{data.note} · Warm-up {data.warmup_bars} bar · UTC · scroll untuk zoom</p><div ref={ref} data-testid="lab-chart" className="h-[480px] w-full rounded-lg border border-border" /></div>
}
