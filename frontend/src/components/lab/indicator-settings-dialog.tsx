import { useState } from 'react'
import {
  Sliders,
  Code2,
  Save,
  Play,
  X,
  FileCode,
  Shield,
  Layers,
  HelpCircle,
  Copy,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { selectClass } from './shared'
import type { Item, Schema } from './api'

export interface IndicatorSettingsDialogProps {
  item: Item
  schema?: Schema
  isOpen: boolean
  onClose: () => void
  onSave: (params: Record<string, number>, name: string, description: string) => Promise<void>
  onOpenPineEditor: () => void
  onApplyToChart?: () => void
  busy?: boolean
}

export function IndicatorSettingsDialog({
  item,
  schema,
  isOpen,
  onClose,
  onSave,
  onOpenPineEditor,
  onApplyToChart,
  busy,
}: IndicatorSettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'inputs' | 'style' | 'info'>('inputs')
  const [params, setParams] = useState<Record<string, number>>(item.spec.params ?? {})
  const [name, setName] = useState(item.name)
  const [description, setDescription] = useState(item.spec.description ?? '')

  if (!isOpen) return null

  const isBuiltin = item.builtin
  const isArchived = item.archived

  async function handleSave() {
    await onSave(params, name, description)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-[#0f151f] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header (TradingView Style) */}
        <div className="flex items-center justify-between border-b border-border/80 bg-[#141b26] px-5 py-3.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sliders className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-sm text-foreground truncate">
                Pengaturan: {item.name}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Versi {item.version} · {schema?.label ?? item.spec.kind}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Tutup"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-border/60 bg-[#0d121a] px-5 gap-4">
          <button
            onClick={() => setActiveTab('inputs')}
            className={`py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'inputs'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            🎛️ Input Parameter
          </button>
          <button
            onClick={() => setActiveTab('style')}
            className={`py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'style'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            ⚙️ Mesin & Output
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`py-2.5 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'info'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            ℹ️ Info & Script
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* Inputs Tab */}
          {activeTab === 'inputs' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Nama Indikator
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nama indikator"
                  disabled={isBuiltin}
                  className="bg-[#141b26] border-border"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Parameter Teknis ({schema?.label ?? item.spec.kind})
                </label>
                {schema?.params && Object.keys(schema.params).length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border/60 bg-[#0d121a] p-3.5">
                    {Object.entries(schema.params).map(([key, r]) => (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-mono text-[11px] font-medium text-foreground">
                            {key}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            def: {r.default}
                          </span>
                        </div>
                        <Input
                          type="number"
                          value={params[key] ?? r.default}
                          min={r.min}
                          max={r.max}
                          step={r.type === 'integer' ? 1 : 'any'}
                          disabled={isBuiltin}
                          onChange={(e) =>
                            setParams({
                              ...params,
                              [key]: Number(e.target.value),
                            })
                          }
                          className="h-8 text-xs bg-[#141b26] border-border"
                        />
                        <div className="flex justify-between text-[10px] text-muted-foreground/70">
                          <span>Min: {r.min ?? 0}</span>
                          <span>Max: {r.max ?? '∞'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground italic p-3 rounded bg-[#0d121a] border border-border/40">
                    Indikator ini tidak memerlukan parameter input tambahan.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                  Deskripsi / Catatan Penggunaan
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={isBuiltin}
                  placeholder="Tambahkan catatan cara kerja indikator..."
                  className={`${selectClass} text-xs bg-[#141b26] border-border resize-none`}
                />
              </div>
            </div>
          )}

          {/* Style & Engine Tab */}
          {activeTab === 'style' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-[#0d121a] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">Formula Mesin:</span>
                  <span className="font-mono text-xs text-primary font-bold bg-primary/10 px-2 py-0.5 rounded">
                    {item.spec.kind}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <span className="text-muted-foreground">Outputs Garis:</span>
                  <div className="flex flex-wrap gap-1">
                    {(schema?.outputs ?? ['value']).map((out) => (
                      <span
                        key={out}
                        className="rounded bg-[#1a2332] px-2 py-0.5 font-mono text-[10px] text-foreground"
                      >
                        {out}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <span className="text-muted-foreground">Status Validasi:</span>
                  <span className="font-semibold capitalize text-emerald-400">
                    {item.spec.status ?? 'draft'}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] text-amber-200/90 leading-relaxed">
                💡 <strong>Catatan:</strong> Parameter di atas akan langsung dipakai saat indikator
                diterapkan ke chart historis atau dirakit ke dalam aturan strategi.
              </div>
            </div>
          )}

          {/* Info & Script Tab */}
          {activeTab === 'info' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-[#0d121a] p-4 space-y-2.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Penulis Asli:</span>
                  <span className="font-medium text-foreground">
                    {item.spec.provenance?.author ?? 'AURUM Lab'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-border/40 pt-2">
                  <span className="text-muted-foreground">Lisensi:</span>
                  <span className="font-mono text-xs text-primary">
                    {item.spec.provenance?.license ?? 'Open Source'}
                  </span>
                </div>
                {item.spec.provenance?.source_hash && (
                  <div className="border-t border-border/40 pt-2 text-[10px]">
                    <span className="text-muted-foreground block mb-0.5">SHA-256 Integritas:</span>
                    <span className="font-mono text-muted-foreground break-all">
                      {item.spec.provenance.source_hash}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-[#141b26]">
                <div>
                  <span className="font-medium text-foreground block">Pine Script Source Code</span>
                  <span className="text-[11px] text-muted-foreground">
                    {item.spec.source ? `${item.spec.source.split('\n').length} baris kode` : 'Kode Pine Script terhubung'}
                  </span>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    onClose()
                    onOpenPineEditor()
                  }}
                  className="gap-1.5 text-primary border-primary/30 hover:border-primary"
                >
                  <Code2 className="size-3.5" />
                  Buka di Pine Editor
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/80 bg-[#141b26] px-5 py-3">
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              onClose()
              onOpenPineEditor()
            }}
            className="gap-1.5"
          >
            <Code2 className="size-3.5 text-primary" />
            <span className="hidden sm:inline">Pine Editor</span>
          </Button>

          <div className="flex items-center gap-2">
            {onApplyToChart && (
              <Button
                size="xs"
                variant="outline"
                onClick={onApplyToChart}
                className="gap-1 border-border"
              >
                <Play className="size-3 text-emerald-400" />
                <span>Pratinjau</span>
              </Button>
            )}
            <Button
              size="xs"
              variant="outline"
              onClick={onClose}
            >
              Tutup
            </Button>
            {!isBuiltin && !isArchived && (
              <Button
                size="xs"
                disabled={busy}
                onClick={handleSave}
                className="bg-primary text-primary-foreground gap-1.5"
              >
                <Save className="size-3.5" />
                Simpan
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
