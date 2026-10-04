import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/client'
import type { Summary } from '@/types/signal'

export async function fetchSummaryData(signal?: AbortSignal): Promise<Summary> {
  return apiGet<Summary>('/api/dashboard/summary', signal)
}

export function useSummaryData() {
  return useQuery<Summary, Error>({
    queryKey: ['summary'],
    queryFn: ({ signal }) => fetchSummaryData(signal),
    refetchInterval: 5000,
    retry: 1,
  })
}
