import { useEffect, useRef, useState } from 'react'
import {
  registerOverlay,
  type Chart,
  type Overlay,
  type OverlayCreate,
  type Point,
} from 'klinecharts'
import {
  Brush,
  Copy,
  Download,
  Eye,
  EyeOff,
  GitBranch,
  Import,
  Lock,
  Minus,
  MoveUpRight,
  PencilRuler,
  MoveRight,
  Redo2,
  Ruler,
  Save,
  Square,
  TextCursorInput,
  Trash2,
  Unlock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

const STORAGE_KEY = 'aurum.chart.drawing-layouts.v1'
const ACTIVE_KEY = 'aurum.chart.active-drawing-layout.v1'
const MANUAL_GROUP = 'manual'
const MAX_LAYOUTS = 24
const MAX_DRAWINGS = 200
const allowedTools = new Set([
  'segment',
  'rayLine',
  'horizontalStraightLine',
  'verticalStraightLine',
  'priceZone',
  'fibonacciLine',
  'priceChannelLine',
  'parallelStraightLine',
  'brush',
  'simpleAnnotation',
  'measureTool',
])

type SavedPoint = Partial<Pick<Point, 'dataIndex' | 'timestamp' | 'value'>>
type SavedDrawing = {
  name: string
  points: SavedPoint[]
  extendData?: string
  lock?: boolean
  visible?: boolean
}
type DrawingLayout = {
  id: string
  name: string
  symbol: string
  interval: string
  updatedAt: string
  drawings: SavedDrawing[]
}

registerOverlay({
  name: 'measureTool',
  totalStep: 3,
  needDefaultPointFigure: true,
  needDefaultXAxisFigure: true,
  needDefaultYAxisFigure: true,
  createPointFigures: ({ coordinates, overlay }) => {
    if (coordinates.length < 2) return []
    const [a, b] = coordinates
    const start = overlay.points[0]
    const end = overlay.points[1]
    const delta = Number(end.value ?? 0) - Number(start.value ?? 0)
    const percent = start.value ? (delta / start.value) * 100 : 0
    const bars = Math.abs(Number(end.dataIndex ?? 0) - Number(start.dataIndex ?? 0))
    const color = delta >= 0 ? '#39c9a4' : '#f07b86'
    return [
      {
        type: 'rect',
        attrs: {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
        },
        styles: { style: 'stroke_fill', color: `${color}18`, borderColor: color, borderSize: 1 },
      },
      { type: 'line', attrs: { coordinates: [a, b] }, styles: { color, size: 1 } },
      {
        type: 'text',
        attrs: {
          x: (a.x + b.x) / 2,
          y: Math.min(a.y, b.y) - 8,
          text: `${delta >= 0 ? '+' : ''}${delta.toFixed(3)} (${percent.toFixed(2)}%) · ${bars} bar`,
          align: 'center',
          baseline: 'bottom',
        },
        styles: { color, backgroundColor: '#101820', borderColor: color, borderSize: 1, padding: [4, 6] },
      },
    ]
  },
})

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function safePoint(value: unknown): SavedPoint | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const point: SavedPoint = {}
  for (const key of ['dataIndex', 'timestamp', 'value'] as const) {
    const number = source[key]
    if (typeof number === 'number' && Number.isFinite(number)) point[key] = number
  }
  return Object.keys(point).length ? point : null
}

function safeDrawing(value: unknown): SavedDrawing | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  if (typeof source.name !== 'string' || !allowedTools.has(source.name)) return null
  const points = Array.isArray(source.points)
    ? source.points.map(safePoint).filter((point): point is SavedPoint => point !== null).slice(0, 1000)
    : []
  if (!points.length) return null
  return {
    name: source.name,
    points,
    extendData: typeof source.extendData === 'string' ? source.extendData.slice(0, 240) : undefined,
    lock: source.lock === true,
    visible: source.visible !== false,
  }
}

function safeLayout(value: unknown): DrawingLayout | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  if (
    typeof source.id !== 'string' ||
    typeof source.name !== 'string' ||
    typeof source.symbol !== 'string' ||
    typeof source.interval !== 'string'
  ) return null
  return {
    id: source.id.slice(0, 80),
    name: source.name.trim().slice(0, 80) || 'Layout tanpa nama',
    symbol: source.symbol.slice(0, 40),
    interval: source.interval.toLowerCase().slice(0, 12),
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : new Date().toISOString(),
    drawings: Array.isArray(source.drawings)
      ? source.drawings.map(safeDrawing).filter((drawing): drawing is SavedDrawing => drawing !== null).slice(0, MAX_DRAWINGS)
      : [],
  }
}

