import {useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {Card} from '@/components/ui/card'
import {request,type Catalog} from './api'
import {LibraryPanel} from './library-panel'

export function IndicatorManagerPage() {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('')
  const client=useQueryClient()
  const query=useQuery({queryKey:['lab-catalog'],queryFn:()=>request<Catalog>('/catalog'),refetchInterval:15000})
  async function act(fn:()=>Promise<unknown>) {
    if(busy)return
    setBusy(true);setMessage('');setError('')
    try{await fn();await client.invalidateQueries({queryKey:['lab-catalog']});setMessage('Perubahan indikator tersimpan sebagai versi yang dapat ditelusuri.')}
    catch(e){setError(e instanceof Error?e.message:'Permintaan gagal.')}
    finally{setBusy(false)}
  }
  return <Card id="indicators" className="space-y-5 p-4 md:p-6">
    <div><p className="text-xs uppercase tracking-widest text-primary">Indicator library</p><h2 className="mt-1 text-2xl font-semibold">Manajemen indikator</h2><p className="mt-2 text-sm text-muted-foreground">Kelola indikator bawaan dan script Pine, parameter default, versi, serta pratinjau historis. Favorit dan konfigurasi chart tersedia langsung dari tombol Indikator pada dashboard.</p></div>
    {query.isPending&&<p>Memuat indikator…</p>}{(error||query.isError)&&<p role="alert" className="rounded border border-rose-400/30 p-3 text-sm text-rose-300">{error||query.error?.message}</p>}{message&&<p role="status" className="text-xs text-emerald-300">{message}</p>}
    {query.data&&<fieldset disabled={busy}><LibraryPanel catalog={query.data} act={act} onlyKind="indicators"/></fieldset>}
  </Card>
}
