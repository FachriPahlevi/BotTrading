import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/client'
import type { Diagnostics } from '@/types/diagnostics'

export async function fetchDiagnosticsData(signal?: AbortSignal): Promise<Diagnostics> {
  return apiGet<Diagnostics>('/api/diagnostics', signal)
}

export function useDiagnosticsData(paused = false) {
  return useQuery<Diagnostics, Error>({
    queryKey: ['diagnostics'],
    queryFn: ({ signal }) => fetchDiagnosticsData(signal),
    refetchInterval: paused ? false : 5000,
    refetchOnWindowFocus: !paused,
    retry: false,
  })
}
