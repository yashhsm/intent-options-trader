/**
 * API Route Integration Tests
 * These test the API route handlers with mocked dependencies
 */

import { NextRequest } from 'next/server';

// Mock the external dependencies
jest.mock('../lib/claude-parser', () => ({
  getClaudeParser: jest.fn(() => ({
    parseIntent: jest.fn(),
  })),
}));

jest.mock('../lib/lyra-client', () => ({
  getInstruments: jest.fn(),
  getTicker: jest.fn(),
  getTickersForInstruments: jest.fn(),
}));

jest.mock('../lib/lyra-auth', () => ({
  submitOrder: jest.fn(),
  getAuthHeaders: jest.fn(),
}));

import { POST as parseIntentHandler } from '../app/api/parse-intent/route';
import { POST as getInstrumentsHandler } from '../app/api/get-instruments/route';
import { POST as getPricesHandler, GET as getIndexPriceHandler } from '../app/api/get-prices/route';
import { POST as executeHandler } from '../app/api/execute/route';
import { getClaudeParser } from '../lib/claude-parser';
import { getInstruments, getTicker, getTickersForInstruments } from '../lib/lyra-client';
import { submitOrder } from '../lib/lyra-auth';

const mockGetClaudeParser = getClaudeParser as jest.MockedFunction<typeof getClaudeParser>;
const mockGetInstruments = getInstruments as jest.MockedFunction<typeof getInstruments>;
const mockGetTicker = getTicker as jest.MockedFunction<typeof getTicker>;
const mockGetTickersForInstruments = getTickersForInstruments as jest.MockedFunction<typeof getTickersForInstruments>;
const mockSubmitOrder = submitOrder as jest.MockedFunction<typeof submitOrder>;

