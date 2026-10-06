import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, ChevronRight, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AccountPanel } from "@/components/account-panel";
import { ActivityPanel } from "@/components/activity";
import { AiAnalystCard } from "@/components/ai-analyst-card";
import { AiAutopilotCard } from "@/components/ai-autopilot-card";
import { FundamentalPanel } from "@/components/fundamental-panel";
import { HelpDialog } from "@/components/help-dialog";
import { LogPanel } from "@/components/log-panel";
import { FinancePage } from "@/components/finance-page";
import { TradePanel } from "@/components/trade-panel";
import { SidebarNav, type TabType } from "@/components/sidebar-nav";
import { SymbolDialog } from "@/components/symbol-dialog";
import { WorkspaceHeader } from "@/components/workspace-header";
import { RiskCalculator } from "@/components/risk-calculator";

import { useMarketData } from "@/hooks/useMarketData";
import { useAccountData } from "@/hooks/useAccountData";
import { useSummaryData } from "@/hooks/useSummaryData";
import { useAiAnalysis } from "@/hooks/useAiAnalysis";
import { getJson, number, type Signal } from "@/lib/api";
import { cn } from "@/lib/utils";

const intervals = ["1m", "5m", "15m", "1h", "4h", "1d"];
const LabPanel = lazy(() => import("@/components/lab/lab-panel").then(m => ({default: m.LabPanel})));
const IndicatorManagerPage = lazy(() => import("@/components/lab/indicator-manager-page").then(m => ({default: m.IndicatorManagerPage})));