function readLayouts(): DrawingLayout[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.map(safeLayout).filter((layout): layout is DrawingLayout => layout !== null).slice(0, MAX_LAYOUTS)
  } catch {
    return []
  }
}

function snapshot(overlays: Overlay[]): SavedDrawing[] {
  return overlays
    .filter((overlay) => allowedTools.has(overlay.name) && overlay.points.length > 0)
    .slice(0, MAX_DRAWINGS)
    .map((overlay) => ({
      name: overlay.name,
      points: overlay.points.map((point) => ({
        dataIndex: point.dataIndex,
        timestamp: point.timestamp,
        value: point.value,
      })),
      extendData: typeof overlay.extendData === 'string' ? overlay.extendData.slice(0, 240) : undefined,
      lock: overlay.lock,
      visible: overlay.visible,
    }))
}

const tools = [
  { name: 'segment', label: 'Garis tren', icon: MoveUpRight },
  { name: 'rayLine', label: 'Sinar', icon: MoveRight },
  { name: 'horizontalStraightLine', label: 'Garis horizontal', icon: Minus },
  { name: 'verticalStraightLine', label: 'Garis vertikal', icon: GitBranch },
  { name: 'priceZone', label: 'Persegi / zona', icon: Square },
  { name: 'measureTool', label: 'Penggaris harga', icon: Ruler },
  { name: 'fibonacciLine', label: 'Fibonacci retracement', icon: Redo2 },
  { name: 'priceChannelLine', label: 'Kanal harga', icon: GitBranch },
  { name: 'parallelStraightLine', label: 'Garis paralel', icon: GitBranch },
  { name: 'brush', label: 'Kuas bebas', icon: Brush },
] as const

