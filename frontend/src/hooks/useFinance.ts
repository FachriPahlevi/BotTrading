import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/api/client'
import type { FinanceOverview, FinancePeriod, PendingOrder } from '@/types/finance'

export function useFinance(
  period: FinancePeriod = 'daily',
  startDate?: string,
  endDate?: string,
) {
  const queryParams = new URLSearchParams({ period })
  if (startDate) queryParams.set('start_date', startDate)
  if (endDate) queryParams.set('end_date', endDate)

  const overviewQuery = useQuery<FinanceOverview>({
    queryKey: ['finance', 'overview', period, startDate, endDate],
    queryFn: () => apiGet<FinanceOverview>(`/api/finance/overview?${queryParams.toString()}`),
    refetchInterval: 5000,
  })

  const pendingOrdersQuery = useQuery<{ orders: PendingOrder[] }>({
    queryKey: ['finance', 'pending-orders'],
    queryFn: () => apiGet<{ orders: PendingOrder[] }>('/api/finance/pending-orders'),
    refetchInterval: 5000,
  })

  return {
    overview: overviewQuery.data,
    isLoadingOverview: overviewQuery.isLoading,
    isErrorOverview: overviewQuery.isError,
    pendingOrders: pendingOrdersQuery.data?.orders ?? [],
    isLoadingPending: pendingOrdersQuery.isLoading,
    refetchFinance: () => {
      void overviewQuery.refetch()
      void pendingOrdersQuery.refetch()
    },
  }
}
