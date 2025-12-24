"use client";

import { useMemo } from "react";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Target } from "lucide-react";
import type { TradeSpec } from "@/lib/schemas";
import { calculatePayoff } from "@/lib/payoff";

interface PriceData {
  bid: number | null;
  ask: number | null;
  mark: number;
  index: number;
  spread_percent: number | null;
}

interface PayoffChartProps {
  tradeSpec: TradeSpec;
  prices: Map<string, PriceData>;
  indexPrice: number;
}

export function PayoffChart({ tradeSpec, prices, indexPrice }: PayoffChartProps) {
  const payoffAnalysis = useMemo(() => {
    // Build premiums map from prices
    const premiums = new Map<string, number>();
    for (const leg of tradeSpec.legs) {
      const price = prices.get(leg.instrument_name);
      if (price) {
        // Use mark price as premium estimate
        premiums.set(leg.instrument_name, price.mark);
      }
    }

    return calculatePayoff(tradeSpec, premiums, indexPrice);
  }, [tradeSpec, prices, indexPrice]);

  // Find min/max P&L for chart bounds
  const minPnl = Math.min(...payoffAnalysis.points.map((p) => p.pnl));
  const maxPnl = Math.max(...payoffAnalysis.points.map((p) => p.pnl));
  const pnlPadding = Math.max(Math.abs(minPnl), Math.abs(maxPnl)) * 0.1;

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { price: number; pnl: number } }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isProfitable = data.pnl >= 0;
      return (
        <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 shadow-xl">
          <div className="text-xs text-zinc-500">
            {tradeSpec.underlying} Price
          </div>
          <div className="text-sm font-semibold text-zinc-100">
            ${data.price.toLocaleString()}
          </div>
          <div className="mt-2 text-xs text-zinc-500">P&L at Expiry</div>
          <div
            className={`text-sm font-semibold ${isProfitable ? "text-emerald-400" : "text-red-400"}`}
          >
            {isProfitable ? "+" : ""}${data.pnl.toFixed(2)}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between text-xl text-zinc-100">
          <span>Payoff at Expiry</span>
          <div className="flex gap-2">
            {payoffAnalysis.breakevens.map((be, i) => (
              <Badge
                key={i}
                variant="outline"
                className="border-amber-500/50 text-amber-400"
              >
                <Target className="mr-1 h-3 w-3" />
                BE: ${be.toLocaleString()}
              </Badge>
            ))}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* Stats Row */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-zinc-500">
              <TrendingDown className="h-3 w-3" />
              Max Loss
            </div>
            <div className="mt-1 text-lg font-semibold text-red-400">
              -${payoffAnalysis.maxLoss.toFixed(2)}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-center">
            <div className="flex items-center justify-center gap-1 text-xs text-zinc-500">
              <TrendingUp className="h-3 w-3" />
              Max Gain
            </div>
            <div className="mt-1 text-lg font-semibold text-emerald-400">
              {payoffAnalysis.maxGain !== null
                ? `+$${payoffAnalysis.maxGain.toFixed(2)}`
                : "∞ Unlimited"}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-3 text-center">
            <div className="text-xs text-zinc-500">Breakeven{payoffAnalysis.breakevens.length > 1 ? "s" : ""}</div>
            <div className="mt-1 text-lg font-semibold text-amber-400">
              {payoffAnalysis.breakevens.length > 0
                ? payoffAnalysis.breakevens.map((be) => `$${be.toLocaleString()}`).join(", ")
                : "—"}
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={payoffAnalysis.points}
              margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
            >
              <defs>
                <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="lossGradient" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="price"
                stroke="#52525b"
                fontSize={12}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <YAxis
                stroke="#52525b"
                fontSize={12}
                domain={[minPnl - pnlPadding, maxPnl + pnlPadding]}
                tickFormatter={(value) => `$${value}`}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Zero line */}
              <ReferenceLine y={0} stroke="#52525b" strokeDasharray="5 5" />

              {/* Current price line */}
              <ReferenceLine
                x={indexPrice}
                stroke="#f59e0b"
                strokeDasharray="5 5"
                label={{
                  value: "Current",
                  position: "top",
                  fill: "#f59e0b",
                  fontSize: 10,
                }}
              />

              {/* Breakeven lines */}
              {payoffAnalysis.breakevens.map((be, i) => (
                <ReferenceLine
                  key={i}
                  x={be}
                  stroke="#8b5cf6"
                  strokeDasharray="3 3"
                />
              ))}

              {/* P&L Area (split for profit/loss coloring) */}
              <Area
                type="monotone"
                dataKey="pnl"
                stroke="none"
                fill="url(#profitGradient)"
                fillOpacity={1}
                baseValue={0}
                isAnimationActive={false}
              />

              {/* P&L Line */}
              <Line
                type="monotone"
                dataKey="pnl"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="h-0.5 w-4 bg-amber-500" />
            <span className="text-zinc-500">P&L Curve</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-0.5 bg-amber-500" style={{ borderStyle: "dashed" }} />
            <span className="text-zinc-500">Current Price</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-0.5 bg-violet-500" style={{ borderStyle: "dashed" }} />
            <span className="text-zinc-500">Breakeven</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

