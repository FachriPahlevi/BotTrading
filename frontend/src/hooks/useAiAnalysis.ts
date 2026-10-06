import { useState, useCallback } from 'react'
import { apiGet } from '@/api/client'
import type { AiAnalysisResult } from '@/types/ai'

export async function fetchAiAnalysis(
  symbol: string,
  interval: string,
  agents?: string[] | string,
  signal?: AbortSignal,
): Promise<AiAnalysisResult> {
  const params: Record<string, string> = {
    symbol,
    interval: interval.trim().toLowerCase(),
  }
  if (agents) {
    params.agents = Array.isArray(agents) ? agents.join(',') : agents
  }
  const query = new URLSearchParams(params).toString()
  return apiGet<AiAnalysisResult>(`/api/ai/analyze?${query}`, signal)
}

export function useAiAnalysis() {
  const [data, setData] = useState<AiAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([
    'gemini',
    'claude',
    'rule_based',
  ])

  const runAnalysis = useCallback(
    async (symbol: string, interval: string, agents?: string[] | string) => {
      setLoading(true)
      setError(null)
      try {
        const targetAgents = agents ?? selectedAgents
        const result = await fetchAiAnalysis(symbol, interval, targetAgents)
        setData(result)
        return result
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Gagal menjalankan analisis AI.'
        setError(msg)
        throw err
      } finally {
        setLoading(false)
      }
    },
    [selectedAgents]
  )

  return {
    data,
    loading,
    error,
    selectedAgents,
    setSelectedAgents,
    runAnalysis,
    setData,
  }
}
