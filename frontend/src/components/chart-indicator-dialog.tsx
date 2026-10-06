import {useMemo,useState} from 'react'
import {Search,Settings2,Star,Trash2,Eye,EyeOff} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from '@/components/ui/dialog'
import {Params} from '@/components/lab/shared'
import type {Catalog,ChartIndicatorConfig,Item} from '@/components/lab/api'

function nextAlias(item:Item,current:ChartIndicatorConfig[]) {
  const root=(item.spec.kind??'indicator').replace(/[^a-z0-9]/g,'').slice(0,20)||'indicator'
  let index=1
  while(current.some(value=>value.alias===`${root}${index}`))index++
  return `${root}${index}`
}

export function ChartIndicatorDialog({open,onOpenChange,catalog,configs,onChange,favorites,onFavoritesChange,onOpenManager}:{open:boolean;onOpenChange:(value:boolean)=>void;catalog?:Catalog;configs:ChartIndicatorConfig[];onChange:(value:ChartIndicatorConfig[])=>void;favorites:string[];onFavoritesChange:(value:string[])=>void;onOpenManager:()=>void}) {
  const [query,setQuery]=useState(''),[favoriteOnly,setFavoriteOnly]=useState(false)
  const list=useMemo(()=>catalog?.indicators?.filter(item=>!item.archived&&item.spec?.kind!=='source_only'&&(!favoriteOnly||favorites.includes(item.id))&&item.name.toLowerCase().includes(query.trim().toLowerCase()))??[],[catalog,query,favoriteOnly,favorites])
  function favorite(id:string){onFavoritesChange(favorites.includes(id)?favorites.filter(value=>value!==id):[...favorites,id])}
  function add(item:Item){
    if(configs.length>=32)return
    onChange([...configs,{key:crypto.randomUUID(),name:item.name,alias:nextAlias(item,configs),version_id:item.version_id,params:{...(item.spec.params??{})},visible:true}])
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[88vh] max-w-4xl overflow-hidden p-0">
    <DialogHeader className="border-b border-border p-5"><DialogTitle className="flex items-center gap-2"><Settings2 className="size-4"/>Indikator chart</DialogTitle><DialogDescription>Cari dan favoritkan indikator, tambahkan beberapa instance, lalu atur input masing-masing seperti period atau multiplier. Maksimal 32 instance.</DialogDescription></DialogHeader>
    <div className="grid min-h-0 md:grid-cols-[1fr_1.15fr]">
      <section className="min-h-0 border-b border-border p-4 md:border-b-0 md:border-r"><div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><Input aria-label="Cari indikator" className="pl-9" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Cari indikator…"/></div>
        <div className="my-3 flex gap-2"><Button size="sm" variant={!favoriteOnly?'secondary':'ghost'} onClick={()=>setFavoriteOnly(false)}>Semua</Button><Button size="sm" variant={favoriteOnly?'secondary':'ghost'} onClick={()=>setFavoriteOnly(true)}><Star className="size-3"/>Favorit</Button></div>
        <div className="max-h-[52vh] space-y-1 overflow-auto pr-1">{list.map(item=><div key={item.id} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted"><button aria-label={`${favorites.includes(item.id)?'Hapus':'Tambah'} ${item.name} dari favorit`} onClick={()=>favorite(item.id)} className={favorites.includes(item.id)?'text-amber-300':'text-muted-foreground'}><Star className="size-4" fill={favorites.includes(item.id)?'currentColor':'none'}/></button><button className="min-w-0 flex-1 text-left" onClick={()=>add(item)}><span className="block truncate text-sm">{item.name}</span><span className="text-[10px] text-muted-foreground">v{item.version} · {item.spec.status}</span></button><Button size="xs" variant="ghost" onClick={()=>add(item)}>Tambah</Button></div>)}{!list.length&&<p className="p-4 text-center text-xs text-muted-foreground">Tidak ada indikator yang cocok.</p>}</div>
      </section>
      <section className="max-h-[65vh] min-h-0 overflow-auto p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-medium">Pada chart ({configs.length})</h3><Button size="xs" variant="outline" onClick={onOpenManager}>Kelola library</Button></div>
        <div className="space-y-3">{configs.map((config,index)=>{const item=catalog?.indicators?.find(i=>i.versions?.some(v=>v.id===config.version_id));const version=item?.versions?.find(v=>v.id===config.version_id);const schema=catalog?.schemas?.[version?.spec.kind??''];return <div key={config.key} className="space-y-3 rounded-lg border border-border p-3"><div className="flex items-center gap-2"><button aria-label={config.visible?`Sembunyikan ${config.name}`:`Tampilkan ${config.name}`} onClick={()=>onChange(configs.map((v,n)=>n===index?{...v,visible:!v.visible}:v))}>{config.visible?<Eye className="size-4"/>:<EyeOff className="size-4 text-muted-foreground"/>}</button><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{config.name}</p><p className="text-[10px] text-muted-foreground">{config.alias} · versi terkunci</p></div><Button aria-label={`Hapus ${config.name} dari chart`} size="icon-xs" variant="ghost" onClick={()=>onChange(configs.filter((_,n)=>n!==index))}><Trash2/></Button></div><Params schema={schema} values={config.params} onChange={params=>onChange(configs.map((v,n)=>n===index?{...v,params}:v))}/></div>})}{!configs.length&&<p className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">Klik Tambah pada library untuk memasang indikator.</p>}</div>
      </section>
    </div>
  </DialogContent></Dialog>
}
