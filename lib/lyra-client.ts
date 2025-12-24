import type { LyraInstrument, LyraTicker } from "./schemas";

const LYRA_BASE_URL =
  process.env.LYRA_API_BASE_URL || "https://api.lyra.finance";

interface LyraApiResponse<T> {
  result: T;
  id?: string;
}

interface LyraApiError {
  error: {
    code: number;
    message: string;
  };
}

async function lyraPublicRequest<T>(
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(`${LYRA_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Lyra API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as LyraApiResponse<T> | LyraApiError;

  if ("error" in data) {
    throw new Error(`Lyra API error: ${data.error.message}`);
  }

  return data.result;
}

export interface GetInstrumentsParams {
  currency: string;
  instrument_type?: "option" | "perp" | "erc20";
  expired?: boolean;
}

export async function getInstruments(
  params: GetInstrumentsParams
): Promise<LyraInstrument[]> {
  const result = await lyraPublicRequest<LyraInstrument[]>(
    "/public/get_instruments",
    {
      currency: params.currency,
      instrument_type: params.instrument_type || "option",
      expired: params.expired ?? false,
    }
  );
  return result;
}

export interface GetInstrumentParams {
  instrument_name: string;
}

export async function getInstrument(
  params: GetInstrumentParams
): Promise<LyraInstrument> {
  return lyraPublicRequest<LyraInstrument>("/public/get_instrument", {
    instrument_name: params.instrument_name,
  });
}

export interface GetTickerParams {
  instrument_name: string;
}

export async function getTicker(params: GetTickerParams): Promise<LyraTicker> {
  return lyraPublicRequest<LyraTicker>("/public/get_ticker", {
    instrument_name: params.instrument_name,
  });
}

export async function getTickersForInstruments(
  instrumentNames: string[]
): Promise<Map<string, LyraTicker>> {
  const tickers = new Map<string, LyraTicker>();

  // Fetch tickers in parallel
  const results = await Promise.allSettled(
    instrumentNames.map((name) => getTicker({ instrument_name: name }))
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "fulfilled") {
      tickers.set(instrumentNames[i], result.value);
    }
  }

  return tickers;
}

// Helper to find matching instruments based on Claude's suggested names
export async function resolveInstruments(
  underlying: string,
  expiry: string, // YYYYMMDD format
  strikes: number[],
  optionTypes: ("C" | "P")[]
): Promise<Map<string, LyraInstrument>> {
  // Get all active options for the underlying
  const allInstruments = await getInstruments({
    currency: underlying,
    instrument_type: "option",
    expired: false,
  });

  // Convert expiry from YYYYMMDD to timestamp for comparison
  const expiryYear = parseInt(expiry.substring(0, 4));
  const expiryMonth = parseInt(expiry.substring(4, 6)) - 1;
  const expiryDay = parseInt(expiry.substring(6, 8));
  const targetExpiry = new Date(expiryYear, expiryMonth, expiryDay, 8, 0, 0); // 8 AM UTC typical expiry

  const matchedInstruments = new Map<string, LyraInstrument>();

  for (const instrument of allInstruments) {
    if (!instrument.option_details) {
      continue;
    }
    const { expiry, strike, option_type } = instrument.option_details;

    // Check if expiry matches (within 24 hours)
    const instrumentExpiry = new Date(expiry * 1000);
    const timeDiff = Math.abs(instrumentExpiry.getTime() - targetExpiry.getTime());
    if (timeDiff > 24 * 60 * 60 * 1000) {
      continue;
    }

    // Check if this matches any requested strike/type combo
    const strikeNum = parseFloat(strike);
    for (let i = 0; i < strikes.length; i++) {
      // Allow some tolerance for strike matching
      if (
        Math.abs(strikeNum - strikes[i]) < strikes[i] * 0.01 && // Within 1%
        option_type === optionTypes[i]
      ) {
        matchedInstruments.set(instrument.instrument_name, instrument);
      }
    }
  }

  return matchedInstruments;
}

// Parse Lyra instrument name to extract components
export function parseInstrumentName(name: string): {
  underlying: string;
  expiry: string;
  strike: number;
  optionType: "C" | "P";
} | null {
  // Format: ETH-20250110-3500-C
  const match = name.match(/^([A-Z]+)-(\d{8})-(\d+)-([CP])$/);
  if (!match) return null;

  return {
    underlying: match[1],
    expiry: match[2],
    strike: parseInt(match[3]),
    optionType: match[4] as "C" | "P",
  };
}

// Find closest available expiry to target date
export async function findClosestExpiry(
  underlying: string,
  targetExpiry: string
): Promise<number | null> {
  const instruments = await getInstruments({
    currency: underlying,
    instrument_type: "option",
    expired: false,
  });

  const targetDate = new Date(
    parseInt(targetExpiry.substring(0, 4)),
    parseInt(targetExpiry.substring(4, 6)) - 1,
    parseInt(targetExpiry.substring(6, 8))
  );

  let closestExpiry: number | null = null;
  let minDiff = Infinity;

  for (const inst of instruments) {
    if (!inst.option_details?.expiry) continue;
    const diff = Math.abs(inst.option_details.expiry * 1000 - targetDate.getTime());
    if (diff < minDiff) {
      minDiff = diff;
      closestExpiry = inst.option_details.expiry;
    }
  }

  return closestExpiry;
}

