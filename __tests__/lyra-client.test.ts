import {
  getInstruments,
  getInstrument,
  getTicker,
  getTickersForInstruments,
  parseInstrumentName,
  findClosestExpiry,
} from '../lib/lyra-client';

// Mock fetch globally
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

describe('Lyra Client', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('parseInstrumentName', () => {
    it('should parse a valid call option name', () => {
      const result = parseInstrumentName('ETH-20250110-3500-C');
      expect(result).toEqual({
        underlying: 'ETH',
        expiry: '20250110',
        strike: 3500,
        optionType: 'C',
      });
    });

    it('should parse a valid put option name', () => {
      const result = parseInstrumentName('BTC-20250115-100000-P');
      expect(result).toEqual({
        underlying: 'BTC',
        expiry: '20250115',
        strike: 100000,
        optionType: 'P',
      });
    });

    it('should return null for invalid format', () => {
      expect(parseInstrumentName('INVALID')).toBeNull();
      expect(parseInstrumentName('ETH-PERP')).toBeNull();
      expect(parseInstrumentName('ETH-20250110-3500')).toBeNull();
      expect(parseInstrumentName('ETH-20250110-3500-X')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseInstrumentName('')).toBeNull();
    });
  });

  describe('getInstruments', () => {
    it('should fetch instruments successfully', async () => {
      const mockInstruments = [
        {
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
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { instruments: mockInstruments } }),
      } as Response);

      const result = await getInstruments({ currency: 'ETH' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.lyra.finance/public/get_instruments',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"currency":"ETH"'),
        })
      );

      expect(result).toEqual(mockInstruments);
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { code: 1000, message: 'Invalid currency' },
        }),
      } as Response);

      await expect(getInstruments({ currency: 'INVALID' })).rejects.toThrow(
        'Invalid currency'
      );
    });

    it('should handle network error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(getInstruments({ currency: 'ETH' })).rejects.toThrow(
        'Lyra API error: 500'
      );
    });
  });

  describe('getInstrument', () => {
    it('should fetch single instrument', async () => {
      const mockInstrument = {
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockInstrument }),
      } as Response);

      const result = await getInstrument({
        instrument_name: 'ETH-20250110-3500-C',
      });

      expect(result).toEqual(mockInstrument);
    });
  });

  describe('getTicker', () => {
    it('should fetch ticker with liquidity', async () => {
      const mockTicker = {
        instrument_name: 'ETH-20250110-3500-C',
        best_bid_price: '100.5',
        best_bid_amount: '10',
        best_ask_price: '102.5',
        best_ask_amount: '10',
        mark_price: '101.5',
        index_price: '3400',
        timestamp: 1704067200000,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTicker }),
      } as Response);

      const result = await getTicker({
        instrument_name: 'ETH-20250110-3500-C',
      });

      expect(result).toEqual(mockTicker);
    });

    it('should fetch ticker without liquidity (null bid/ask)', async () => {
      const mockTicker = {
        instrument_name: 'ETH-20250110-3500-C',
        best_bid_price: null,
        best_bid_amount: null,
        best_ask_price: null,
        best_ask_amount: null,
        mark_price: '101.5',
        index_price: '3400',
        timestamp: 1704067200000,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockTicker }),
      } as Response);

      const result = await getTicker({
        instrument_name: 'ETH-20250110-3500-C',
      });

      expect(result.best_bid_price).toBeNull();
      expect(result.best_ask_price).toBeNull();
      expect(result.mark_price).toBe('101.5');
    });
  });

  describe('getTickersForInstruments', () => {
    it('should fetch multiple tickers in parallel', async () => {
      const mockTicker1 = {
        instrument_name: 'ETH-20250110-3500-C',
        best_bid_price: '100',
        best_bid_amount: '10',
        best_ask_price: '102',
        best_ask_amount: '10',
        mark_price: '101',
        index_price: '3400',
        timestamp: 1704067200000,
      };

      const mockTicker2 = {
        instrument_name: 'ETH-20250110-4000-C',
        best_bid_price: '50',
        best_bid_amount: '10',
        best_ask_price: '52',
        best_ask_amount: '10',
        mark_price: '51',
        index_price: '3400',
        timestamp: 1704067200000,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTicker1 }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTicker2 }),
        } as Response);

      const result = await getTickersForInstruments([
        'ETH-20250110-3500-C',
        'ETH-20250110-4000-C',
      ]);

      expect(result.size).toBe(2);
      expect(result.get('ETH-20250110-3500-C')).toEqual(mockTicker1);
      expect(result.get('ETH-20250110-4000-C')).toEqual(mockTicker2);
    });

    it('should handle partial failures gracefully', async () => {
      const mockTicker1 = {
        instrument_name: 'ETH-20250110-3500-C',
        best_bid_price: '100',
        best_bid_amount: '10',
        best_ask_price: '102',
        best_ask_amount: '10',
        mark_price: '101',
        index_price: '3400',
        timestamp: 1704067200000,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: mockTicker1 }),
        } as Response)
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await getTickersForInstruments([
        'ETH-20250110-3500-C',
        'ETH-20250110-INVALID-C',
      ]);

      // Should still return the successful one
      expect(result.size).toBe(1);
      expect(result.get('ETH-20250110-3500-C')).toEqual(mockTicker1);
    });
  });

  describe('findClosestExpiry', () => {
    it('should find closest expiry date', async () => {
      const mockInstruments = [
        {
          instrument_name: 'ETH-20250103-3500-C',
          instrument_type: 'option',
          underlying_currency: 'ETH',
          quote_currency: 'USDC',
          base_currency: 'ETH',
          expiry: 1735891200, // Jan 3
          is_active: true,
          tick_size: '0.01',
          minimum_amount: '0.01',
          maximum_amount: '1000',
        },
        {
          instrument_name: 'ETH-20250110-3500-C',
          instrument_type: 'option',
          underlying_currency: 'ETH',
          quote_currency: 'USDC',
          base_currency: 'ETH',
          expiry: 1736496000, // Jan 10
          is_active: true,
          tick_size: '0.01',
          minimum_amount: '0.01',
          maximum_amount: '1000',
        },
        {
          instrument_name: 'ETH-20250117-3500-C',
          instrument_type: 'option',
          underlying_currency: 'ETH',
          quote_currency: 'USDC',
          base_currency: 'ETH',
          expiry: 1737100800, // Jan 17
          is_active: true,
          tick_size: '0.01',
          minimum_amount: '0.01',
          maximum_amount: '1000',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { instruments: mockInstruments } }),
      } as Response);

      const result = await findClosestExpiry('ETH', '20250108'); // Jan 8

      // Should find Jan 10 as closest
      expect(result).toBe(1736496000);
    });

    it('should return null if no instruments found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { instruments: [] } }),
      } as Response);

      const result = await findClosestExpiry('ETH', '20250110');

      expect(result).toBeNull();
    });
  });
});

