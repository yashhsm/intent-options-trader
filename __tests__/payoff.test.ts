import { calculatePayoff, calculateEntryCost } from '../lib/payoff';
import type { TradeSpec } from '../lib/schemas';

describe('Payoff Calculations', () => {
  describe('calculatePayoff', () => {
    describe('Long Call', () => {
      const longCallSpec: TradeSpec = {
        underlying: 'ETH',
        strategy: 'Long Call',
        expiry: '20250110',
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'buy',
            amount: 1,
          },
        ],
        max_cost_usd: 150,
        max_loss_usd: 150,
        explanation: 'Bullish call',
      };

      it('should calculate payoff for long call', () => {
        const premiums = new Map([['ETH-20250110-3500-C', 150]]);
        const result = calculatePayoff(longCallSpec, premiums, 3400);

        // Max loss = premium paid = $150
        expect(result.maxLoss).toBeCloseTo(150, 0);
        
        // Max gain = unlimited for long call
        expect(result.maxGain).toBeNull();
        
        // Should have breakeven point
        expect(result.breakevens.length).toBeGreaterThan(0);
        
        // Breakeven = strike + premium = 3500 + 150 = 3650
        expect(result.breakevens[0]).toBeCloseTo(3650, 0);
      });

      it('should show loss at prices below breakeven', () => {
        const premiums = new Map([['ETH-20250110-3500-C', 150]]);
        const result = calculatePayoff(longCallSpec, premiums, 3400);

        // Find P&L at strike price (should be -premium)
        const atStrike = result.points.find(p => Math.abs(p.price - 3500) < 50);
        expect(atStrike?.pnl).toBeLessThan(0);
      });

      it('should show profit at prices above breakeven', () => {
        const premiums = new Map([['ETH-20250110-3500-C', 150]]);
        const result = calculatePayoff(longCallSpec, premiums, 3400);

        // Find P&L at high price (should be positive)
        const atHigh = result.points.find(p => p.price > 3700);
        expect(atHigh?.pnl).toBeGreaterThan(0);
      });
    });

    describe('Long Put', () => {
      const longPutSpec: TradeSpec = {
        underlying: 'ETH',
        strategy: 'Long Put',
        expiry: '20250110',
        legs: [
          {
            instrument_name: 'ETH-20250110-3000-P',
            side: 'buy',
            amount: 1,
          },
        ],
        max_cost_usd: 100,
        max_loss_usd: 100,
        explanation: 'Bearish put',
      };

      it('should calculate payoff for long put', () => {
        const premiums = new Map([['ETH-20250110-3000-P', 100]]);
        const result = calculatePayoff(longPutSpec, premiums, 3100);

        // Max loss = premium paid = $100
        expect(result.maxLoss).toBeCloseTo(100, 0);
        
        // Should have breakeven
        expect(result.breakevens.length).toBeGreaterThan(0);
        
        // Breakeven = strike - premium = 3000 - 100 = 2900
        expect(result.breakevens[0]).toBeCloseTo(2900, 0);
      });

      it('should show max profit at price = 0', () => {
        const premiums = new Map([['ETH-20250110-3000-P', 100]]);
        const result = calculatePayoff(longPutSpec, premiums, 3100);

        // At price 0, put is worth strike - so profit = strike - premium
        const atZero = result.points.find(p => p.price < 100);
        if (atZero) {
          // Max profit ≈ strike - premium = 3000 - 100 = 2900
          expect(atZero.pnl).toBeGreaterThan(2000);
        }
      });
    });

    describe('Bull Call Spread', () => {
      const spreadSpec: TradeSpec = {
        underlying: 'ETH',
        strategy: 'Bull Call Spread',
        expiry: '20250110',
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'buy',
            amount: 1,
          },
          {
            instrument_name: 'ETH-20250110-4000-C',
            side: 'sell',
            amount: 1,
          },
        ],
        max_cost_usd: 100,
        max_loss_usd: 100,
        explanation: 'Bull call spread',
      };

      it('should have capped max loss', () => {
        const premiums = new Map([
          ['ETH-20250110-3500-C', 200], // Pay $200 for lower strike
          ['ETH-20250110-4000-C', 100], // Receive $100 for higher strike
        ]);
        // Net debit = $100

        const result = calculatePayoff(spreadSpec, premiums, 3700);
        
        // Max loss = net debit = $100
        expect(result.maxLoss).toBeCloseTo(100, 0);
      });

      it('should have capped max gain', () => {
        const premiums = new Map([
          ['ETH-20250110-3500-C', 200],
          ['ETH-20250110-4000-C', 100],
        ]);

        const result = calculatePayoff(spreadSpec, premiums, 3700);
        
        // Max gain = (strike diff - net debit) = (500 - 100) = $400
        expect(result.maxGain).toBeCloseTo(400, 0);
      });

      it('should have breakeven between strikes', () => {
        const premiums = new Map([
          ['ETH-20250110-3500-C', 200],
          ['ETH-20250110-4000-C', 100],
        ]);

        const result = calculatePayoff(spreadSpec, premiums, 3700);
        
        // Breakeven = lower strike + net debit = 3500 + 100 = 3600
        expect(result.breakevens.length).toBe(1);
        expect(result.breakevens[0]).toBeCloseTo(3600, 0);
      });
    });

    describe('Short Call (selling)', () => {
      const shortCallSpec: TradeSpec = {
        underlying: 'ETH',
        strategy: 'Short Call',
        expiry: '20250110',
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'sell',
            amount: 1,
          },
        ],
        max_cost_usd: 0,
        max_loss_usd: 10000, // Theoretically unlimited
        explanation: 'Selling naked call',
      };

      it('should show credit received as max gain', () => {
        const premiums = new Map([['ETH-20250110-3500-C', 150]]);
        const result = calculatePayoff(shortCallSpec, premiums, 3400);

        // Max gain = premium received (at prices below strike)
        const atLow = result.points.find(p => p.price < 3400);
        expect(atLow?.pnl).toBeCloseTo(150, 0);
      });

      it('should show loss above breakeven', () => {
        const premiums = new Map([['ETH-20250110-3500-C', 150]]);
        const result = calculatePayoff(shortCallSpec, premiums, 3400);

        // At high prices, loss increases
        const atHigh = result.points.find(p => p.price > 3800);
        expect(atHigh?.pnl).toBeLessThan(0);
      });
    });

    describe('Edge Cases', () => {
      it('should handle trade spec with no matching premium data', () => {
        const spec: TradeSpec = {
          underlying: 'ETH',
          strategy: 'Long Call',
          expiry: '20250110',
          legs: [
            {
              instrument_name: 'ETH-20250110-3500-C',
              side: 'buy',
              amount: 1,
            },
          ],
          max_cost_usd: 150,
          max_loss_usd: 150,
          explanation: 'Test',
        };

        const premiums = new Map<string, number>(); // Empty
        const result = calculatePayoff(spec, premiums, 3400);

        // With zero premium, all P&L should be based on intrinsic value only
        // At strike (3500) P&L should be 0 since no premium was paid
        const atStrike = result.points.find(p => Math.abs(p.price - 3500) < 50);
        expect(atStrike?.pnl).toBe(0);
      });

      it('should handle invalid instrument name format', () => {
        const spec: TradeSpec = {
          underlying: 'ETH',
          strategy: 'Long Call',
          expiry: '20250110',
          legs: [
            {
              instrument_name: 'INVALID-FORMAT',
              side: 'buy',
              amount: 1,
            },
          ],
          max_cost_usd: 150,
          max_loss_usd: 150,
          explanation: 'Test',
        };

        const premiums = new Map([['INVALID-FORMAT', 150]]);
        const result = calculatePayoff(spec, premiums, 3400);

        // Should handle gracefully
        expect(result.points).toHaveLength(0);
      });

      it('should handle fractional amounts', () => {
        const spec: TradeSpec = {
          underlying: 'ETH',
          strategy: 'Long Call',
          expiry: '20250110',
          legs: [
            {
              instrument_name: 'ETH-20250110-3500-C',
              side: 'buy',
              amount: 0.1, // Small amount
            },
          ],
          max_cost_usd: 15,
          max_loss_usd: 15,
          explanation: 'Test',
        };

        const premiums = new Map([['ETH-20250110-3500-C', 150]]); // Premium per contract
        const result = calculatePayoff(spec, premiums, 3400);

        // Max loss should be 0.1 * 150 = $15
        expect(result.maxLoss).toBeCloseTo(15, 0);
      });
    });
  });

  describe('calculateEntryCost', () => {
    it('should calculate debit for long position', () => {
      const spec: TradeSpec = {
        underlying: 'ETH',
        strategy: 'Long Call',
        expiry: '20250110',
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'buy',
            amount: 1,
          },
        ],
        max_cost_usd: 150,
        max_loss_usd: 150,
        explanation: 'Test',
      };

      const premiums = new Map([['ETH-20250110-3500-C', 150]]);
      const cost = calculateEntryCost(spec, premiums);

      expect(cost).toBe(150);
    });

    it('should calculate credit for short position', () => {
      const spec: TradeSpec = {
        underlying: 'ETH',
        strategy: 'Short Call',
        expiry: '20250110',
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'sell',
            amount: 1,
          },
        ],
        max_cost_usd: 0,
        max_loss_usd: 10000,
        explanation: 'Test',
      };

      const premiums = new Map([['ETH-20250110-3500-C', 150]]);
      const cost = calculateEntryCost(spec, premiums);

      expect(cost).toBe(-150); // Negative = credit received
    });

    it('should calculate net for spread', () => {
      const spec: TradeSpec = {
        underlying: 'ETH',
        strategy: 'Bull Call Spread',
        expiry: '20250110',
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'buy',
            amount: 1,
          },
          {
            instrument_name: 'ETH-20250110-4000-C',
            side: 'sell',
            amount: 1,
          },
        ],
        max_cost_usd: 100,
        max_loss_usd: 100,
        explanation: 'Test',
      };

      const premiums = new Map([
        ['ETH-20250110-3500-C', 200],
        ['ETH-20250110-4000-C', 100],
      ]);
      const cost = calculateEntryCost(spec, premiums);

      // Net = 200 (paid) - 100 (received) = 100
      expect(cost).toBe(100);
    });

    it('should handle missing premium data', () => {
      const spec: TradeSpec = {
        underlying: 'ETH',
        strategy: 'Long Call',
        expiry: '20250110',
        legs: [
          {
            instrument_name: 'ETH-20250110-3500-C',
            side: 'buy',
            amount: 1,
          },
        ],
        max_cost_usd: 150,
        max_loss_usd: 150,
        explanation: 'Test',
      };

      const premiums = new Map<string, number>(); // Empty
      const cost = calculateEntryCost(spec, premiums);

      expect(cost).toBe(0);
    });

    it('should handle fractional amounts', () => {
      const spec: TradeSpec = {
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
        max_cost_usd: 75,
        max_loss_usd: 75,
        explanation: 'Test',
      };

      const premiums = new Map([['ETH-20250110-3500-C', 150]]);
      const cost = calculateEntryCost(spec, premiums);

      expect(cost).toBe(75); // 0.5 * 150
    });
  });
});

