"use client";

import { useState, useCallback } from "react";
import { IntentInput } from "@/components/IntentInput";
import { TradePreview } from "@/components/TradePreview";
import { PayoffChart } from "@/components/PayoffChart";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { DebugPanel } from "@/components/DebugPanel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Shield, AlertTriangle } from "lucide-react";
import type { TradeSpec } from "@/lib/schemas";

interface PriceData {
  bid: number | null;
  ask: number | null;
  mark: number;
  index: number;
  spread_percent: number | null;
}

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [tradeSpec, setTradeSpec] = useState<TradeSpec | null>(null);
  const [prices, setPrices] = useState<Map<string, PriceData>>(new Map());
  const [indexPrice, setIndexPrice] = useState(0);
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [calculatedMaxLoss, setCalculatedMaxLoss] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Debug: Log state changes
  console.log('[DEBUG] Home render - tradeSpec:', tradeSpec ? 'exists' : 'null', 'prices:', prices.size, 'indexPrice:', indexPrice);

  const handleTradeSpecParsed = (spec: unknown) => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:29',message:'handleTradeSpecParsed entry',data:{specType:typeof spec,hasUnderlying:!!(spec as any)?.underlying,legsCount:(spec as any)?.legs?.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    console.log('[DEBUG] handleTradeSpecParsed called with:', spec);
    setTradeSpec(spec as TradeSpec);
    console.log('[DEBUG] setTradeSpec called, tradeSpec state should update');
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:31',message:'setTradeSpec called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
  };

  const handlePricesLoaded = useCallback(
    (newPrices: Map<string, PriceData>, newIndexPrice: number, newEstimatedCost: number, newCalculatedMaxLoss: number) => {
      setPrices(newPrices);
      setIndexPrice(newIndexPrice);
      setEstimatedCost(newEstimatedCost);
      setCalculatedMaxLoss(newCalculatedMaxLoss);
    },
    []
  );

  const handleExecute = async () => {
    // The actual execution happens in the modal
  };

  const handleReset = () => {
    setTradeSpec(null);
    setPrices(new Map());
    setIndexPrice(0);
    setEstimatedCost(0);
    setCalculatedMaxLoss(0);
  };

  // Safety check - can we execute?
  const canExecute =
    tradeSpec &&
    prices.size > 0 &&
    Math.abs(estimatedCost) <= 200 &&
    Math.max(...(tradeSpec?.legs.map((l) => l.amount) || [0])) <= 1;

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-900/30 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600">
                <Zap className="h-5 w-5 text-zinc-900" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-zinc-100">
                  Intent Options
                </h1>
                <p className="text-xs text-zinc-500">Lyra Mainnet</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className="border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
              >
                <Shield className="mr-1 h-3 w-3" />
                SAFE MODE
              </Badge>
              <Badge
                variant="outline"
                className="border-amber-500/50 bg-amber-500/10 text-amber-400"
              >
                <div className="mr-1 h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                Mainnet
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Safety Banner */}
      <div className="border-b border-amber-500/20 bg-amber-500/5">
        <div className="container mx-auto px-4 py-2">
          <div className="flex items-center justify-center gap-2 text-sm text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span>
              Safety limits active: Max $200 per trade, max 1 contract per leg, limit orders only
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-6xl">
          {/* Two column layout when trade is parsed */}
          {tradeSpec ? (
            <div className="space-y-6">
              {/* Reset / New Trade button */}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  className="border-zinc-700 bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  New Trade
                </Button>
              </div>

              {/* Grid layout */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Left: Trade Preview */}
                <TradePreview
                  tradeSpec={tradeSpec}
                  onPricesLoaded={handlePricesLoaded}
                />

                {/* Right: Payoff Chart */}
                {prices.size > 0 && indexPrice > 0 && (
                  <PayoffChart
                    tradeSpec={tradeSpec}
                    prices={prices}
                    indexPrice={indexPrice}
                  />
                )}
              </div>

              {/* Execute Button */}
              <div className="flex justify-center pt-4">
                <Button
                  size="lg"
                  onClick={() => setShowConfirmation(true)}
                  disabled={!canExecute}
                  className="min-w-[200px] bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-900 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
                >
                  <Zap className="mr-2 h-4 w-4" />
                  Review & Execute
                </Button>
              </div>

              {!canExecute && tradeSpec && (
                <p className="text-center text-sm text-red-400">
                  Trade exceeds safety limits. Adjust your intent to proceed.
                </p>
              )}
            </div>
          ) : (
            /* Single column for intent input */
            <div className="mx-auto max-w-2xl">
              <div className="mb-8 text-center">
                <h2 className="text-3xl font-bold text-zinc-100">
                  Trade Options with Natural Language
                </h2>
                <p className="mt-2 text-zinc-400">
                  Describe your trade intent and we&apos;ll parse it into executable options trades on Lyra.
                </p>
              </div>
              <IntentInput
                onTradeSpecParsed={handleTradeSpecParsed}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
              />
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {tradeSpec && (
        <ConfirmationModal
          isOpen={showConfirmation}
          onClose={() => setShowConfirmation(false)}
          tradeSpec={tradeSpec}
          estimatedCost={estimatedCost}
          calculatedMaxLoss={calculatedMaxLoss}
          onExecute={handleExecute}
        />
      )}

      {/* Debug Panel */}
      <DebugPanel />
    </main>
  );
}