function createRequest(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost:3000/api/test', {
    method,
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('API Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/parse-intent', () => {
    it('should successfully parse a valid intent', async () => {
      const mockTradeSpec = {
        underlying: 'ETH',
        strategy: 'Long Call',
        expiry: '20250124',
        legs: [
          {
            instrument_name: 'ETH-20250124-3500-C',
            side: 'buy',
            amount: 0.5,
          },
        ],
        max_cost_usd: 200,
        max_loss_usd: 200,
        explanation: 'Bullish ETH trade',
      };

      mockGetClaudeParser.mockReturnValue({
        parseIntent: jest.fn().mockResolvedValue(mockTradeSpec),
      } as any);

      const request = createRequest({ intent: 'ETH bullish, 2 weeks, max loss $200' });
      const response = await parseIntentHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.tradeSpec).toEqual(mockTradeSpec);
    });

    it('should return 400 for empty intent', async () => {
      const request = createRequest({ intent: '' });
      const response = await parseIntentHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('should return 400 for missing intent', async () => {
      const request = createRequest({});
      const response = await parseIntentHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('should return 422 for schema validation failure', async () => {
      mockGetClaudeParser.mockReturnValue({
        parseIntent: jest.fn().mockRejectedValue(
          new Error('TradeSpec schema validation failed: missing required fields')
        ),
      } as any);

      const request = createRequest({ intent: 'invalid trade' });
      const response = await parseIntentHandler(request);
      const data = await response.json();

      expect(response.status).toBe(422);
      expect(data.error).toContain('schema validation');
    });

    it('should return 500 for unexpected errors', async () => {
      mockGetClaudeParser.mockReturnValue({
        parseIntent: jest.fn().mockRejectedValue(new Error('Network error')),
      } as any);

      const request = createRequest({ intent: 'ETH bullish' });
      const response = await parseIntentHandler(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to parse intent');
    });
  });

  describe('POST /api/get-instruments', () => {
    it('should fetch instruments for valid currency', async () => {
      const mockInstruments = [
        {
          instrument_name: 'ETH-20250124-3500-C',
          instrument_type: 'option',
          underlying_currency: 'ETH',
          quote_currency: 'USDC',
          base_currency: 'ETH',
          strike: '3500',
          expiry: 1737676800,
          option_type: 'C',
          is_active: true,
          tick_size: '0.01',
          minimum_amount: '0.01',
          maximum_amount: '1000',
        },
      ];

      mockGetInstruments.mockResolvedValue(mockInstruments);

      const request = createRequest({ currency: 'ETH' });
      const response = await getInstrumentsHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.currency).toBe('ETH');
      expect(data.total).toBe(1);
    });

    it('should return 400 for missing currency', async () => {
      const request = createRequest({});
      const response = await getInstrumentsHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/get-prices', () => {
    it('should fetch prices for valid instruments', async () => {
      const mockTickers = new Map([
        [
          'ETH-20250124-3500-C',
          {
            instrument_name: 'ETH-20250124-3500-C',
            best_bid_price: '100',
            best_bid_amount: '10',
            best_ask_price: '105',
            best_ask_amount: '10',
            mark_price: '102.5',
            index_price: '3400',
            timestamp: Date.now(),
          },
        ],
      ]);

      mockGetTickersForInstruments.mockResolvedValue(mockTickers);

      const request = createRequest({
        instrument_names: ['ETH-20250124-3500-C'],
      });
      const response = await getPricesHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.prices['ETH-20250124-3500-C']).toBeDefined();
      expect(data.prices['ETH-20250124-3500-C'].bid).toBe(100);
      expect(data.prices['ETH-20250124-3500-C'].ask).toBe(105);
    });

    it('should handle instruments not found', async () => {
      mockGetTickersForInstruments.mockResolvedValue(new Map());

      const request = createRequest({
        instrument_names: ['INVALID-INSTRUMENT'],
      });
      const response = await getPricesHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.not_found).toContain('INVALID-INSTRUMENT');
    });

    it('should return 400 for empty instrument list', async () => {
      const request = createRequest({ instrument_names: [] });
      const response = await getPricesHandler(request);

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/execute', () => {
    const validTradeSpec = {
      underlying: 'ETH',
      strategy: 'Long Call',
      expiry: '20250124',
      legs: [
        {
          instrument_name: 'ETH-20250124-3500-C',
          side: 'buy',
          amount: 0.5,
        },
      ],
      max_cost_usd: 100,
      max_loss_usd: 100,
      explanation: 'Test trade',
    };

    it('should execute a confirmed trade', async () => {
      mockGetTicker.mockResolvedValue({
        instrument_name: 'ETH-20250124-3500-C',
        best_bid_price: '100',
        best_bid_amount: '10',
        best_ask_price: '105',
        best_ask_amount: '10',
        mark_price: '102.5',
        index_price: '3400',
        timestamp: Date.now(),
      });

      mockSubmitOrder.mockResolvedValue({
        order_id: 'order-123',
        instrument_name: 'ETH-20250124-3500-C',
        direction: 'buy',
        amount: '0.5',
        limit_price: '105',
        order_status: 'open',
        filled_amount: '0',
        average_price: null,
        creation_timestamp: Date.now(),
      });

      const request = createRequest({
        tradeSpec: validTradeSpec,
        confirmed: true,
      });
      const response = await executeHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.orders).toHaveLength(1);
      expect(data.orders[0].order_id).toBe('order-123');
    });

    it('should reject unconfirmed trade', async () => {
      const request = createRequest({
        tradeSpec: validTradeSpec,
        confirmed: false,
      });
      const response = await executeHandler(request);
      const data = await response.json();

      // Zod validation catches the unconfirmed trade
      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid request');
    });

    it('should reject trade exceeding cost limit', async () => {
      const expensiveSpec = {
        ...validTradeSpec,
        legs: [
          {
            instrument_name: 'ETH-20250124-3500-C',
            side: 'buy',
            amount: 0.5,
          },
        ],
      };

      mockGetTicker.mockResolvedValue({
        instrument_name: 'ETH-20250124-3500-C',
        best_bid_price: '500',
        best_bid_amount: '10',
        best_ask_price: '550', // $550 * 0.5 = $275 > $200 limit
        best_ask_amount: '10',
        mark_price: '525',
        index_price: '3400',
        timestamp: Date.now(),
      });

      const request = createRequest({
        tradeSpec: expensiveSpec,
        confirmed: true,
      });
      const response = await executeHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Safety checks failed');
    });

    it('should reject trade with too many contracts', async () => {
      const highContractSpec = {
        ...validTradeSpec,
        legs: [
          {
            instrument_name: 'ETH-20250124-3500-C',
            side: 'buy',
            amount: 2, // Exceeds 1 contract limit
          },
        ],
      };

      mockGetTicker.mockResolvedValue({
        instrument_name: 'ETH-20250124-3500-C',
        best_bid_price: '50',
        best_bid_amount: '10',
        best_ask_price: '55',
        best_ask_amount: '10',
        mark_price: '52.5',
        index_price: '3400',
        timestamp: Date.now(),
      });

      const request = createRequest({
        tradeSpec: highContractSpec,
        confirmed: true,
      });
      const response = await executeHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.safety_checks.passes_max_contracts).toBe(false);
    });

    it('should handle order submission failure', async () => {
      mockGetTicker.mockResolvedValue({
        instrument_name: 'ETH-20250124-3500-C',
        best_bid_price: '100',
        best_bid_amount: '10',
        best_ask_price: '105',
        best_ask_amount: '10',
        mark_price: '102.5',
        index_price: '3400',
        timestamp: Date.now(),
      });

      mockSubmitOrder.mockRejectedValue(new Error('Insufficient margin'));

      const request = createRequest({
        tradeSpec: validTradeSpec,
        confirmed: true,
      });
      const response = await executeHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(false);
      expect(data.orders[0].status).toBe('failed');
      expect(data.orders[0].error).toContain('Insufficient margin');
    });
  });
});