const MarketChart = lazy(() =>
  import("@/components/market-chart").then((module) => ({
    default: module.MarketChart,
  })),
);

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("workspace");
  const [symbol, setSymbol] = useState("XAUUSDm");
  const [interval, setIntervalValue] = useState("1h");

  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);
  const [now, setNow] = useState(Date.now());

  const market = useMarketData(symbol, interval);
  const accountQuery = useAccountData();
  const summary = useSummaryData();
  const { data: aiAnalysis, loading: aiAnalyzing, error: aiError, runAnalysis } = useAiAnalysis();

  const health = useQuery({
    queryKey: ["health"],
    queryFn: ({ signal }) => getJson<{ status: string }>("/health", signal),
    refetchInterval: 30_000,
  });

  async function handleRunAiAnalysis() {
    try {
      await runAnalysis(symbol, interval);
    } catch {
      // Handled inside hook state
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  const accountAge = accountQuery.data ? (now - Date.parse(accountQuery.data.updated_at)) / 1000 : Infinity;
  const account = !accountQuery.isError && accountAge <= 60 && accountAge >= -10 ? accountQuery.data : undefined;

  const marketData = market.data;
  const last = marketData?.candles.at(-1);
  const first = marketData?.candles[0];
  const change = first && last && first.open !== 0 ? ((last.close - first.open) / first.open) * 100 : null;
  const age = marketData ? (now - Date.parse(marketData.updated_at)) / 1000 : Infinity;
  const stale = market.isError || age > 60 || age < -60;
  const fresh = !!last && !stale;
  const fetching = market.isFetching || summary.isFetching || health.isFetching || accountQuery.isFetching;

  function refresh() {
    void market.refetch();
    void summary.refetch();
    void health.refetch();
    void accountQuery.refetch();
  }

  function chooseSymbol(val: string) {
    setSymbol(val);
    setSelectedSignal(null);
    setSearchOpen(false);
  }

  function viewSignal(signal: Signal) {
    setSymbol(signal.symbol);
    setSelectedSignal(signal);
    setActiveTab("workspace");
    document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" });
  }

  const accountError = accountQuery.isError ? accountQuery.error.message : accountAge > 60 ? "Data akun kedaluwarsa. Menunggu pembaruan terminal." : undefined;

  return (
    <div className="min-h-screen bg-background font-sans text-foreground antialiased selection:bg-primary/20">
      <div className="flex min-h-screen">
        <SidebarNav activeTab={activeTab} onTabChange={setActiveTab} mobileOpen={mobileOpen} onMobileOpenChange={setMobileOpen} onOpenHelp={() => setHelpOpen(true)} />

        <main className="flex-1 min-w-0 flex flex-col">
          <WorkspaceHeader onMobileOpenToggle={() => setMobileOpen(!mobileOpen)} symbol={symbol} interval={interval} fresh={fresh} fetching={fetching} updatedAt={marketData?.updated_at} onRefresh={refresh} />

          <div className="flex-1 space-y-6 p-4 md:p-6">
            {activeTab !== "indicators" && activeTab !== "lab" && activeTab !== "strategies" && (
              <AccountPanel
                account={account}
                loading={accountQuery.isPending}
                error={accountError}
                onOpenFinance={() => setActiveTab("finance")}
              />
            )}

            {activeTab === "workspace" && (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                  <Card id="workspace" className="overflow-hidden scroll-mt-6">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                      <div className="flex items-center gap-3">
                        <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)} className="font-mono text-xs font-semibold" aria-label="Cari instrumen">
                          <Search className="size-3.5" />
                          {symbol}
                          <ChevronRight className="size-3 text-muted-foreground" />
                        </Button>
                        {last && (
                          <div className="flex items-baseline gap-2">
                            <span className="font-mono text-lg font-bold">{number(last.close, 5)}</span>
                            {change !== null && change !== undefined && (
                              <span className={cn("flex items-center text-xs font-medium", change >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                {change >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                                {Math.abs(change).toFixed(2)}%
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 pt-2">
                      <div className="flex gap-1" aria-label="Timeframe">
                        {intervals.map((tf) => (
                          <Button key={tf} size="xs" variant={interval === tf ? "secondary" : "ghost"} onClick={() => setIntervalValue(tf)}>
                            {tf.toUpperCase()}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <Suspense fallback={<div className="flex min-h-[400px] items-center justify-center text-xs text-muted-foreground">Memuat komponen chart…</div>}>
                      {market.isError ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                          <p className="text-xs text-rose-300">Data pasar belum bisa diperbarui.</p>
                          <Button variant="outline" size="sm" onClick={refresh}>
                            <RefreshCw className="size-3" /> Coba hubungkan
                          </Button>
                        </div>
                      ) : !marketData || marketData.candles.length === 0 ? (
                        <div className="flex min-h-[400px] items-center justify-center text-xs text-muted-foreground">Chart siap. Menunggu feed MT5.</div>
                      ) : (
                        <MarketChart
                          market={marketData}
                          signal={selectedSignal}
                          overlays={aiAnalysis?.chart_overlays}
                          currentInterval={interval}
                          onIntervalChange={setIntervalValue}
                          onOpenIndicatorManager={() => setActiveTab("indicators")}
                        />
                      )}
                    </Suspense>
                  </Card>

                  <ActivityPanel data={summary.data} loading={summary.isPending} error={summary.isError} onSignal={viewSignal} />
                </div>

                <div className="space-y-6">
                  <AiAutopilotCard symbol={symbol} interval={interval} />
                  <TradePanel symbol={symbol} currentPrice={last?.close} account={account} />
                  <RiskCalculator account={account} />
                  <AiAnalystCard aiAnalysis={aiAnalysis} aiAnalyzing={aiAnalyzing} aiError={aiError} onRunAnalysis={handleRunAiAnalysis} />
                </div>
              </div>
            )}

            {activeTab === "finance" && <FinancePage account={account} />}

            {activeTab === "activity" && <ActivityPanel data={summary.data} loading={summary.isPending} error={summary.isError} onSignal={viewSignal} />}


            {activeTab === "fundamental" && <FundamentalPanel summary={summary.data} />}

            {activeTab === "logs" && <LogPanel />}
            {activeTab === "indicators" && (
              <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat Manajemen Indikator…</p>}>
                <IndicatorManagerPage />
              </Suspense>
            )}
            {activeTab === "strategies" && (
              <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat Strategi Trading…</p>}>
                <LabPanel mode="strategies" />
              </Suspense>
            )}
            {activeTab === "lab" && (
              <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat Strategy Lab…</p>}>
                <LabPanel mode="full" />
              </Suspense>
            )}
          </div>
        </main>
      </div>

      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} account={account} stale={stale} />

      <SymbolDialog open={searchOpen} onOpenChange={setSearchOpen} currentSymbol={symbol} onSelectSymbol={chooseSymbol} />
    </div>
  );
}
