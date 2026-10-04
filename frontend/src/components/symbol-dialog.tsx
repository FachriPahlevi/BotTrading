import { useState } from 'react'
import { Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SymbolDialog({
  open,
  onOpenChange,
  currentSymbol,
  onSelectSymbol,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentSymbol: string
  onSelectSymbol: (symbol: string) => void
}) {
  const [draftSymbol, setDraftSymbol] = useState('')
  const [symbolError, setSymbolError] = useState('')

  const presets = [
    { symbol: 'XAUUSDm', name: 'Gold vs US Dollar', category: 'Metals' },
    { symbol: 'EURUSDm', name: 'Euro vs US Dollar', category: 'Forex' },
    { symbol: 'GBPUSDm', name: 'British Pound vs US Dollar', category: 'Forex' },
    { symbol: 'BTCUSDm', name: 'Bitcoin vs US Dollar', category: 'Crypto' },
  ]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = draftSymbol.trim()
    if (!value) {
      setSymbolError('Silakan masukkan simbol instrumen.')
      return
    }
    if (!/^[a-zA-Z0-9]{1,20}$/.test(value)) {
      setSymbolError('Gunakan 1–20 huruf atau angka sesuai simbol pada MT5.')
      return
    }
    setSymbolError('')
    onSelectSymbol(value)
    setDraftSymbol('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search className="size-4 text-primary" /> Cari instrumen MT5
          </DialogTitle>
          <DialogDescription>
            Ketik simbol instrumen persis sesuai yang ada pada terminal MT5 Anda.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="symbol-input">Simbol MT5</Label>
            <Input
              id="symbol-input"
              placeholder="Misal: XAUUSDm, EURUSDm, BTCUSDm"
              value={draftSymbol}
              onChange={(e) => setDraftSymbol(e.target.value)}
            />
            {symbolError && (
              <p role="alert" className="text-xs text-rose-300">
                {symbolError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">Pilihan cepat:</p>
            <div className="grid grid-cols-2 gap-2">
              {presets.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  className={`flex items-center justify-between rounded-md border p-2 text-left text-xs transition-colors ${
                    currentSymbol === item.symbol
                      ? 'border-primary/40 bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:bg-muted/50 text-foreground'
                  }`}
                  onClick={() => {
                    onSelectSymbol(item.symbol)
                    setDraftSymbol('')
                    onOpenChange(false)
                  }}
                >
                  <span className="font-mono">{item.symbol}</span>
                  <Badge variant="outline" className="text-[8px]">
                    {item.category}
                  </Badge>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit">Buka chart</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
