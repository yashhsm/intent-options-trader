import {
  TradeSpecSchema,
  LegSchema,
  ParseIntentRequestSchema,
  ExecuteTradeRequestSchema,
  LyraTickerSchema,
  LyraInstrumentSchema,
} from '../lib/schemas';

describe('Schema Validation', () => {
  describe('LegSchema', () => {
    it('should validate a valid buy leg', () => {
      const leg = {
        instrument_name: 'ETH-20250110-3500-C',
        side: 'buy',
        amount: 0.5,
      };
      const result = LegSchema.safeParse(leg);
      expect(result.success).toBe(true);
    });

    it('should validate a valid sell leg', () => {
      const leg = {
        instrument_name: 'BTC-20250115-100000-P',
        side: 'sell',
        amount: 1,
      };
      const result = LegSchema.safeParse(leg);
      expect(result.success).toBe(true);
    });

    it('should reject invalid side', () => {
      const leg = {
        instrument_name: 'ETH-20250110-3500-C',
        side: 'hold', // Invalid
        amount: 0.5,
      };
      const result = LegSchema.safeParse(leg);
      expect(result.success).toBe(false);
    });

    it('should reject zero amount', () => {
      const leg = {
        instrument_name: 'ETH-20250110-3500-C',
        side: 'buy',
        amount: 0, // Invalid
      };
      const result = LegSchema.safeParse(leg);
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const leg = {
        instrument_name: 'ETH-20250110-3500-C',
        side: 'buy',
        amount: -1, // Invalid
      };
      const result = LegSchema.safeParse(leg);
      expect(result.success).toBe(false);
    });

    it('should reject empty instrument name', () => {
      const leg = {
        instrument_name: '',
        side: 'buy',
        amount: 0.5,
      };
      const result = LegSchema.safeParse(leg);
      expect(result.success).toBe(false);
    });
  });

  describe('TradeSpecSchema', () => {
    const validTradeSpec = {
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
      explanation: 'Bullish bet on ETH',
    };

    it('should validate a valid single-leg trade spec', () => {
      const result = TradeSpecSchema.safeParse(validTradeSpec);
      expect(result.success).toBe(true);
    });

    it('should validate a multi-leg trade spec (spread)', () => {
      const spread = {
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
        explanation: 'Limited risk bullish spread',
      };
      const result = TradeSpecSchema.safeParse(spread);
      expect(result.success).toBe(true);
    });

    it('should reject empty legs array', () => {
      const invalid = { ...validTradeSpec, legs: [] };
      const result = TradeSpecSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject missing underlying', () => {
      const { underlying, ...rest } = validTradeSpec;
      const result = TradeSpecSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject negative max_cost_usd', () => {
      const invalid = { ...validTradeSpec, max_cost_usd: -10 };
      const result = TradeSpecSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject missing explanation', () => {
      const { explanation, ...rest } = validTradeSpec;
      const result = TradeSpecSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should accept zero max_cost_usd (credit trades)', () => {
      const credit = { ...validTradeSpec, max_cost_usd: 0 };
      const result = TradeSpecSchema.safeParse(credit);
      expect(result.success).toBe(true);
    });
  });

  describe('ParseIntentRequestSchema', () => {
    it('should validate a valid intent', () => {
      const result = ParseIntentRequestSchema.safeParse({
        intent: 'ETH bullish, 2 weeks, max loss $200',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty intent', () => {
      const result = ParseIntentRequestSchema.safeParse({ intent: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing intent', () => {
      const result = ParseIntentRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('ExecuteTradeRequestSchema', () => {
    const validTradeSpec = {
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
      explanation: 'Bullish bet on ETH',
    };

    it('should validate a confirmed trade request', () => {
      const result = ExecuteTradeRequestSchema.safeParse({
        tradeSpec: validTradeSpec,
        confirmed: true,
      });
      expect(result.success).toBe(true);
    });

    it('should reject unconfirmed trade request', () => {
      const result = ExecuteTradeRequestSchema.safeParse({
        tradeSpec: validTradeSpec,
        confirmed: false,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing confirmation', () => {
      const result = ExecuteTradeRequestSchema.safeParse({
        tradeSpec: validTradeSpec,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('LyraTickerSchema', () => {
    it('should validate a valid ticker with liquidity', () => {
      const ticker = {
        instrument_name: 'ETH-20250110-3500-C',
        best_bid_price: '100.5',
        best_bid_amount: '10',
        best_ask_price: '102.5',
        best_ask_amount: '10',
        mark_price: '101.5',
        index_price: '3400',
        timestamp: 1704067200000,
      };
      const result = LyraTickerSchema.safeParse(ticker);
      expect(result.success).toBe(true);
    });

    it('should validate a ticker with null bid/ask (no liquidity)', () => {
      const ticker = {
        instrument_name: 'ETH-20250110-3500-C',
        best_bid_price: null,
        best_bid_amount: null,
        best_ask_price: null,
        best_ask_amount: null,
        mark_price: '101.5',
        index_price: '3400',
        timestamp: 1704067200000,
      };
      const result = LyraTickerSchema.safeParse(ticker);
      expect(result.success).toBe(true);
    });
  });

  describe('LyraInstrumentSchema', () => {
    it('should validate a valid option instrument', () => {
      const instrument = {
        instrument_name: 'ETH-20250110-3500-C',
        instrument_type: 'option',
        underlying_currency: 'ETH',
        quote_currency: 'USDC',
        base_currency: 'ETH',
        strike: '3500',
        expiry: 1736496000,
        option_type: 'C',
        is_active: true,
        tick_size: '0.01',
        minimum_amount: '0.01',
        maximum_amount: '1000',
      };
      const result = LyraInstrumentSchema.safeParse(instrument);
      expect(result.success).toBe(true);
    });

    it('should validate a put option', () => {
      const instrument = {
        instrument_name: 'ETH-20250110-3000-P',
        instrument_type: 'option',
        underlying_currency: 'ETH',
        quote_currency: 'USDC',
        base_currency: 'ETH',
        strike: '3000',
        expiry: 1736496000,
        option_type: 'P',
        is_active: true,
        tick_size: '0.01',
        minimum_amount: '0.01',
        maximum_amount: '1000',
      };
      const result = LyraInstrumentSchema.safeParse(instrument);
      expect(result.success).toBe(true);
    });
  });
});

