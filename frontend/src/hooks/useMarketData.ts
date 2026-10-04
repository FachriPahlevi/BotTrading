import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/client'
import type { Candle, Market } from '@/types/market'

export function getScalpingPollingInterval(interval: string): number {
  const norm = interval.toLowerCase()
  if (norm === '1m' || norm === '5m') return 1000 // 1s fast-polling for scalping
  if (norm === '15m' || norm === '1h') return 2000 // 2s polling
  return 5000 // 5s for higher timeframes
}

export async function fetchMarketData(
  symbol: string,
  interval: string,
  signal?: AbortSignal,
): Promise<Market> {
  const query = new URLSearchParams({ symbol, interval, limit: '300' }).toString()
  const data = await apiGet<Market>(`/api/market/chart?${query}`, signal)

  if (
    !Array.isArray(data.candles) ||
    typeof data.symbol !== 'string' ||
    !Number.isFinite(Date.parse(data.updated_at))
  ) {
    throw new Error('Format data chart tidak valid.')
  }

  const byTime = new Map<number, Candle>()
  for (const candle of data.candles) {
    if (
      ![candle.time, candle.open, candle.high, candle.low, candle.close].every(
        Number.isFinite,
      ) ||
      candle.time <= 0 ||
      candle.low > Math.min(candle.open, candle.close) ||
      candle.high < Math.max(candle.open, candle.close) ||
      candle.low > candle.high
    ) {
      throw new Error('Data candle tidak valid. Chart tidak diperbarui.')
    }
    byTime.set(candle.time, {
      ...candle,
      volume: Number.isFinite(candle.volume) ? candle.volume : 0,
    })
  }

  return {
    ...data,
    candles: [...byTime.values()].sort((a, b) => a.time - b.time),
  }
}

export function useMarketData(symbol: string, interval: string) {
  const pollingInterval = getScalpingPollingInterval(interval)

  return useQuery<Market, Error>({
    queryKey: ['market', symbol, interval],
    queryFn: ({ signal }) => fetchMarketData(symbol, interval, signal),
    refetchInterval: pollingInterval,
    refetchIntervalInBackground: true,
    staleTime: 1000,
    gcTime: 1000 * 60 * 5,
    retry: 1,
  })
}
