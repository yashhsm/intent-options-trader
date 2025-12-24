"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";
import type { TradeSpec } from "@/lib/schemas";
import { debugLogger } from "@/lib/debug-logger";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  tradeSpec: TradeSpec;
  estimatedCost: number;
  calculatedMaxLoss: number;
  onExecute?: () => Promise<void>;
}

interface ExecutionResult {
  success: boolean;
  orders?: Array<{
    instrument_name: string;
    order_id: string;
    status: string;
    error?: string;
  }>;
  error?: string;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  tradeSpec,
  estimatedCost,
  calculatedMaxLoss,
}: ConfirmationModalProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);

  const handleExecute = async () => {
    if (!confirmed) return;

    setExecuting(true);
    setResult(null);

    const startTime = Date.now();
    debugLogger.apiCall('Execute', `POST /api/execute - ${tradeSpec.strategy} on ${tradeSpec.underlying}`, {
      legs: tradeSpec.legs.map(l => ({ instrument: l.instrument_name, side: l.side, amount: l.amount })),
    });

    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeSpec,
          confirmed: true,
        }),
      });

      const data = await response.json();
      const duration = Date.now() - startTime;

      if (!response.ok) {
        debugLogger.error('Execute', `Failed: ${data.error}`, { details: data.details, duration });
        setResult({
          success: false,
          error: data.details || data.error || "Execution failed",
        });
      } else {
        if (data.success) {
          debugLogger.apiResponse('Execute', `SUCCESS - ${data.orders?.length} orders placed`, {
            orders: data.orders,
            totalCost: data.total_estimated_cost,
          }, duration);
        } else {
          debugLogger.error('Execute', 'Some orders failed', { orders: data.orders, duration });
        }
        setResult({
          success: data.success,
          orders: data.orders,
          error: data.success ? undefined : "Some orders failed",
        });
      }
    } catch (err) {
      debugLogger.error('Execute', err instanceof Error ? err.message : String(err));
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Execution failed",
      });
    } finally {
      setExecuting(false);
    }
  };

  const handleClose = () => {
    if (executing) return;
    setConfirmed(false);
    setResult(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="border-zinc-800 bg-zinc-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-100">
            <Zap className="h-5 w-5 text-amber-400" />
            Execute Trade
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Review and confirm your trade before execution on Lyra mainnet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Trade Summary */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Strategy</span>
              <span className="font-medium text-zinc-100">{tradeSpec.strategy}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Underlying</span>
              <Badge variant="outline" className="border-amber-500/50 text-amber-400">
                {tradeSpec.underlying}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Expiry</span>
              <span className="font-medium text-zinc-100">{tradeSpec.expiry}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-500">Legs</span>
              <span className="font-medium text-zinc-100">{tradeSpec.legs.length}</span>
            </div>
            <div className="border-t border-zinc-700 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-400">Est. Cost</span>
                <span
                  className={`text-lg font-semibold ${estimatedCost > 0 ? "text-red-400" : "text-emerald-400"}`}
                >
                  {estimatedCost >= 0 ? "-" : "+"}${Math.abs(estimatedCost).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-medium text-zinc-400">Max Loss (Calculated)</span>
                <span className="text-lg font-semibold text-red-400">
                  ${calculatedMaxLoss.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Warning */}
          <Alert className="border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <AlertDescription className="text-amber-200">
              This will execute a REAL trade on Lyra mainnet. Your funds are at risk.
              Max loss is capped at ${calculatedMaxLoss.toFixed(2)}.
            </AlertDescription>
          </Alert>

          {/* Execution Result */}
          {result && (
            <div
              className={`rounded-lg border p-4 ${
                result.success
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : "border-red-500/30 bg-red-500/10"
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {result.success ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400" />
                )}
                <span
                  className={`font-medium ${result.success ? "text-emerald-400" : "text-red-400"}`}
                >
                  {result.success ? "Trade Executed" : "Execution Failed"}
                </span>
              </div>
              {result.error && (
                <p className="text-sm text-red-300">{result.error}</p>
              )}
              {result.orders && (
                <div className="mt-2 space-y-1">
                  {result.orders.map((order, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="font-mono text-zinc-400">
                        {order.instrument_name}
                      </span>
                      <span
                        className={
                          order.status === "failed" ? "text-red-400" : "text-emerald-400"
                        }
                      >
                        {order.status === "failed" ? order.error : (order.order_id ? order.order_id.slice(0, 8) : order.status)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Confirmation Checkbox */}
          {!result && (
            <div className="flex items-start space-x-3 rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
              <Checkbox
                id="confirm"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
                disabled={executing}
                className="mt-0.5 border-zinc-600 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
              />
              <label
                htmlFor="confirm"
                className="text-sm leading-relaxed text-zinc-300 cursor-pointer"
              >
                I understand this is a real trade on mainnet and confirm I want to execute
                this {tradeSpec.strategy} on {tradeSpec.underlying} with a maximum loss of
                ${calculatedMaxLoss.toFixed(2)}.
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {result ? (
            <Button
              onClick={handleClose}
              className="w-full bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={executing}
                className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                Cancel
              </Button>
              <Button
                onClick={handleExecute}
                disabled={!confirmed || executing}
                className="bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-900 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
              >
                {executing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-4 w-4" />
                    Execute Trade
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

