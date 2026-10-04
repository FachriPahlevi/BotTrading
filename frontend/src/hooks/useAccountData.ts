import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/client'
import type { TerminalAccount } from '@/types/account'

export async function fetchAccountData(signal?: AbortSignal): Promise<TerminalAccount> {
  const data = await apiGet<TerminalAccount>('/api/account', signal)

  if (
    !data ||
    !['login', 'name', 'company', 'server', 'currency'].every(
      (key) => typeof data[key as keyof TerminalAccount] === 'string' && String(data[key as keyof TerminalAccount]).length > 0,
    ) ||
    !['balance', 'equity', 'profit', 'credit', 'margin', 'margin_free', 'leverage', 'positions_count'].every(
      (key) => typeof data[key as keyof TerminalAccount] === 'number' && Number.isFinite(data[key as keyof TerminalAccount]),
    ) ||
    !['DEMO', 'REAL', 'CONTEST'].includes(data.trade_mode) ||
    !Number.isFinite(Date.parse(data.updated_at)) ||
    data.connected !== true ||
    (data.margin_level !== null && !Number.isFinite(data.margin_level))
  ) {
    throw new Error('Data akun MT5 tidak valid atau terminal terputus.')
  }

  return data
}

export function useAccountData() {
  return useQuery<TerminalAccount, Error>({
    queryKey: ['account'],
    queryFn: ({ signal }) => fetchAccountData(signal),
    refetchInterval: 2000,
    staleTime: 0,
    retry: 1,
  })
}
