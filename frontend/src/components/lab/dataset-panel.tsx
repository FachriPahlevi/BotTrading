import {useState} from 'react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Field,selectClass} from './shared'
import {request, type Catalog, type Item, download} from './api'

export function DatasetPanel({catalog,act}: {catalog:Catalog;act:(fn:()=>Promise<unknown>)=>Promise<void>}) {
  const [name,setName]=useState('XAUUSDm M1 history')
  const [broker,setBroker]=useState('Exness Ltd')
  const [server,setServer]=useState('')
  const [symbol,setSymbol]=useState('XAUUSDm')
  const [interval,setInterval]=useState('1m')
  const [role,setRole]=useState('research')
  const [csv,setCsv]=useState('')
  const [start,setStart]=useState(new Date(Date.now()-90*86400000).toISOString().slice(0,10))
  const [end,setEnd]=useState(new Date().toISOString().slice(0,10))
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Histori permanen terpisah dari cache chart 160 candle. Timestamp CSV harus UTC; hanya candle tertutup disimpan. Sinkronisasi awal maksimal 100 hari / 200.000 bar.</p>
    <div className="grid gap-4 md:grid-cols-3">
      <Field label="Nama dataset"><Input value={name} onChange={e=>setName(e.target.value)}/></Field>
      <Field label="Simbol"><Input value={symbol} onChange={e=>setSymbol(e.target.value)}/></Field>
      <Field label="Peran dataset"><select className={selectClass} value={role} onChange={e=>setRole(e.target.value)}><option value="research">Research / tuning</option><option value="holdout">Holdout terkunci</option></select></Field>
      <Field label="Tanggal mulai UTC"><Input type="date" value={start} onChange={e=>setStart(e.target.value)}/></Field>
      <Field label="Tanggal akhir UTC (eksklusif)"><Input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></Field>
      <div className="self-end"><Button onClick={()=>void act(()=>request('/history/sync','POST',{name,symbol,start:start+'T00:00:00Z',end:end+'T00:00:00Z'}))} disabled={!catalog.history_bridge_configured || role==='holdout'}>Ambil histori MT5 M1</Button></div>
    </div>
    {!catalog.history_bridge_configured&&<p className="rounded border border-amber-400/20 p-3 text-xs text-amber-200">Bridge Python histori belum terhubung. Jalankan mt5_bridge.py pada lingkungan terminal; alternatif: ekspor histori MT5 lalu impor CSV di bawah.</p>}
    <details className="rounded-lg border border-border p-4" open><summary className="cursor-pointer text-sm font-medium">Impor CSV UTC</summary><div className="mt-3 grid gap-3 md:grid-cols-3">
      <Field label="Broker sumber"><Input value={broker} onChange={e=>setBroker(e.target.value)}/></Field>
      <Field label="Server sumber (wajib)"><Input value={server} onChange={e=>setServer(e.target.value)} placeholder="Sesuai sumber dataset"/></Field>
      <Field label="Interval CSV"><select className={selectClass} value={interval} onChange={e=>setInterval(e.target.value)}>{['1m','5m','15m','1h','4h','1d'].map(tf=><option key={tf}>{tf}</option>)}</select></Field>
      <Field label="Berkas CSV"><Input type="file" accept=".csv" onChange={e=>{const f=e.target.files?.[0];if(f) void f.text().then(setCsv)}}/></Field>
      <p className="text-xs text-muted-foreground md:col-span-2">Kolom: time,open,high,low,close,volume. time berupa milidetik UTC atau ISO berakhiran Z. Nama dataset sama akan menggabungkan bar tanpa duplikasi dan membuat versi baru.</p>
      <Button disabled={!csv||!server||!name} onClick={()=>void act(()=>request('/datasets/import','POST',{name,broker,server,symbol,interval,role,csv,timezone:'UTC'}))}>Simpan histori</Button>
    </div></details>
    <div className="space-y-3">{catalog.datasets.map((d:Item)=><div key={d.id} className="rounded-lg border border-border p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{d.name} · v{d.version}</strong><span className="text-xs text-muted-foreground">{d.spec.role} {d.archived?'· Arsip':''}</span></div>
      <p className="my-2 text-xs text-muted-foreground">{d.spec.rows?.toLocaleString()} candle · {d.spec.symbol} {d.spec.interval} · {new Date(d.spec.start??0).toISOString().slice(0,10)} — {new Date(d.spec.end??0).toISOString().slice(0,10)} · {d.spec.gap_count} jeda (termasuk sesi tutup)</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>download('dataset-manifest.json',d)}>Ekspor manifest</Button><Button size="sm" variant="outline" disabled={d.spec.interval!=='1m'||d.archived||d.spec.role==='holdout'} onClick={()=>void act(()=>request(`/datasets/${d.version_id}/derive`,'POST'))}>Buat timeframe turunan</Button><Button size="sm" variant="ghost" onClick={()=>void act(()=>request(`/items/${d.id}/archive`,'POST'))}>{d.archived?'Pulihkan':'Arsip'}</Button></div>
      <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">Dataset {d.spec.dataset_id}</p>
    </div>)}</div>
  </div>
}
