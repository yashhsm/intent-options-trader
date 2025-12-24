/**
 * Lyra Tools for Claude Agent SDK
 * 
 * These tools allow Claude to query real market data from Lyra
 * to make informed decisions about instrument selection.
 */

import { debugLogger } from "./debug-logger";

const LYRA_BASE_URL = process.env.LYRA_API_BASE_URL || "https://api.lyra.finance";

// Types for Lyra API responses
export interface LyraInstrument {
  instrument_name: string;
  instrument_type: string;
  underlying_currency: string;
  is_active: boolean;
  tick_size: string;
  minimum_amount: string;
  option_details?: {
    expiry: number;
    strike: string;
    option_type: "C" | "P";
  };
}

export interface LyraTicker {
  instrument_name: string;
  best_bid_price: string;
  best_ask_price: string;
  best_bid_amount: string;
  best_ask_amount: string;
  mark_price: string;
  index_price: string;
  option_pricing?: {
    delta: string;
    gamma: string;
    theta: string;
    vega: string;
    iv: string;
  };
}

export interface InstrumentWithPricing extends LyraInstrument {
  pricing?: {
    bid: number | null;
    ask: number | null;
    mark: number;
    spread_percent: number | null;
    delta?: number;
    iv?: number;
  };
}

// Tool definitions for the Agent SDK
export const LYRA_TOOL_DEFINITIONS = [
  {
    name: "lyra_get_instruments",
    description: `Fetch all active options instruments for a given underlying (ETH or BTC).
Returns a list of instruments with their strikes, expiries, and option types.
Use this first to discover what instruments are available.`,
    input_schema: {
      type: "object" as const,
      properties: {
        underlying: {
          type: "string",
          description: "The underlying asset (ETH or BTC)",
          enum: ["ETH", "BTC"],
        },
        expiry_days_max: {
          type: "number",
          description: "Optional: Filter to instruments expiring within this many days",
        },
      },
      required: ["underlying"],
    },
  },
  {
    name: "lyra_get_ticker",
    description: `Get real-time pricing and Greeks for a specific instrument.
Returns bid/ask prices, mark price, IV, delta, and liquidity info.
Use this to check if an instrument has good liquidity before selecting it.`,
    input_schema: {
      type: "object" as const,
      properties: {
        instrument_name: {
          type: "string",
          description: "The full instrument name (e.g., ETH-20251227-3000-C)",
        },
      },
      required: ["instrument_name"],
    },
  },
  {
    name: "lyra_get_multiple_tickers",
    description: `Get pricing for multiple instruments at once.
More efficient than calling lyra_get_ticker multiple times.
Use this to compare several options and find the best one.`,
    input_schema: {
      type: "object" as const,
      properties: {
        instrument_names: {
          type: "array",
          items: { type: "string" },
          description: "Array of instrument names to fetch prices for",
        },
      },
      required: ["instrument_names"],
    },
  },
  {
    name: "lyra_get_index_price",
    description: `Get the current spot/index price for an underlying asset.
Use this to determine ATM (at-the-money) strikes.`,
    input_schema: {
      type: "object" as const,
      properties: {
        underlying: {
          type: "string",
          description: "The underlying asset (ETH or BTC)",
          enum: ["ETH", "BTC"],
        },
      },
      required: ["underlying"],
    },
  },
  {
    name: "lyra_find_liquid_options",
    description: `Find options with good liquidity for a given underlying, expiry range, and option type.
This is a convenience tool that filters out illiquid options (0 bid/ask or wide spreads).
Returns options sorted by liquidity quality.`,
    input_schema: {
      type: "object" as const,
      properties: {
        underlying: {
          type: "string",
          description: "The underlying asset (ETH or BTC)",
          enum: ["ETH", "BTC"],
        },
        option_type: {
          type: "string",
          description: "Call (C) or Put (P)",
          enum: ["C", "P"],
        },
        min_days_to_expiry: {
          type: "number",
          description: "Minimum days until expiry",
        },
        max_days_to_expiry: {
          type: "number",
          description: "Maximum days until expiry",
        },
        strike_range_percent: {
          type: "number",
          description: "Percentage range around ATM to search (e.g., 10 for +/-10%)",
          default: 15,
        },
        max_spread_percent: {
          type: "number",
          description: "Maximum bid-ask spread percentage to consider liquid",
          default: 10,
        },
      },
      required: ["underlying", "option_type", "min_days_to_expiry", "max_days_to_expiry"],
    },
  },
];

