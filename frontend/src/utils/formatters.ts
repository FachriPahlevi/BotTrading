export function number(value: number | null | undefined, digits = 2): string {
  return value == null || !Number.isFinite(value)
    ? '—'
    : new Intl.NumberFormat('en-US', {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value)
}

export function accountMoney(value: number | undefined, currency?: string): string {
  return value == null ? '—' : `${number(value)} ${currency ?? ''}`.trim()
}

export function dateTime(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Belum tersedia'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
