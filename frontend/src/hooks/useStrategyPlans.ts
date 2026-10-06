import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost, apiDelete } from '@/api/client'
import type { StrategyPlanRecord, StrategyPlanPayload } from '@/types/strategy'

const LOCAL_STORAGE_KEY = 'aurum.saved.strategy.plans'

function getLocalPlans(): StrategyPlanRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalPlans(plans: StrategyPlanRecord[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(plans))
  } catch {
    // Ignore storage errors
  }
}

export function useStrategyPlans() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['strategy-plans'],
    queryFn: async () => {
      try {
        const remote = await apiGet<StrategyPlanRecord[]>('/api/strategy-plans')
        if (remote && remote.length > 0) {
          saveLocalPlans(remote)
          return remote
        }
      } catch (err) {
        console.warn('Backend strategy-plans fetch failed, using local cache:', err)
      }
      return getLocalPlans()
    },
    staleTime: 10_000,
  })

  const saveMutation = useMutation({
    mutationFn: async (plan: {
      id?: string
      title: string
      symbol: string
      interval: string
      bias: string
      status?: string
      payload: StrategyPlanPayload
    }) => {
      try {
        const res = await apiPost<StrategyPlanRecord>('/api/strategy-plans', plan)
        return res
      } catch (err) {
        console.warn('Backend save failed, saving to localStorage:', err)
        const local = getLocalPlans()
        const newRecord: StrategyPlanRecord = {
          id: plan.id || `plan-local-${Date.now()}`,
          title: plan.title,
          symbol: plan.symbol,
          interval: plan.interval,
          bias: plan.bias,
          status: (plan.status as 'active') || 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          payload: plan.payload,
        }
        const updated = [newRecord, ...local.filter((p) => p.id !== newRecord.id)]
        saveLocalPlans(updated)
        return newRecord
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy-plans'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      try {
        await apiDelete(`/api/strategy-plans/${id}`)
      } catch (err) {
        console.warn('Backend delete failed, removing from localStorage:', err)
      }
      const local = getLocalPlans().filter((p) => p.id !== id)
      saveLocalPlans(local)
      return id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy-plans'] })
    },
  })

  return {
    plans: query.data || [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    savePlan: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    deletePlan: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  }
}
