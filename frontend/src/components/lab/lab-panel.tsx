import {useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {Card} from '@/components/ui/card'
import {Button} from '@/components/ui/button'
import {request,type Catalog} from './api'
import {DatasetPanel} from './dataset-panel'
import {LibraryPanel} from './library-panel'
import {RunPanel} from './run-panel'

export function LabPanel() {
  const [tab,setTab]=useState('data'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  const client=useQueryClient()
  const query=useQuery({queryKey:['lab-catalog'],queryFn:()=>request<Catalog>('/catalog'),refetchInterval:5000})
  async function act(fn:()=>Promise<unknown>) {
    if(busy)return
    setBusy(true);setError('');setMessage('')
    try{await fn();await client.invalidateQueries({queryKey:['lab-catalog']});setMessage('Berhasil. Perubahan tersimpan / hasil diperbarui.')}
    catch(e){setError(e instanceof Error?e.message:'Permintaan gagal.')}
    finally{setBusy(false)}
  }
  return <Card className="space-y-5 p-4 md:p-6"><div><p className="text-xs uppercase tracking-widest text-primary">Research workspace</p><h2 className="mt-1 text-2xl font-semibold">Strategy Lab</h2><p className="mt-2 text-sm text-muted-foreground">Histori broker → indikator → strategi bernama → backtest yang dapat ditelusuri.</p></div><div className="flex flex-wrap gap-2">{[['data','1. Data historis'],['library','2. Indikator & strategi'],['runs','3. Backtest']].map(([id,label])=><Button key={id} variant={tab===id?'secondary':'outline'} onClick={()=>setTab(id)}>{label}</Button>)}</div>
    {query.isPending&&<p>Memuat katalog…</p>}{(error||query.isError)&&<p role="alert" className="rounded border border-rose-400/30 p-3 text-sm text-rose-300">{error||query.error?.message}</p>}{message&&<p role="status" className="text-xs text-emerald-300">{message}</p>}{busy&&<p role="status" className="text-xs text-muted-foreground">Memproses…</p>}
    {query.data&&<fieldset disabled={busy} className="min-w-0">{tab==='data'&&<DatasetPanel catalog={query.data} act={act}/>} {tab==='library'&&<LibraryPanel catalog={query.data} act={act}/>} {tab==='runs'&&<RunPanel catalog={query.data} act={act}/>}</fieldset>}
  </Card>
}
