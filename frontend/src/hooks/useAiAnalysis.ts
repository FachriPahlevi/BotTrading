import { useState, useCallback } from 'react'
import { apiGet } from '@/api/client'
import type { AiAnalysisResult } from '@/types/ai'

export async function fetchAiAnalysis(
  symbol: string,
  interval: string,
  signal?: AbortSignal,
): Promise<AiAnalysisResult> {
  const query = new URLSearchParams({ symbol, interval }).toString()
  return apiGet<AiAnalysisResult>(`/api/ai/analyze?${query}`, signal)
}

export function useAiAnalysis() {
  const [data, setData] = useState<AiAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runAnalysis = useCallback(async (symbol: string, interval: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAiAnalysis(symbol, interval)
      setData(result)
      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menjalankan analisis AI.'
      setError(msg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    data,
    loading,
    error,
    runAnalysis,
    setData,
  }
}
