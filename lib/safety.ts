import type { TradeSpec, TradePreview } from "./schemas";

export interface SafetyConfig {
  maxTradeCostUsd: number;
  maxContractsPerLeg: number;
  maxSpreadPercent: number;
  safeModeEnabled: boolean;
}

export interface SafetyCheckResult {
  passes_max_cost: boolean;
  passes_max_contracts: boolean;
  passes_spread_check: boolean;
  spread_percent: number | null;
  all_passed: boolean;
  warnings: string[];
  errors: string[];
}

export function getSafetyConfig(): SafetyConfig {
  return {
    maxTradeCostUsd: parseFloat(process.env.MAX_TRADE_COST_USD || "200"),
    maxContractsPerLeg: parseFloat(process.env.MAX_CONTRACTS_PER_LEG || "10"),
    maxSpreadPercent: parseFloat(process.env.MAX_SPREAD_PERCENT || "5"),
    safeModeEnabled: process.env.SAFE_MODE !== "false",
  };
}

export function runSafetyChecks(
  tradeSpec: TradeSpec,
  estimatedCost: number,
  spreadPercent: number | null
): SafetyCheckResult {
  const config = getSafetyConfig();
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check 1: Max trade cost
  const passes_max_cost = estimatedCost <= config.maxTradeCostUsd;
  if (!passes_max_cost) {
    errors.push(
      `Trade cost ($${estimatedCost.toFixed(2)}) exceeds maximum allowed ($${config.maxTradeCostUsd})`
    );
  }

  // Check 2: Max contracts per leg
  const maxContracts = Math.max(...tradeSpec.legs.map((leg) => leg.amount));
  const passes_max_contracts = maxContracts <= config.maxContractsPerLeg;
  if (!passes_max_contracts) {
    errors.push(
      `Max contracts per leg (${maxContracts}) exceeds limit (${config.maxContractsPerLeg})`
    );
  }

  // Check 3: Bid-ask spread
  let passes_spread_check = true;
  if (spreadPercent !== null) {
    passes_spread_check = spreadPercent <= config.maxSpreadPercent;
    if (!passes_spread_check) {
      warnings.push(
        `Bid-ask spread (${spreadPercent.toFixed(1)}%) exceeds threshold (${config.maxSpreadPercent}%)`
      );
    }
  } else {
    warnings.push("Could not calculate bid-ask spread - no liquidity data");
  }

  // Check 4: Validate max_loss matches user expectation
  if (tradeSpec.max_loss_usd > config.maxTradeCostUsd) {
    warnings.push(
      `Max loss ($${tradeSpec.max_loss_usd}) exceeds safety threshold ($${config.maxTradeCostUsd})`
    );
  }

  const all_passed =
    passes_max_cost && passes_max_contracts && (passes_spread_check || !config.safeModeEnabled);

  return {
    passes_max_cost,
    passes_max_contracts,
    passes_spread_check,
    spread_percent: spreadPercent,
    all_passed,
    warnings,
    errors,
  };
}

export function validateTradeBeforeExecution(
  preview: TradePreview
): { canExecute: boolean; reason?: string } {
  const config = getSafetyConfig();

  if (!config.safeModeEnabled) {
    return { canExecute: true };
  }

  // Re-validate all safety checks
  if (!preview.safety_checks.passes_max_cost) {
    return {
      canExecute: false,
      reason: `Trade cost exceeds maximum of $${config.maxTradeCostUsd}`,
    };
  }

  if (!preview.safety_checks.passes_max_contracts) {
    return {
      canExecute: false,
      reason: `Contracts per leg exceeds maximum of ${config.maxContractsPerLeg}`,
    };
  }

  if (preview.safety_checks.errors.length > 0) {
    return {
      canExecute: false,
      reason: preview.safety_checks.errors.join("; "),
    };
  }

  return { canExecute: true };
}

export function calculateSpreadPercent(
  bidPrice: number | null,
  askPrice: number | null
): number | null {
  if (bidPrice === null || askPrice === null || bidPrice <= 0) {
    return null;
  }
  const midPrice = (bidPrice + askPrice) / 2;
  if (midPrice <= 0) return null;
  return ((askPrice - bidPrice) / midPrice) * 100;
}

