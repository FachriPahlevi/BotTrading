import { useState, useRef, useEffect, type ChangeEvent, type KeyboardEvent } from 'react'
import {
  Code2,
  Copy,
  Check,
  Download,
  FileCode,
  FileUp,
  Play,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { selectClass } from './shared'
import { requestText, type Schema } from './api'

const PINE_TEMPLATES = [
  {
    id: 'boswaves',
    name: 'BOSWaves Trend Target Ribbon (Pine v6)',
    engine: 'boswaves_core',
    code: '',
  },
  {
    id: 'blank',
    name: 'Indikator Kosong (Pine v5)',
    engine: 'ema',
    code: `//@version=5
indicator("Indikator Kustom Baru", overlay=true)

// Parameter input
length = input.int(20, minval=1, title="Panjang Periode")
src = input.source(close, title="Sumber Harga")

// Perhitungan indikator
ma = ta.ema(src, length)

// Gambar garis pada chart
plot(ma, color=color.aqua, title="MA Line", linewidth=2)
`,
  },
  {
    id: 'ribbon',
    name: 'Trend Moving Average Ribbon',
    engine: 'ema',
    code: `//@version=5
indicator("MA Ribbon Trend", overlay=true)

fastLen = input.int(20, minval=1, title="Fast EMA")
slowLen = input.int(50, minval=1, title="Slow EMA")
src = input.source(close, title="Sumber")

fastMA = ta.ema(src, fastLen)
slowMA = ta.ema(src, slowLen)

bullishCross = ta.crossover(fastMA, slowMA)
bearishCross = ta.crossunder(fastMA, slowMA)

plot(fastMA, color=color.green, title="Fast EMA", linewidth=2)
plot(slowMA, color=color.red, title="Slow EMA", linewidth=2)
`,
  },
  {
    id: 'rsi',
    name: 'RSI Momentum Oscillator',
    engine: 'rsi',
    code: `//@version=5
indicator("RSI Momentum Oscillator", overlay=false)

len = input.int(14, minval=1, title="RSI Length")
src = input.source(close, title="Source")

up = ta.rma(math.max(ta.change(src), 0), len)
down = ta.rma(-math.min(ta.change(src), 0), len)
rsiValue = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))

plot(rsiValue, title="RSI", color=color.purple, linewidth=2)
hUpper = hline(70, "Overbought", color=color.red)
hLower = hline(30, "Oversold", color=color.green)
fill(hUpper, hLower, color=color.rgb(128, 0, 128, 90))
`,
  },
  {
    id: 'bollinger',
    name: 'Bollinger Bands Volatility',
    engine: 'bollinger',
    code: `//@version=5
indicator("Bollinger Bands Pro", overlay=true)

length = input.int(20, minval=1, title="BB Period")
mult = input.float(2.0, minval=0.1, maxval=5.0, title="StdDev Multiplier")
src = input.source(close, title="Source")

basis = ta.sma(src, length)
dev = mult * ta.stdev(src, length)
upper = basis + dev
lower = basis - dev

plot(basis, color=color.blue, title="Basis")
p1 = plot(upper, color=color.teal, title="Upper Band")
p2 = plot(lower, color=color.teal, title="Lower Band")
fill(p1, p2, color=color.rgb(0, 150, 136, 90))
`,
  },
]

export interface PineEditorProps {
  code: string
  onChange: (code: string) => void
  name: string
  onNameChange: (name: string) => void
  engine: string
  onEngineChange: (engine: string) => void
  schemas: Record<string, Schema>
  author: string
  onAuthorChange: (author: string) => void
  license: string
  onLicenseChange: (license: string) => void
  description: string
  onDescriptionChange: (desc: string) => void
  onSave: () => void
  onSwitchToInterface?: () => void
  onApplyToChart?: () => void
  canSave: boolean
  busy?: boolean
  isBuiltin?: boolean
}

export function PineEditor({
  code,
  onChange,
  name,
  onNameChange,
  engine,
  onEngineChange,
  schemas,
  author,
  onAuthorChange,
  license,
  onLicenseChange,
  description,
  onDescriptionChange,
  onSave,
  onSwitchToInterface,
  onApplyToChart,
  canSave,
  busy,
  isBuiltin,
}: PineEditorProps) {
  const [copied, setCopied] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)

  // Sync scrolling between line numbers gutter and textarea
  function handleScroll() {
    if (textareaRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop
    }
  }

  // Handle Tab key inside code editor
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const spaces = '  '
      const newCode = code.substring(0, start) + spaces + code.substring(end)
      onChange(newCode)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + spaces.length
        }
      }, 0)
    }
  }

  // Load template
  function applyTemplate(templateId: string) {
    if (templateId === 'boswaves') {
      void (async () => {
        try {
          const text = await requestText('/example-source')
          if (text) {
            onChange(text)
            onNameChange('Trend Target Ribbon [BOSWaves]')
            if (schemas['boswaves_core']) {
              onEngineChange('boswaves_core')
            }
            onAuthorChange('BOSWaves')
            onLicenseChange('MPL-2.0')
            onDescriptionChange(
              'Trend Target Ribbon [BOSWaves], Pine Script v6. Numerical trend and stop structure.',
            )
          }
        } catch {
          // ignore error
        }
      })()
      setSelectedTemplate('')
      return
    }
    const t = PINE_TEMPLATES.find((item) => item.id === templateId)
    if (!t) return
    onChange(t.code)
    onNameChange(t.name)
    if (schemas[t.engine]) {
      onEngineChange(t.engine)
    }
    setSelectedTemplate('')
  }

  // Handle file import
  function handleFileImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const content = evt.target?.result as string
      if (!content) return
      onChange(content)

      // Try extracting indicator title: indicator("Title", ...) or study("Title", ...)
      const match = content.match(/(?:indicator|study)\s*\(\s*["']([^"']+)["']/i)
      if (match && match[1]) {
        onNameChange(match[1])
      } else {
        onNameChange(file.name.replace(/\.[^/.]+$/, ''))
      }
    }
    reader.readAsText(file)
  }

  // Copy code
  function handleCopy() {
    void navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Download .pine file
  function handleDownload() {
    const filename = `${(name || 'indicator').replace(/[^a-zA-Z0-9_-]/g, '_')}.pine`
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const lines = code.split('\n')
  const lineCount = Math.max(lines.length, 1)

  // Detect Pine version
  const versionMatch = code.match(/\/\/@version=(\d+)/)
  const pineVersion = versionMatch ? `v${versionMatch[1]}` : 'v5'

  return (
    <div className="flex flex-col rounded-xl border border-border bg-[#0a0e14] shadow-xl overflow-hidden">
      {/* Top Editor Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-[#111722] px-4 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Code2 className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wide text-foreground">Pine Editor</span>
              <span className="rounded bg-primary/20 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-primary">
                {pineVersion}
              </span>
              {isBuiltin && (
                <span className="rounded bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-medium text-amber-300">
                  Read-only Bawaan
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">
              {name || 'Indikator Kustom'}
            </p>
          </div>
        </div>

        {/* Toolbar Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {onSwitchToInterface && (
            <Button
              size="xs"
              variant="outline"
              onClick={onSwitchToInterface}
              className="gap-1.5 border-border bg-[#18202d] text-foreground hover:bg-[#222c3e]"
              title="Beralih ke tampilan formulir pengaturan parameter"
            >
              <Sliders className="size-3.5 text-primary" />
              <span className="hidden sm:inline">Pengaturan Interface</span>
            </Button>
          )}

          {/* Template Picker */}
          <select
            className={`${selectClass} h-7 py-0 px-2 text-xs w-auto bg-[#18202d] border-border text-foreground`}
            value={selectedTemplate}
            onChange={(e) => applyTemplate(e.target.value)}
          >
            <option value="">➕ Muat Template...</option>
            {PINE_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          {/* Open/Import File */}
          <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border border-border bg-[#18202d] px-2 text-xs font-medium text-foreground hover:bg-[#222c3e] transition-colors">
            <FileUp className="size-3.5 text-muted-foreground" />
            <span className="hidden sm:inline">Impor .pine</span>
            <input
              type="file"
              accept=".pine,.txt"
              className="hidden"
              onChange={handleFileImport}
            />
          </label>

          {/* Copy Button */}
          <Button
            size="xs"
            variant="ghost"
            onClick={handleCopy}
            className="h-7 px-2 text-xs gap-1"
            title="Salin kode script ke clipboard"
          >
            {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            <span className="hidden sm:inline">{copied ? 'Tersalin' : 'Salin'}</span>
          </Button>

          {/* Download Button */}
          <Button
            size="xs"
            variant="ghost"
            onClick={handleDownload}
            className="h-7 px-2 text-xs gap-1"
            title="Unduh berkas .pine"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Unduh</span>
          </Button>

          {/* Save Button */}
          <Button
            size="xs"
            disabled={!canSave || busy || isBuiltin}
            onClick={onSave}
            className="h-7 gap-1.5 bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Save className="size-3.5" />
            <span>Simpan Script</span>
          </Button>
        </div>
      </div>

      {/* Indicator Metadata Bar (Name, Mesin, Author) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-b border-border/60 bg-[#0d131b] p-3 text-xs">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Nama Indikator</label>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="mis. My Trend Indicator"
            className="h-7 text-xs bg-[#111722] border-border mt-0.5"
            disabled={isBuiltin}
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Mesin Kalkulasi (Engine)</label>
          <select
            value={engine}
            onChange={(e) => onEngineChange(e.target.value)}
            className={`${selectClass} h-7 py-0 text-xs bg-[#111722] border-border mt-0.5`}
            disabled={isBuiltin}
          >
            {Object.entries(schemas).map(([k, s]) => (
              <option key={k} value={k}>
                {s.label} ({k})
              </option>
            ))}
            <option value="source_only">Source tersimpan (Review Only)</option>
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Lisensi & Penulis</label>
          <div className="flex gap-1 mt-0.5">
            <Input
              value={author}
              onChange={(e) => onAuthorChange(e.target.value)}
              placeholder="Penulis"
              className="h-7 text-xs bg-[#111722] border-border"
              disabled={isBuiltin}
            />
            <Input
              value={license}
              onChange={(e) => onLicenseChange(e.target.value)}
              placeholder="Lisensi (MPL-2.0 / MIT)"
              className="h-7 text-xs bg-[#111722] border-border w-24"
              disabled={isBuiltin}
            />
          </div>
        </div>
      </div>

      {/* Code Editor Body with Gutter */}
      <div className="relative flex flex-1 min-h-[360px] max-h-[560px] bg-[#070a0f] font-mono text-xs">
        {/* Line Numbers Gutter */}
        <div
          ref={gutterRef}
          aria-hidden="true"
          className="select-none overflow-hidden border-r border-border/40 bg-[#090d14] px-2.5 py-3 text-right font-mono text-[11px] leading-5 text-muted-foreground/50 w-12 shrink-0"
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code Textarea */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          placeholder="// Tulis atau paste script Pine Script v5 Anda di sini...&#10;//@version=5&#10;indicator('Nama Indikator', overlay=true)"
          disabled={isBuiltin}
          className="flex-1 resize-none bg-transparent p-3 font-mono text-xs leading-5 text-[#e6edf3] outline-none placeholder:text-muted-foreground/40 selection:bg-primary/30"
          style={{ tabSize: 2 }}
        />
      </div>

      {/* Status Bar & Diagnostics */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/80 bg-[#0d131b] px-4 py-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 font-mono">
            <span className="text-foreground font-semibold">{lineCount}</span> baris
          </span>
          <span className="flex items-center gap-1 font-mono">
            <span className="text-foreground font-semibold">{code.length}</span> karakter
          </span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Editor Siap
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onApplyToChart && (
            <Button
              size="xs"
              variant="outline"
              onClick={onApplyToChart}
              className="h-6 text-[11px] gap-1 border-primary/30 hover:border-primary text-primary"
            >
              <Play className="size-3" />
              Terapkan ke Chart
            </Button>
          )}
          <span className="font-mono text-[10px] text-muted-foreground/60">
            UTF-8 · Pine Script
          </span>
        </div>
      </div>
    </div>
  )
}
