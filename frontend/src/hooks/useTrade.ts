import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiPost } from '@/api/client'
import type {
  CloseAllResponse,
  ClosePositionParams,
  ClosePositionResponse,
  OrderRequest,
  OrderResponse,
  TradePosition,
} from '@/types/trade'

export function useTrade() {
  const queryClient = useQueryClient()

  const ordersQuery = useQuery<{ orders: OrderResponse[] }>({
    queryKey: ['trade', 'orders'],
    queryFn: () => apiGet<{ orders: OrderResponse[] }>('/api/trade/orders'),
    refetchInterval: 5000,
  })

  const positionsQuery = useQuery<{ positions: TradePosition[] }>({
    queryKey: ['trade', 'positions'],
    queryFn: () => apiGet<{ positions: TradePosition[] }>('/api/trade/positions'),
    refetchInterval: 3000, // Faster refresh for live floating PnL
  })

  const submitOrderMutation = useMutation<OrderResponse, Error, OrderRequest>({
    mutationFn: (order) => apiPost<OrderResponse, OrderRequest>('/api/trade/order', order),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trade'] })
      void queryClient.invalidateQueries({ queryKey: ['account'] })
      void queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
  })

  const closePositionMutation = useMutation<
    ClosePositionResponse,
    Error,
    number | ClosePositionParams
  >({
    mutationFn: (arg) => {
      const ticket = typeof arg === 'number' ? arg : arg.ticket
      const body = typeof arg === 'object' && arg.volume ? { volume: arg.volume } : undefined
      return apiPost<ClosePositionResponse>(`/api/trade/positions/${ticket}/close`, body)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trade'] })
      void queryClient.invalidateQueries({ queryKey: ['account'] })
      void queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
  })

  const closeAllMutation = useMutation<CloseAllResponse, Error, void>({
    mutationFn: () => apiPost<CloseAllResponse>('/api/trade/positions/close-all'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trade'] })
      void queryClient.invalidateQueries({ queryKey: ['account'] })
      void queryClient.invalidateQueries({ queryKey: ['finance'] })
    },
  })

  return {
    orders: ordersQuery.data?.orders ?? [],
    positions: positionsQuery.data?.positions ?? [],
    isLoadingOrders: ordersQuery.isLoading,
    isLoadingPositions: positionsQuery.isLoading,
    submitOrder: submitOrderMutation.mutateAsync,
    isSubmitting: submitOrderMutation.isPending,
    submitError: submitOrderMutation.error?.message ?? null,
    closePosition: closePositionMutation.mutateAsync,
    isClosing: closePositionMutation.isPending,
    closeAllPositions: closeAllMutation.mutateAsync,
    isClosingAll: closeAllMutation.isPending,
  }
}