// Tool execution functions
async function lyraApiCall<T>(endpoint: string, params: Record<string, unknown>): Promise<T> {
  const startTime = Date.now();
  debugLogger.apiCall("Lyra", `POST ${endpoint}`, params);

  const response = await fetch(`${LYRA_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const text = await response.text();
    debugLogger.error("Lyra", `API error: ${response.status}`, { text });
    throw new Error(`Lyra API error: ${response.status} - ${text}`);
  }

  const data = await response.json();
  const duration = Date.now() - startTime;
  debugLogger.apiResponse("Lyra", `Response from ${endpoint}`, { resultType: typeof data.result }, duration);

  return data.result;
}

export async function executeGetInstruments(params: {
  underlying: string;
  expiry_days_max?: number;
}): Promise<LyraInstrument[]> {
  const instruments = await lyraApiCall<LyraInstrument[]>("/public/get_instruments", {
    currency: params.underlying,
    instrument_type: "option",
    expired: false,
  });

  // Filter to active instruments
  let filtered = instruments.filter((i) => i.is_active && i.option_details);

  // Filter by expiry if specified
  if (params.expiry_days_max) {
    const now = Date.now();
    const maxExpiry = now + params.expiry_days_max * 24 * 60 * 60 * 1000;
    filtered = filtered.filter((i) => {
      const expiry = (i.option_details?.expiry || 0) * 1000;
      return expiry <= maxExpiry && expiry > now;
    });
  }

  return filtered;
}

export async function executeGetTicker(params: { instrument_name: string }): Promise<LyraTicker> {
  return lyraApiCall<LyraTicker>("/public/get_ticker", {
    instrument_name: params.instrument_name,
  });
}

export async function executeGetMultipleTickers(params: {
  instrument_names: string[];
}): Promise<Record<string, LyraTicker | null>> {
  const results: Record<string, LyraTicker | null> = {};

  // Fetch in parallel with error handling
  const promises = params.instrument_names.map(async (name) => {
    try {
      const ticker = await executeGetTicker({ instrument_name: name });
      return { name, ticker };
    } catch {
      return { name, ticker: null };
    }
  });

  const settled = await Promise.all(promises);
  for (const { name, ticker } of settled) {
    results[name] = ticker;
  }

  return results;
}

export async function executeGetIndexPrice(params: { underlying: string }): Promise<{
  underlying: string;
  index_price: number;
  mark_price: number;
}> {
  const ticker = await lyraApiCall<LyraTicker>("/public/get_ticker", {
    instrument_name: `${params.underlying}-PERP`,
  });

  return {
    underlying: params.underlying,
    index_price: parseFloat(ticker.index_price),
    mark_price: parseFloat(ticker.mark_price),
  };
}

export async function executeFindLiquidOptions(params: {
  underlying: string;
  option_type: "C" | "P";
  min_days_to_expiry: number;
  max_days_to_expiry: number;
  strike_range_percent?: number;
  max_spread_percent?: number;
}): Promise<InstrumentWithPricing[]> {
  const strikeRange = params.strike_range_percent || 15;
  const maxSpread = params.max_spread_percent || 10;

  // Get index price first
  const { index_price } = await executeGetIndexPrice({ underlying: params.underlying });

  // Get all instruments
  const instruments = await executeGetInstruments({
    underlying: params.underlying,
    expiry_days_max: params.max_days_to_expiry,
  });

  // Filter by option type and expiry range
  const now = Date.now();
  const minExpiry = now + params.min_days_to_expiry * 24 * 60 * 60 * 1000;
  const maxExpiry = now + params.max_days_to_expiry * 24 * 60 * 60 * 1000;

  const filtered = instruments.filter((i) => {
    if (!i.option_details) return false;
    if (i.option_details.option_type !== params.option_type) return false;

    const expiry = i.option_details.expiry * 1000;
    if (expiry < minExpiry || expiry > maxExpiry) return false;

    // Filter by strike range
    const strike = parseFloat(i.option_details.strike);
    const minStrike = index_price * (1 - strikeRange / 100);
    const maxStrike = index_price * (1 + strikeRange / 100);
    if (strike < minStrike || strike > maxStrike) return false;

    return true;
  });

  // Get prices for filtered instruments
  const instrumentNames = filtered.map((i) => i.instrument_name);
  const tickers = await executeGetMultipleTickers({ instrument_names: instrumentNames });

  // Build results with pricing and filter by liquidity
  const results: InstrumentWithPricing[] = [];

  for (const instrument of filtered) {
    const ticker = tickers[instrument.instrument_name];
    if (!ticker) continue;

    const bid = ticker.best_bid_price && ticker.best_bid_price !== "0" 
      ? parseFloat(ticker.best_bid_price) 
      : null;
    const ask = ticker.best_ask_price && ticker.best_ask_price !== "0" 
      ? parseFloat(ticker.best_ask_price) 
      : null;
    const mark = parseFloat(ticker.mark_price);

    // Calculate spread
    let spreadPercent: number | null = null;
    if (bid !== null && ask !== null && bid > 0) {
      const mid = (bid + ask) / 2;
      spreadPercent = mid > 0 ? ((ask - bid) / mid) * 100 : null;
    }

    // Skip illiquid options (no bid/ask or wide spread)
    const isLiquid = bid !== null && ask !== null && 
      (spreadPercent === null || spreadPercent <= maxSpread);

    if (!isLiquid) continue;

    results.push({
      ...instrument,
      pricing: {
        bid,
        ask,
        mark,
        spread_percent: spreadPercent,
        delta: ticker.option_pricing?.delta ? parseFloat(ticker.option_pricing.delta) : undefined,
        iv: ticker.option_pricing?.iv ? parseFloat(ticker.option_pricing.iv) : undefined,
      },
    });
  }

  // Sort by spread (best liquidity first)
  results.sort((a, b) => {
    const spreadA = a.pricing?.spread_percent ?? 100;
    const spreadB = b.pricing?.spread_percent ?? 100;
    return spreadA - spreadB;
  });

  return results;
}

// Main tool executor
export async function executeLyraTool(
  toolName: string,
  toolInput: Record<string, unknown>
): Promise<unknown> {
  const startTime = Date.now();
  debugLogger.toolCall("LyraTool", toolName, toolInput);

  try {
    let result: unknown;
    
    switch (toolName) {
      case "lyra_get_instruments":
        result = await executeGetInstruments(toolInput as { underlying: string; expiry_days_max?: number });
        break;

      case "lyra_get_ticker":
        result = await executeGetTicker(toolInput as { instrument_name: string });
        break;

      case "lyra_get_multiple_tickers":
        result = await executeGetMultipleTickers(toolInput as { instrument_names: string[] });
        break;

      case "lyra_get_index_price":
        result = await executeGetIndexPrice(toolInput as { underlying: string });
        break;

      case "lyra_find_liquid_options":
        result = await executeFindLiquidOptions(
          toolInput as {
            underlying: string;
            option_type: "C" | "P";
            min_days_to_expiry: number;
            max_days_to_expiry: number;
            strike_range_percent?: number;
            max_spread_percent?: number;
          }
        );
        break;

      default:
        throw new Error(`Unknown Lyra tool: ${toolName}`);
    }

    const duration = Date.now() - startTime;
    const resultSummary = Array.isArray(result) 
      ? { count: result.length, sample: result.slice(0, 3) }
      : typeof result === 'object' && result !== null
      ? { keys: Object.keys(result), type: 'object' }
      : { value: result };
    
    debugLogger.toolResponse("LyraTool", toolName, resultSummary, duration);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    debugLogger.error("LyraTool", `${toolName} failed: ${errorMessage}`, { duration, toolInput });
    throw error;
  }
}

