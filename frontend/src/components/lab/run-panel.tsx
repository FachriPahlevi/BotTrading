import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Field,selectClass} from './shared'
import {request,download,metric,type Catalog,type Run} from './api'

export function RunPanel({catalog,act}: {catalog:Catalog;act:(fn:()=>Promise<unknown>)=>Promise<void>}) {
  const [name,setName]=useState('Backtest '+new Date().toISOString().slice(0,16))
  const [strategy,setStrategy]=useState(''),[dataset,setDataset]=useState('')
  const [balance,setBalance]=useState(100),[risk,setRisk]=useState(1),[target,setTarget]=useState(100)
  const [costs,setCosts]=useState({spread:0,slippage:0,commission_per_lot:0,contract_size:100,volume_min:.01,volume_step:.01,volume_max:100})
  const [ack,setAck]=useState(false),[unlock,setUnlock]=useState(false),[selected,setSelected]=useState('')
  const detail=useQuery({queryKey:['lab-run',selected],queryFn:()=>request<Run>(`/runs/${selected}`),enabled:!!selected,refetchInterval:query=>['queued','running'].includes(query.state.data?.status??'')?2000:false})
  const run=detail.data
  const curve=run?.result?.equity_curve??[]
  const low=Math.min(...curve.map(p=>p.equity)),high=Math.max(...curve.map(p=>p.equity))
  const points=curve.map((p,i)=>`${i/Math.max(1,curve.length-1)*900},${170-(p.equity-low)/Math.max(1,high-low)*150}`).join(' ')
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Run mengunci versi strategi, parameter, biaya, dataset, dan versi engine. Target trade yang belum tercapai ditandai incomplete. Tidak ada order dikirim ke broker.</p>
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="Nama run unik"><Input value={name} onChange={e=>setName(e.target.value)}/></Field>
      <Field label="Versi strategi"><select className={selectClass} value={strategy} onChange={e=>setStrategy(e.target.value)}><option value="">Pilih strategi</option>{catalog.strategies.filter(s=>!s.archived).flatMap(s=>s.versions.map(v=><option key={v.id} value={v.id}>{s.name} v{v.number}</option>))}</select></Field>
      <Field label="Versi dataset"><select className={selectClass} value={dataset} onChange={e=>{setDataset(e.target.value);setUnlock(false)}}><option value="">Pilih dataset</option>{catalog.datasets.filter(s=>!s.archived).flatMap(s=>s.versions.map(v=><option key={v.id} value={v.id}>{s.name} v{v.number} · {v.spec.role}</option>))}</select></Field>
      <Field label="Modal simulasi"><Input type="number" min="1" value={balance} onChange={e=>setBalance(Number(e.target.value))}/></Field>
      <Field label="Risiko per trade (%)"><Input type="number" min="0.01" max="10" step="0.1" value={risk} onChange={e=>setRisk(Number(e.target.value))}/></Field>
      <Field label="Target jumlah trade"><Input type="number" min="1" max="10000" value={target} onChange={e=>setTarget(Number(e.target.value))}/></Field>
    </div>
    <details open className="rounded-lg border border-border p-4"><summary className="cursor-pointer font-medium">Asumsi biaya & spesifikasi kontrak</summary><p className="my-3 text-xs text-amber-200">Isi sesuai simbol/broker. Nilai awal adalah asumsi, belum diambil dari MT5. Spread dan slippage dalam satuan harga; komisi per lot round trip. Simulasi memakai mata uang quote simbol, tanpa konversi kurs dan swap.</p><div className="grid gap-3 md:grid-cols-4">{Object.entries(costs).map(([key,value])=><Field label={key} key={key}><Input type="number" min="0" step="any" value={value} onChange={e=>setCosts({...costs,[key]:Number(e.target.value)})}/></Field>)}</div></details>
    <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>Saya sudah meninjau biaya dan memahami hasil ini experimental; kelulusan backtest tidak mengaktifkan trading.</label>
    {catalog.datasets.some(d=>d.versions.some(v=>v.id===dataset&&v.spec.role==='holdout'))&&<label className="flex items-start gap-2 text-xs text-amber-200"><input type="checkbox" checked={unlock} onChange={e=>setUnlock(e.target.checked)}/>Buka holdout untuk evaluasi ini. Akses dicatat dalam audit.</label>}
    <Button disabled={!strategy||!dataset||!ack} onClick={()=>void act(async()=>{const r=await request<Run>('/runs','POST',{name,strategy_version_id:strategy,dataset_version_id:dataset,initial_balance:balance,risk_percent:risk,target_trades:target,costs,research_ack:ack,unlock_holdout:unlock,seed:0});setSelected(r.id)})}>Jalankan backtest</Button>
    <div className="grid gap-4 xl:grid-cols-[1fr_2fr]"><div className="space-y-2"><h3 className="font-medium">Riwayat run ({catalog.run_count})</h3>{catalog.runs.map(r=><button key={r.id} className={`block w-full rounded-lg border p-3 text-left ${selected===r.id?'border-primary':'border-border'}`} onClick={()=>setSelected(r.id)}><span className="text-sm">{r.name}</span><span className="block text-xs text-muted-foreground">{r.status} · {r.progress}% · {metric(r.metrics.total_trades,0)} trade</span></button>)}{!catalog.runs.length&&<p className="text-sm text-muted-foreground">Belum ada run.</p>}</div>
      <div className="min-w-0 space-y-4">{detail.isError&&<p role="alert" className="text-rose-300">{detail.error.message}</p>}{run&&<>
        <div className="flex flex-wrap justify-between gap-2"><h3 className="font-medium">{run.name} · {run.status}</h3><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>download(`${run.name}.json`,run)}>Ekspor hasil & snapshot</Button>{['queued','running'].includes(run.status)&&<Button size="sm" variant="outline" onClick={()=>void act(()=>request(`/runs/${run.id}/cancel`,'POST'))}>Batalkan</Button>}</div></div>
        {run.error&&<p role="alert" className="text-rose-300">{run.error}</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">{[['Trade','total_trades'],['Saldo akhir','final_balance'],['Net P/L','net_return'],['Win rate %','win_rate_pct'],['Profit factor','profit_factor'],['Max drawdown %','max_drawdown_pct'],['Expectancy R','expectancy_r'],['Break-even win %','breakeven_win_rate_pct'],['Setup dilewati','skipped_setups']].map(([label,key])=><div key={key} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="font-mono text-lg">{metric(run.metrics[key])}</p></div>)}</div>
        {Array.isArray(run.metrics.wilson_95)&&<p className="text-xs text-muted-foreground">Interval Wilson 95% win rate: {run.metrics.wilson_95.map(v=>metric(v)).join(' – ')}%. Ini interval sampel, bukan estimasi keuntungan masa depan.</p>}
        {curve.length>0&&<div className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">Equity · {metric(low)} – {metric(high)}</p><svg viewBox="0 0 900 190" role="img" aria-label="Kurva equity historis" className="w-full"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary"/></svg></div>}
        {!!run.result?.trades.length&&<div className="max-h-96 overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{['Waktu entry UTC','Arah','Entry','SL','TP','Lot','Net P/L','Exit'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>{run.result.trades.map((t,i)=><tr key={i} className="border-t border-border"><td className="p-2">{new Date(Number(t.entry_time)).toISOString()}</td><td className="p-2">{t.direction===1?'LONG':'SHORT'}</td>{['entry','stop','target','volume','net_pnl'].map(k=><td key={k} className="p-2 font-mono">{metric(t[k],5)}</td>)}<td className="p-2">{String(t.exit_reason)}</td></tr>)}</tbody></table></div>}
        <details><summary className="cursor-pointer text-sm">Snapshot immutable</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-[10px]">{JSON.stringify(run.snapshot,null,2)}</pre></details>
      </>}</div>
    </div>
  </div>
}
