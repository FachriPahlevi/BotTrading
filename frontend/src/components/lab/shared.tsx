import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Item, Schema } from './api'

export const selectClass='w-full rounded-md border border-border bg-background p-2 text-sm'
export function Field({label,children}: {label:string;children:ReactNode}) {return <label className="block space-y-1 text-xs text-muted-foreground"><span>{label}</span>{children}</label>}
export function Params({schema,values,onChange}: {schema?:Schema;values:Record<string,number>;onChange:(v:Record<string,number>)=>void}) {
  return <div className="grid grid-cols-2 gap-3">{Object.entries(schema?.params??{}).map(([key,r])=><Field key={key} label={key}><Input type="number" value={values[key]??r.default} min={r.min} max={r.max} step={r.type==='integer'?1:'any'} onChange={e=>onChange({...values,[key]:Number(e.target.value)})} /></Field>)}</div>
}
export function ItemList({items,onSelect,onArchive,onClone}: {items:Item[];onSelect:(i:Item)=>void;onArchive:(i:Item)=>void;onClone:(i:Item)=>void}) {
  return <div className="space-y-2">{!items.length&&<p className="text-sm text-muted-foreground">Belum ada item.</p>}{items.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
    <button onClick={()=>onSelect(i)} className="min-w-0 text-left"><span className="font-medium">{i.name}</span><span className="block text-xs text-muted-foreground">v{i.version} · {i.spec.status??i.spec.role??'dataset'} · {i.usage} run {i.archived?'· Arsip':''} {i.builtin?'· Bawaan':''}</span></button>
    <div className="flex gap-1"><Button size="xs" variant="outline" onClick={()=>onClone(i)}>Duplikat</Button>{!i.builtin&&<Button size="xs" variant="ghost" onClick={()=>onArchive(i)}>{i.archived?'Pulihkan':'Arsip'}</Button>}</div>
  </div>)}</div>
}
