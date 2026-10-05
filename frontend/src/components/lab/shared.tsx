import type { ReactNode } from 'react'
import { Code2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { Item, Schema } from './api'

export const selectClass='w-full rounded-md border border-border bg-background p-2 text-sm'
export function Field({label,children}: {label:string;children:ReactNode}) {return <label className="block space-y-1 text-xs text-muted-foreground"><span>{label}</span>{children}</label>}
export function Params({schema,values,onChange}: {schema?:Schema;values:Record<string,number>;onChange:(v:Record<string,number>)=>void}) {
  return <div className="grid grid-cols-2 gap-3">{Object.entries(schema?.params??{}).map(([key,r])=><Field key={key} label={key}><Input type="number" value={values[key]??r.default} min={r.min} max={r.max} step={r.type==='integer'?1:'any'} onChange={e=>onChange({...values,[key]:Number(e.target.value)})} /></Field>)}</div>
}
export function ItemList({
  items,
  onSelect,
  onArchive,
  onClone,
  onEditPine,
}: {
  items: Item[]
  onSelect: (i: Item) => void
  onArchive: (i: Item) => void
  onClone: (i: Item) => void
  onEditPine?: (i: Item) => void
}) {
  return (
    <div className="space-y-2">
      {!items.length && <p className="text-sm text-muted-foreground">Belum ada item.</p>}
      {items.map((i) => (
        <div
          key={i.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-[#0d121a] p-3 hover:border-primary/40 transition-colors"
        >
          <button onClick={() => onSelect(i)} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground hover:text-primary transition-colors">
                {i.name}
              </span>
              {i.builtin && (
                <span className="rounded bg-primary/10 px-1.5 py-0.2 text-[10px] font-medium text-primary">
                  Bawaan
                </span>
              )}
            </div>
            <span className="block text-xs text-muted-foreground mt-0.5">
              v{i.version} · {i.spec.kind ?? i.spec.status ?? i.spec.role ?? 'item'} · {i.usage} run
              {i.archived ? ' · Arsip' : ''}
              {i.spec.source ? ' · Has Pine' : ''}
            </span>
          </button>
          <div className="flex items-center gap-1">
            {onEditPine && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onEditPine(i)}
                className="h-7 px-2 text-xs gap-1 text-primary hover:bg-primary/10"
                title="Buka di Pine Editor"
              >
                <Code2 className="size-3.5" />
                <span className="hidden sm:inline">Pine</span>
              </Button>
            )}
            <Button size="xs" variant="outline" className="h-7 px-2" onClick={() => onClone(i)}>
              Duplikat
            </Button>
            {!i.builtin && (
              <Button
                size="xs"
                variant="ghost"
                className="h-7 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => onArchive(i)}
              >
                {i.archived ? 'Pulihkan' : 'Arsip'}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

