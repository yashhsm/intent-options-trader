import type { TradeSpec, Leg } from "./schemas";

export interface PayoffPoint {
  price: number;
  pnl: number;
}

export interface PayoffAnalysis {
  points: PayoffPoint[];
  maxLoss: number;
  maxGain: number | null; // null = unlimited
  breakevens: number[];
}

interface LegWithPrice extends Leg {
  strike: number;
  optionType: "C" | "P";
  premium: number; // Cost per contract
}

// Parse strike and option type from instrument name
function parseLeg(leg: Leg, premium: number): LegWithPrice | null {
  // Format: ETH-20250110-3500-C
  const match = leg.instrument_name.match(/^[A-Z]+-\d{8}-(\d+)-([CP])$/);
  if (!match) return null;

  return {
    ...leg,
    strike: parseInt(match[1]),
    optionType: match[2] as "C" | "P",
    premium,
  };
}

// Calculate P&L for a single leg at a given underlying price
function calculateLegPnl(leg: LegWithPrice, underlyingPrice: number): number {
  let intrinsicValue: number;

  if (leg.optionType === "C") {
    // Call option: max(0, underlying - strike)
    intrinsicValue = Math.max(0, underlyingPrice - leg.strike);
  } else {
    // Put option: max(0, strike - underlying)
    intrinsicValue = Math.max(0, leg.strike - underlyingPrice);
  }

  // P&L = (intrinsic value - premium paid) * amount * direction
  const direction = leg.side === "buy" ? 1 : -1;
  const pnl = (intrinsicValue - leg.premium) * leg.amount * direction;

  return pnl;
}

// Calculate total P&L at a given underlying price
function calculateTotalPnl(
  legs: LegWithPrice[],
  underlyingPrice: number
): number {
  return legs.reduce((total, leg) => total + calculateLegPnl(leg, underlyingPrice), 0);
}

// Find breakeven points using binary search
function findBreakevens(
  legs: LegWithPrice[],
  minPrice: number,
  maxPrice: number,
  tolerance: number = 0.01
): number[] {
  const breakevens: number[] = [];
  const step = (maxPrice - minPrice) / 1000;

  let prevPnl = calculateTotalPnl(legs, minPrice);
  for (let price = minPrice + step; price <= maxPrice; price += step) {
    const currentPnl = calculateTotalPnl(legs, price);

    // Check if P&L crossed zero
    if ((prevPnl < 0 && currentPnl >= 0) || (prevPnl >= 0 && currentPnl < 0)) {
      // Binary search for exact breakeven
      let low = price - step;
      let high = price;
      while (high - low > tolerance) {
        const mid = (low + high) / 2;
        const midPnl = calculateTotalPnl(legs, mid);
        if ((prevPnl < 0 && midPnl < 0) || (prevPnl >= 0 && midPnl >= 0)) {
          low = mid;
        } else {
          high = mid;
        }
      }
      breakevens.push(Math.round((low + high) / 2 * 100) / 100);
    }

    prevPnl = currentPnl;
  }

  return breakevens;
}

export function calculatePayoff(
  tradeSpec: TradeSpec,
  premiums: Map<string, number>, // instrument_name -> premium per contract
  currentPrice: number
): PayoffAnalysis {
  // Parse legs with premiums
  const parsedLegs: LegWithPrice[] = [];
  for (const leg of tradeSpec.legs) {
    const premium = premiums.get(leg.instrument_name) || 0;
    const parsed = parseLeg(leg, premium);
    if (parsed) {
      parsedLegs.push(parsed);
    }
  }

  if (parsedLegs.length === 0) {
    return {
      points: [],
      maxLoss: tradeSpec.max_loss_usd,
      maxGain: null,
      breakevens: [],
    };
  }

  // Determine price range for analysis
  const strikes = parsedLegs.map((l) => l.strike);
  const minStrike = Math.min(...strikes);
  const maxStrike = Math.max(...strikes);
  const priceRange = maxStrike - minStrike || currentPrice * 0.2;

  const minPrice = Math.max(0, minStrike - priceRange * 0.5);
  const maxPrice = maxStrike + priceRange * 0.5;

  // Generate payoff curve points
  const numPoints = 100;
  const points: PayoffPoint[] = [];
  let minPnl = Infinity;
  let maxPnl = -Infinity;

  for (let i = 0; i <= numPoints; i++) {
    const price = minPrice + (maxPrice - minPrice) * (i / numPoints);
    const pnl = calculateTotalPnl(parsedLegs, price);
    points.push({ price: Math.round(price * 100) / 100, pnl: Math.round(pnl * 100) / 100 });
    minPnl = Math.min(minPnl, pnl);
    maxPnl = Math.max(maxPnl, pnl);
  }

  // Find breakevens
  const breakevens = findBreakevens(parsedLegs, minPrice, maxPrice);

  // Determine if max gain is limited
  // For pure long options, max loss is premium paid, max gain is unlimited (calls) or limited (puts)
  // For spreads, both are limited
  const hasShortCall = parsedLegs.some((l) => l.side === "sell" && l.optionType === "C");
  const hasLongPut = parsedLegs.some((l) => l.side === "buy" && l.optionType === "P");

  // Check endpoints for max values
  const pnlAtZero = calculateTotalPnl(parsedLegs, 0);

  const effectiveMaxLoss = Math.abs(minPnl);
  let effectiveMaxGain: number | null = maxPnl;

  // If we have uncapped upside (long call without short call)
  if (!hasShortCall && parsedLegs.some((l) => l.side === "buy" && l.optionType === "C")) {
    effectiveMaxGain = null; // Unlimited
  }

  // If we have uncapped downside protection (long put on declining price)
  if (hasLongPut && !parsedLegs.some((l) => l.side === "sell" && l.optionType === "P")) {
    // Max gain on put is strike - premium (at price = 0)
    effectiveMaxGain = Math.max(effectiveMaxGain || 0, pnlAtZero);
  }

  return {
    points,
    maxLoss: Math.round(effectiveMaxLoss * 100) / 100,
    maxGain: effectiveMaxGain !== null ? Math.round(effectiveMaxGain * 100) / 100 : null,
    breakevens,
  };
}

// Calculate estimated cost to enter the trade
export function calculateEntryCost(
  tradeSpec: TradeSpec,
  premiums: Map<string, number>
): number {
  let totalCost = 0;

  for (const leg of tradeSpec.legs) {
    const premium = premiums.get(leg.instrument_name) || 0;
    if (leg.side === "buy") {
      totalCost += premium * leg.amount;
    } else {
      totalCost -= premium * leg.amount; // Credit received
    }
  }

  return Math.round(totalCost * 100) / 100;
}

