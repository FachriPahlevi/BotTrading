import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/api/client'
import type { AutopilotStartPayload, AutopilotStatus } from '@/types/autopilot'

export function useAutopilot() {
  const queryClient = useQueryClient()

  const statusQuery = useQuery<AutopilotStatus>({
    queryKey: ['autopilot', 'status'],
    queryFn: () => apiGet<AutopilotStatus>('/api/autopilot/status'),
    refetchInterval: 3000,
  })

  const startMutation = useMutation<{ success: boolean; data: AutopilotStatus }, Error, AutopilotStartPayload>({
    mutationFn: (payload) => apiPost<{ success: boolean; data: AutopilotStatus }, AutopilotStartPayload>('/api/autopilot/start', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['autopilot'] })
      void queryClient.invalidateQueries({ queryKey: ['trade'] })
      void queryClient.invalidateQueries({ queryKey: ['account'] })
    },
  })

  const pauseMutation = useMutation<{ success: boolean; data: AutopilotStatus }, Error, void>({
    mutationFn: () => apiPost<{ success: boolean; data: AutopilotStatus }>('/api/autopilot/pause'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['autopilot'] })
    },
  })

  const stopMutation = useMutation<{ success: boolean; data: AutopilotStatus }, Error, { close_positions?: boolean }>({
    mutationFn: (payload) => apiPost<{ success: boolean; data: AutopilotStatus }, { close_positions?: boolean }>('/api/autopilot/stop', payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['autopilot'] })
      void queryClient.invalidateQueries({ queryKey: ['trade'] })
      void queryClient.invalidateQueries({ queryKey: ['account'] })
    },
  })

  const stepMutation = useMutation<{ success: boolean; data: AutopilotStatus }, Error, void>({
    mutationFn: () => apiPost<{ success: boolean; data: AutopilotStatus }>('/api/autopilot/step'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['autopilot'] })
      void queryClient.invalidateQueries({ queryKey: ['trade'] })
    },
  })

  return {
    status: statusQuery.data,
    isLoading: statusQuery.isLoading,
    isError: statusQuery.isError,
    startAutopilot: startMutation.mutateAsync,
    isStarting: startMutation.isPending,
    pauseAutopilot: pauseMutation.mutateAsync,
    isPausing: pauseMutation.isPending,
    stopAutopilot: stopMutation.mutateAsync,
    isStopping: stopMutation.isPending,
    stepAutopilot: stepMutation.mutateAsync,
    isStepping: stepMutation.isPending,
  }
}
