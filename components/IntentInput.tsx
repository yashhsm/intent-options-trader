"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Sparkles } from "lucide-react";
import { debugLogger } from "@/lib/debug-logger";

interface IntentInputProps {
  onTradeSpecParsed: (tradeSpec: unknown) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const EXAMPLE_INTENTS = [
  "ETH bullish, 2 weeks, max loss $200",
  "BTC bearish put spread, expires next Friday, risk $150",
  "ETH straddle around current price, 1 week out, $200 budget",
];

export function IntentInput({ onTradeSpecParsed, isLoading, setIsLoading }: IntentInputProps) {
  const [intent, setIntent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!intent.trim()) {
      setError("Please enter a trading intent");
      return;
    }

    setIsLoading(true);
    setError(null);

    const startTime = Date.now();
    debugLogger.aiRequest('IntentInput', `Parsing intent: "${intent.trim().substring(0, 50)}..."`, { intent: intent.trim() });

    try {
      debugLogger.apiCall('parse-intent', 'POST /api/parse-intent', { intent: intent.trim() });
      
      const response = await fetch("/api/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: intent.trim() }),
      });

      const data = await response.json();
      const duration = Date.now() - startTime;

      if (!response.ok) {
        debugLogger.error('parse-intent', `Failed: ${data.error}`, { details: data.details, duration });
        throw new Error(data.details || data.error || "Failed to parse intent");
      }

      debugLogger.aiResponse('parse-intent', `Claude parsed: ${data.tradeSpec?.strategy} on ${data.tradeSpec?.underlying}`, {
        strategy: data.tradeSpec?.strategy,
        underlying: data.tradeSpec?.underlying,
        legs: data.tradeSpec?.legs?.length,
      }, duration);

      onTradeSpecParsed(data.tradeSpec);
    } catch (err) {
      debugLogger.error('IntentInput', err instanceof Error ? err.message : String(err));
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setIntent(example);
    setError(null);
  };

  return (
    <Card className="border-zinc-800 bg-zinc-900/50 backdrop-blur">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-xl text-zinc-100">
          <Sparkles className="h-5 w-5 text-amber-400" />
          Trading Intent
        </CardTitle>
        <CardDescription className="text-zinc-400">
          Describe your trade in natural language. Claude will parse it into a structured options trade.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          placeholder="e.g., ETH bullish, 2 weeks, max loss $200"
          value={intent}
          onChange={(e) => {
            setIntent(e.target.value);
            setError(null);
          }}
          className="min-h-[100px] resize-none border-zinc-700 bg-zinc-800/50 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/50 focus:ring-amber-500/20"
          disabled={isLoading}
        />

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500">Try:</span>
          {EXAMPLE_INTENTS.map((example, i) => (
            <button
              key={i}
              onClick={() => handleExampleClick(example)}
              className="rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-1 text-xs text-zinc-400 transition-colors hover:border-amber-500/50 hover:text-amber-400"
              disabled={isLoading}
            >
              {example}
            </button>
          ))}
        </div>

        {error && (
          <Alert variant="destructive" className="border-red-900/50 bg-red-950/30">
            <AlertDescription className="text-red-400">{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleSubmit}
          disabled={isLoading || !intent.trim()}
          className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-zinc-900 hover:from-amber-400 hover:to-orange-400 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Parsing Intent...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Parse Intent
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