export function ChartDrawingManager({
  chart,
  symbol,
  interval,
  onNotice,
}: {
  chart: Chart | null
  symbol: string
  interval: string
  onNotice: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [layouts, setLayouts] = useState<DrawingLayout[]>(readLayouts)
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY) ?? '')
  const [layoutName, setLayoutName] = useState('')
  const [textValue, setTextValue] = useState('Catatan')
  const [locked, setLocked] = useState(false)
  const [visible, setVisible] = useState(true)
  const layoutsRef = useRef(layouts)
  const activeRef = useRef(activeId)
  const restoring = useRef(false)
  const saveRef = useRef<() => void>(() => undefined)
  const fileRef = useRef<HTMLInputElement>(null)

  layoutsRef.current = layouts
  activeRef.current = activeId

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts))
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId)
    } catch {
      onNotice('Penyimpanan browser penuh. Ekspor atau hapus layout lama.')
    }
  }, [activeId, layouts, onNotice])

  function callbacks(): Partial<OverlayCreate> {
    const save = () => window.setTimeout(() => saveRef.current(), 0)
    return { onDrawEnd: save, onPressedMoveEnd: save, onRemoved: save }
  }

  function saveCurrent(message = true) {
    if (!chart || restoring.current || !activeRef.current) return
    const drawings = snapshot(chart.getOverlays({ groupId: MANUAL_GROUP }))
    const now = new Date().toISOString()
    const next = layoutsRef.current.map((layout) =>
      layout.id === activeRef.current ? { ...layout, drawings, updatedAt: now } : layout,
    )
    layoutsRef.current = next
    setLayouts(next)
    if (message) onNotice(`Layout disimpan · ${drawings.length} gambar manual.`)
  }
  saveRef.current = () => saveCurrent(false)

  function restore(layout: DrawingLayout) {
    if (!chart) return
    restoring.current = true
    chart.removeOverlay({ groupId: MANUAL_GROUP })
    for (const drawing of layout.drawings) {
      chart.createOverlay({
        name: drawing.name,
        groupId: MANUAL_GROUP,
        points: drawing.points,
        extendData: drawing.extendData,
        lock: drawing.lock,
        visible: drawing.visible,
        ...callbacks(),
      })
    }
    window.setTimeout(() => { restoring.current = false }, 0)
    setLocked(layout.drawings.length > 0 && layout.drawings.every((drawing) => drawing.lock))
    setVisible(!layout.drawings.length || layout.drawings.some((drawing) => drawing.visible))
    onNotice(`Layout “${layout.name}” aktif · ${layout.drawings.length} gambar.`)
  }

  function activate(nextId: string) {
    saveCurrent(false)
    const next = layoutsRef.current.find((layout) => layout.id === nextId)
    if (!next) return
    activeRef.current = next.id
    setActiveId(next.id)
    setLayoutName(next.name)
    restore(next)
  }

  function createLayout(name?: string, drawings: SavedDrawing[] = []) {
    saveCurrent(false)
    const layout: DrawingLayout = {
      id: id(),
      name: (name?.trim() || `Layout ${symbol} ${interval}`).slice(0, 80),
      symbol,
      interval: interval.toLowerCase(),
      updatedAt: new Date().toISOString(),
      drawings,
    }
    const next = [...layoutsRef.current, layout].slice(-MAX_LAYOUTS)
    layoutsRef.current = next
    activeRef.current = layout.id
    setLayouts(next)
    setActiveId(layout.id)
    setLayoutName(layout.name)
    restore(layout)
  }

  useEffect(() => {
    if (!chart) return
    const current = layoutsRef.current.find((layout) => layout.id === activeRef.current)
    const scoped = layoutsRef.current.find(
      (layout) => layout.symbol === symbol && layout.interval === interval.toLowerCase(),
    )
    if (current && current.symbol === symbol && current.interval === interval.toLowerCase()) {
      setLayoutName(current.name)
      restore(current)
    } else if (scoped) {
      activeRef.current = scoped.id
      setActiveId(scoped.id)
      setLayoutName(scoped.name)
      restore(scoped)
    } else {
      createLayout()
    }
    // Only load when the chart or market scope changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chart, symbol, interval])

  function draw(name: string, label: string, extendData?: string) {
    if (!chart) return
    chart.createOverlay({ name, groupId: MANUAL_GROUP, extendData, ...callbacks() })
    setOpen(false)
    onNotice(`${label}: klik pada chart untuk menentukan titik. Tersimpan otomatis pada layout aktif.`)
  }

  function rename() {
    const name = layoutName.trim().slice(0, 80)
    if (!name) return
    setLayouts((current) => current.map((layout) => layout.id === activeId ? { ...layout, name } : layout))
    onNotice(`Layout dinamai “${name}”.`)
  }

  function duplicate() {
    if (!chart) return
    const current = layoutsRef.current.find((layout) => layout.id === activeRef.current)
    createLayout(`${current?.name ?? 'Layout'} salinan`, snapshot(chart.getOverlays({ groupId: MANUAL_GROUP })))
  }

  function removeLayout() {
    const remaining = layoutsRef.current.filter((layout) => layout.id !== activeRef.current)
    layoutsRef.current = remaining
    setLayouts(remaining)
    const next = remaining.find((layout) => layout.symbol === symbol && layout.interval === interval.toLowerCase())
    if (next) activate(next.id)
    else createLayout()
  }

  function changeAll(next: { lock?: boolean; visible?: boolean }) {
    if (!chart) return
    for (const overlay of chart.getOverlays({ groupId: MANUAL_GROUP })) {
      chart.overrideOverlay({ id: overlay.id, ...next })
    }
    if (next.lock !== undefined) setLocked(next.lock)
    if (next.visible !== undefined) setVisible(next.visible)
    saveCurrent(false)
  }

  function undo() {
    if (!chart) return
    const overlays = chart.getOverlays({ groupId: MANUAL_GROUP })
    const last = overlays.at(-1)
    if (last) chart.removeOverlay({ id: last.id })
    saveCurrent(false)
    onNotice(last ? 'Gambar terakhir dihapus.' : 'Belum ada gambar untuk dihapus.')
  }

  function clear() {
    if (!chart) return
    restoring.current = true
    chart.removeOverlay({ groupId: MANUAL_GROUP })
    restoring.current = false
    saveCurrent(false)
    onNotice('Semua gambar pada layout aktif dihapus.')
  }

  function exportLayouts() {
    saveCurrent(false)
    const blob = new Blob([JSON.stringify(layoutsRef.current, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `aurum-drawing-layouts-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  async function importLayouts(file?: File) {
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!Array.isArray(parsed)) throw new Error('Format harus berupa array layout.')
      const imported = parsed.map(safeLayout).filter((layout): layout is DrawingLayout => layout !== null)
      if (!imported.length) throw new Error('Tidak ada layout valid di file.')
      const known = new Set(layoutsRef.current.map((layout) => layout.id))
      const unique = imported.map((layout) => ({ ...layout, id: known.has(layout.id) ? id() : layout.id }))
      const next = [...layoutsRef.current, ...unique].slice(-MAX_LAYOUTS)
      layoutsRef.current = next
      setLayouts(next)
      activate(unique.at(-1)!.id)
      onNotice(`${unique.length} layout berhasil diimpor.`)
    } catch (error) {
      onNotice(error instanceof Error ? `Impor gagal: ${error.message}` : 'Impor layout gagal.')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const active = layouts.find((layout) => layout.id === activeId)

  return <>
    <Button variant="ghost" size="icon-xs" title="Garis tren" aria-label="Garis tren" onClick={() => draw('segment', 'Garis tren')}><MoveUpRight /></Button>
    <Button variant="ghost" size="icon-xs" title="Garis horizontal" aria-label="Garis horizontal" onClick={() => draw('horizontalStraightLine', 'Garis horizontal')}><Minus /></Button>
    <Button variant="ghost" size="icon-xs" title="Penggaris harga" aria-label="Penggaris harga" onClick={() => draw('measureTool', 'Penggaris harga')}><Ruler /></Button>
    <Button variant="outline" size="sm" aria-label="Buka alat gambar" onClick={() => setOpen(true)}>
      <PencilRuler className="size-3.5" />
      <span className="max-w-28 truncate">{active?.name ?? 'Alat gambar'}</span>
      <span className="rounded bg-muted px-1.5 font-mono text-[10px]">{active?.drawings.length ?? 0}</span>
    </Button>
    <Button variant="ghost" size="icon-xs" title="Simpan layout" aria-label="Simpan layout" onClick={() => saveCurrent()}><Save /></Button>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto p-0">
        <DialogHeader className="border-b border-border p-5">
          <DialogTitle className="flex items-center gap-2"><PencilRuler className="size-4" />Alat gambar & layout</DialogTitle>
          <DialogDescription>Gambar manual disimpan di browser dan dipisahkan dari sinyal, AI, serta order broker.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 p-5">
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Alat</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tools.map((tool) => <Button key={tool.name} variant="outline" className="justify-start" onClick={() => draw(tool.name, tool.label)}><tool.icon />{tool.label}</Button>)}
            </div>
            <div className="flex gap-2">
              <Input aria-label="Teks gambar" maxLength={240} value={textValue} onChange={(event) => setTextValue(event.target.value)} />
              <Button variant="outline" disabled={!textValue.trim()} onClick={() => draw('simpleAnnotation', 'Teks', textValue.trim())}><TextCursorInput />Letakkan teks</Button>
            </div>
          </section>

          <section className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-medium">Layout tersimpan</h3><p className="text-xs text-muted-foreground">Autosave setelah menggambar, memindah, atau menghapus objek.</p></div>
              <Button size="sm" onClick={() => createLayout('Layout baru')}><Square />Layout baru</Button>
            </div>
            <label className="block text-xs text-muted-foreground" htmlFor="drawing-layout">Pilih layout</label>
            <select id="drawing-layout" aria-label="Pilih layout gambar" className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm" value={activeId} onChange={(event) => activate(event.target.value)}>
              {layouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name} · {layout.symbol} {layout.interval}</option>)}
            </select>
            <div className="flex gap-2">
              <Input aria-label="Nama layout" maxLength={80} value={layoutName} onChange={(event) => setLayoutName(event.target.value)} onBlur={rename} />
              <Button variant="outline" onClick={rename}><Save />Simpan nama</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={duplicate}><Copy />Duplikat</Button>
              <Button variant="outline" size="sm" onClick={() => { changeAll({ lock: !locked }) }}>{locked ? <Unlock /> : <Lock />}{locked ? 'Buka kunci' : 'Kunci semua'}</Button>
              <Button variant="outline" size="sm" onClick={() => { changeAll({ visible: !visible }) }}>{visible ? <EyeOff /> : <Eye />}{visible ? 'Sembunyikan' : 'Tampilkan'}</Button>
              <Button variant="outline" size="sm" onClick={undo}><Redo2 className="rotate-180" />Urungkan terakhir</Button>
              <Button variant="outline" size="sm" onClick={exportLayouts}><Download />Ekspor</Button>
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Import />Impor</Button>
              <input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void importLayouts(event.target.files?.[0])} />
              <Button variant="destructive" size="sm" onClick={clear}><Trash2 />Kosongkan gambar</Button>
              <Button variant="ghost" size="sm" onClick={removeLayout}><Trash2 />Hapus layout</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Maksimal {MAX_LAYOUTS} layout dan {MAX_DRAWINGS} objek per layout. Ekspor JSON untuk backup atau memindahkan layout ke browser lain.</p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </>
}
