import {
  getSafetyConfig,
  runSafetyChecks,
  validateTradeBeforeExecution,
  calculateSpreadPercent,
} from '../lib/safety';
import type { TradeSpec, TradePreview } from '../lib/schemas';

describe('Safety Module', () => {
  describe('getSafetyConfig', () => {
    it('should return default config from environment', () => {
      const config = getSafetyConfig();
      expect(config.maxTradeCostUsd).toBe(200);
      expect(config.maxContractsPerLeg).toBe(1);
      expect(config.maxSpreadPercent).toBe(5);
      expect(config.safeModeEnabled).toBe(true);
    });
  });

  describe('calculateSpreadPercent', () => {
    it('should calculate spread correctly', () => {
      const spread = calculateSpreadPercent(100, 105);
      // Mid = 102.5, spread = 5, percent = 5/102.5 * 100 = 4.88%
      expect(spread).toBeCloseTo(4.88, 1);
    });

    it('should return null for null bid', () => {
      const spread = calculateSpreadPercent(null, 105);
      expect(spread).toBeNull();
    });

    it('should return null for null ask', () => {
      const spread = calculateSpreadPercent(100, null);
      expect(spread).toBeNull();
    });

    it('should return null for zero bid', () => {
      const spread = calculateSpreadPercent(0, 105);
      expect(spread).toBeNull();
    });

    it('should handle tight spreads', () => {
      const spread = calculateSpreadPercent(100, 100.1);
      expect(spread).toBeCloseTo(0.1, 1);
    });

    it('should handle wide spreads', () => {
      const spread = calculateSpreadPercent(90, 110);
      // Mid = 100, spread = 20, percent = 20%
      expect(spread).toBeCloseTo(20, 1);
    });
  });

  describe('runSafetyChecks', () => {
    const baseTradeSpec: TradeSpec = {
      underlying: 'ETH',
      strategy: 'Long Call',
      expiry: '20250110',
      legs: [
        {
          instrument_name: 'ETH-20250110-3500-C',
          side: 'buy',
          amount: 0.5,
        },
      ],
      max_cost_usd: 150,
      max_loss_usd: 150,
      explanation: 'Test trade',
    };

    it('should pass all checks for a safe trade', () => {
      const result = runSafetyChecks(baseTradeSpec, 100, 2);
      expect(result.all_passed).toBe(true);
      expect(result.passes_max_cost).toBe(true);
      expect(result.passes_max_contracts).toBe(true);
      expect(result.passes_spread_check).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail max cost check when cost exceeds limit', () => {
      const result = runSafetyChecks(baseTradeSpec, 250, 2);
      expect(result.all_passed).toBe(false);
      expect(result.passes_max_cost).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds maximum allowed'))).toBe(true);
    });

    it('should fail max contracts check when contracts exceed limit', () => {
      const highContractSpec: TradeSpec = {
        ...baseTradeSpec,
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'buy',
            amount: 2, // Exceeds limit of 1
          },
        ],
      };
      const result = runSafetyChecks(highContractSpec, 100, 2);
      expect(result.all_passed).toBe(false);
      expect(result.passes_max_contracts).toBe(false);
      expect(result.errors.some(e => e.includes('exceeds limit'))).toBe(true);
    });

    it('should warn on high spread but still pass if other checks pass', () => {
      const result = runSafetyChecks(baseTradeSpec, 100, 10); // 10% spread
      expect(result.passes_spread_check).toBe(false);
      expect(result.warnings.some(w => w.toLowerCase().includes('spread'))).toBe(true);
      // Note: In current impl, high spread doesn't block if SAFE_MODE is on
      // but other checks pass
    });

    it('should handle null spread', () => {
      const result = runSafetyChecks(baseTradeSpec, 100, null);
      expect(result.spread_percent).toBeNull();
      expect(result.warnings.some(w => w.includes('Could not calculate'))).toBe(true);
    });

    it('should warn when max_loss exceeds safety threshold', () => {
      const highLossSpec: TradeSpec = {
        ...baseTradeSpec,
        max_loss_usd: 500, // Exceeds $200 threshold
      };
      const result = runSafetyChecks(highLossSpec, 100, 2);
      expect(result.warnings.some(w => w.includes('Max loss'))).toBe(true);
    });

    it('should pass at exactly the cost limit', () => {
      const result = runSafetyChecks(baseTradeSpec, 200, 2);
      expect(result.passes_max_cost).toBe(true);
    });

    it('should pass at exactly the contract limit', () => {
      const atLimitSpec: TradeSpec = {
        ...baseTradeSpec,
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'buy',
            amount: 1, // Exactly at limit
          },
        ],
      };
      const result = runSafetyChecks(atLimitSpec, 100, 2);
      expect(result.passes_max_contracts).toBe(true);
    });

    it('should check max contracts across multiple legs', () => {
      const multiLegSpec: TradeSpec = {
        ...baseTradeSpec,
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'buy',
            amount: 0.5,
          },
          {
            instrument_name: 'ETH-20250110-4000-C',
            side: 'sell',
            amount: 1.5, // This leg exceeds
          },
        ],
      };
      const result = runSafetyChecks(multiLegSpec, 100, 2);
      expect(result.passes_max_contracts).toBe(false);
    });
  });

  describe('validateTradeBeforeExecution', () => {
    const createPreview = (overrides: Partial<TradePreview['safety_checks']> = {}): TradePreview => ({
      tradeSpec: {
        underlying: 'ETH',
        strategy: 'Long Call',
        expiry: '20250110',
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'buy',
            amount: 0.5,
          },
        ],
        max_cost_usd: 150,
        max_loss_usd: 150,
        explanation: 'Test',
      },
      legs: [],
      total_estimated_cost: 100,
      max_loss: 150,
      max_gain: 500,
      breakevens: [3650],
      safety_checks: {
        passes_max_cost: true,
        passes_max_contracts: true,
        passes_spread_check: true,
        spread_percent: 2,
        all_passed: true,
        warnings: [],
        errors: [],
        ...overrides,
      },
    });

    it('should allow execution when all checks pass', () => {
      const preview = createPreview();
      const result = validateTradeBeforeExecution(preview);
      expect(result.canExecute).toBe(true);
    });

    it('should block execution when max cost check fails', () => {
      const preview = createPreview({ passes_max_cost: false });
      const result = validateTradeBeforeExecution(preview);
      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain('cost');
    });

    it('should block execution when max contracts check fails', () => {
      const preview = createPreview({ passes_max_contracts: false });
      const result = validateTradeBeforeExecution(preview);
      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain('Contracts');
    });

    it('should block execution when there are errors', () => {
      const preview = createPreview({
        errors: ['Some critical error'],
      });
      const result = validateTradeBeforeExecution(preview);
      expect(result.canExecute).toBe(false);
      expect(result.reason).toContain('Some critical error');
    });
  });
});

