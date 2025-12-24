"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import type { TradeSpec } from "@/lib/schemas";
import { calculatePayoff } from "@/lib/payoff";
import { debugLogger } from "@/lib/debug-logger";

interface PriceData {
  bid: number | null;
  ask: number | null;
  mark: number;
  index: number;
  spread_percent: number | null;
}

interface TradePreviewProps {
  tradeSpec: TradeSpec;
  onPricesLoaded: (
    prices: Map<string, PriceData>,
    indexPrice: number,
    estimatedCost: number,
    calculatedMaxLoss: number
  ) => void;
}

export function TradePreview({ tradeSpec, onPricesLoaded }: TradePreviewProps) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [indexPrice, setIndexPrice] = useState<number | null>(null);
  const [calculatedMaxLoss, setCalculatedMaxLoss] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    debugLogger.info('TradePreview', `Loading prices for ${tradeSpec.underlying}`, { 
      legs: tradeSpec.legs.map(l => l.instrument_name) 
    });
    
    const fetchPrices = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch index price
        const indexStartTime = Date.now();
        debugLogger.apiCall('Lyra', `GET /api/get-prices?underlying=${tradeSpec.underlying}`);
        
        const indexResponse = await fetch(
          `/api/get-prices?underlying=${tradeSpec.underlying}`
        );
        const indexData = await indexResponse.json();
        
        debugLogger.apiResponse('Lyra', `Index price: $${indexData.index_price?.toFixed(2)}`, {
          underlying: tradeSpec.underlying,
          index_price: indexData.index_price,
        }, Date.now() - indexStartTime);
        
        if (indexData.success) {
          setIndexPrice(indexData.index_price);
        }

        // Fetch option prices
        const instrumentNames = tradeSpec.legs.map((leg) => leg.instrument_name);
        const pricesStartTime = Date.now();
        debugLogger.apiCall('Lyra', `POST /api/get-prices (${instrumentNames.length} instruments)`, { instrumentNames });
        
        const pricesResponse = await fetch("/api/get-prices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instrument_names: instrumentNames }),
        });

        const pricesData = await pricesResponse.json();
        
        debugLogger.apiResponse('Lyra', `Got prices for ${Object.keys(pricesData.prices || {}).length} instruments`, {
          instruments: Object.keys(pricesData.prices || {}),
          sample: pricesData.prices ? Object.entries(pricesData.prices)[0] : null,
        }, Date.now() - pricesStartTime);
        if (!pricesResponse.ok) {
          throw new Error(pricesData.details || "Failed to fetch prices");
        }

        setPrices(pricesData.prices);

        // Calculate estimated cost and build premiums map for payoff calculation
        let estimatedCost = 0;
        const pricesMap = new Map<string, PriceData>();
        const premiumsMap = new Map<string, number>(); // For payoff calculation
        const idxPrice = indexData.index_price || 0;
        
        for (const leg of tradeSpec.legs) {
          const price = pricesData.prices[leg.instrument_name];
          if (price) {
            pricesMap.set(leg.instrument_name, price);
            
            // Use ask for buys, bid for sells. Fall back to mark if bid/ask is 0 or null
            let pricePerContract: number;
            if (leg.side === "buy") {
              pricePerContract = (price.ask && price.ask > 0) ? price.ask : price.mark;
            } else {
              pricePerContract = (price.bid && price.bid > 0) ? price.bid : price.mark;
            }
            
            // Store premium for payoff calculation (always use mark for consistent payoff calc)
            premiumsMap.set(leg.instrument_name, price.mark);
            
            // Option prices on Lyra are already in USD (quote currency), no need to multiply by index
            const legCostUsd = pricePerContract * leg.amount;
            if (leg.side === "buy") {
              estimatedCost += legCostUsd;
            } else {
              estimatedCost -= legCostUsd;
            }
          }
        }

        // Calculate actual max loss from payoff analysis using real prices
        const payoffAnalysis = calculatePayoff(tradeSpec, premiumsMap, idxPrice);
        const realMaxLoss = payoffAnalysis.maxLoss;
        setCalculatedMaxLoss(realMaxLoss);

        debugLogger.info('TradePreview', `Calculated: Cost=$${estimatedCost.toFixed(2)}, MaxLoss=$${realMaxLoss.toFixed(2)}`, {
          estimatedCost,
          maxLoss: realMaxLoss,
          breakevens: payoffAnalysis.breakevens,
        });

        onPricesLoaded(pricesMap, indexData.index_price || 0, estimatedCost, realMaxLoss);
      } catch (err) {
        debugLogger.error('TradePreview', err instanceof Error ? err.message : String(err));
        setError(err instanceof Error ? err.message : "Failed to fetch prices");
      } finally {
        setLoading(false);
      }
    };

    fetchPrices();
  }, [tradeSpec, onPricesLoaded]);

  // Calculate total estimated cost
  let totalCost = 0;
  let maxSpread: number | null = null;

  for (const leg of tradeSpec.legs) {
    const price = prices[leg.instrument_name];
    if (price) {
      if (leg.side === "buy") {
        totalCost += (price.ask ?? price.mark) * leg.amount;
      } else {
        totalCost -= (price.bid ?? price.mark) * leg.amount;
      }
      if (price.spread_percent !== null) {
        maxSpread =
          maxSpread !== null
            ? Math.max(maxSpread, price.spread_percent)
            : price.spread_percent;
      }
    }
  }

  const formatPrice = (price: number | null) => {
    if (price === null) return "—";
    return `$${price.toFixed(2)}`;
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl text-zinc-100">
              {tradeSpec.strategy}
              <Badge
                variant="outline"
                className="border-amber-500/50 text-amber-400"
              >
                {tradeSpec.underlying}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1 text-zinc-400">
              Expiry: {tradeSpec.expiry}
            </CardDescription>
          </div>
          {indexPrice && (
            <div className="text-right">
              <div className="text-xs text-zinc-500">Index Price</div>
              <div className="text-lg font-semibold text-zinc-100">
                ${indexPrice.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Explanation */}
        <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
          <p className="text-sm text-zinc-300">{tradeSpec.explanation}</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
            <span className="ml-2 text-zinc-400">Fetching live prices...</span>
          </div>
        ) : error ? (
          <Alert variant="destructive" className="border-red-900/50 bg-red-950/30">
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        ) : (
          <>
            {/* Legs */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-zinc-400">Legs</div>
              {tradeSpec.legs.map((leg, i) => {
                const price = prices[leg.instrument_name];
                const isBuy = leg.side === "buy";

                return (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/30 p-3"
                  >
                    <div className="flex items-center gap-3">
                      {isBuy ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/10">
                          <ArrowUpRight className="h-4 w-4 text-emerald-400" />
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
                          <ArrowDownRight className="h-4 w-4 text-red-400" />
                        </div>
                      )}
                      <div>
                        <div className="font-mono text-sm text-zinc-100">
                          {leg.instrument_name}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {isBuy ? "Buy" : "Sell"} {leg.amount} contract
                          {leg.amount !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </div>
                    {price && (
                      <div className="text-right">
                        <div className="text-sm text-zinc-100">
                          {formatPrice(isBuy ? price.ask : price.bid)}
                        </div>
                        <div className="text-xs text-zinc-500">
                          Mark: {formatPrice(price.mark)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <Separator className="bg-zinc-800" />

            {/* Cost Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
                <div className="text-xs text-zinc-500">Estimated Cost</div>
                <div
                  className={`text-lg font-semibold ${totalCost > 0 ? "text-red-400" : "text-emerald-400"}`}
                >
                  {totalCost >= 0 ? "-" : "+"}${Math.abs(totalCost).toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3">
                <div className="text-xs text-zinc-500">Max Loss (Calculated)</div>
                <div className="text-lg font-semibold text-red-400">
                  ${calculatedMaxLoss.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Safety Indicators */}
            <div className="space-y-2">
              <SafetyIndicator
                label="Trade Cost"
                value={`$${Math.abs(totalCost).toFixed(2)}`}
                threshold="$200"
                passed={Math.abs(totalCost) <= 200}
              />
              <SafetyIndicator
                label="Max Contracts"
                value={Math.max(...tradeSpec.legs.map((l) => l.amount)).toString()}
                threshold="1"
                passed={Math.max(...tradeSpec.legs.map((l) => l.amount)) <= 1}
              />
              <SafetyIndicator
                label="Spread"
                value={maxSpread !== null ? `${maxSpread.toFixed(1)}%` : "N/A"}
                threshold="5%"
                passed={maxSpread === null || maxSpread <= 5}
                warning={maxSpread !== null && maxSpread > 5}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface SafetyIndicatorProps {
  label: string;
  value: string;
  threshold: string;
  passed: boolean;
  warning?: boolean;
}

function SafetyIndicator({
  label,
  value,
  threshold,
  passed,
  warning,
}: SafetyIndicatorProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/20 px-3 py-2">
      <div className="flex items-center gap-2">
        {warning ? (
          <AlertTriangle className="h-4 w-4 text-amber-400" />
        ) : passed ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <XCircle className="h-4 w-4 text-red-400" />
        )}
        <span className="text-sm text-zinc-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-medium ${warning ? "text-amber-400" : passed ? "text-zinc-100" : "text-red-400"}`}
        >
          {value}
        </span>
        <span className="text-xs text-zinc-600">/ {threshold}</span>
      </div>
    </div>
  );
}

