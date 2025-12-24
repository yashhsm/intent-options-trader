import { ClaudeParser } from '../lib/claude-parser';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      messages: {
        create: jest.fn(),
      },
    })),
  };
});

import Anthropic from '@anthropic-ai/sdk';

const MockedAnthropic = Anthropic as jest.MockedClass<typeof Anthropic>;

describe('ClaudeParser', () => {
  let parser: ClaudeParser;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    MockedAnthropic.mockImplementation(() => ({
      messages: {
        create: mockCreate,
      },
    } as any));
    
    parser = new ClaudeParser();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('parseIntent', () => {
    it('should parse a valid bullish intent', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
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
              explanation: 'Bullish bet on ETH with limited downside',
            }),
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await parser.parseIntent('ETH bullish, 2 weeks, max loss $200');

      expect(result.underlying).toBe('ETH');
      expect(result.strategy).toBe('Long Call');
      expect(result.legs).toHaveLength(1);
      expect(result.legs[0].side).toBe('buy');
      expect(result.max_loss_usd).toBe(200);
    });

    it('should parse a bearish put intent', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              underlying: 'BTC',
              strategy: 'Long Put',
              expiry: '20250131',
              legs: [
                {
                  instrument_name: 'BTC-20250131-90000-P',
                  side: 'buy',
                  amount: 0.1,
                },
              ],
              max_cost_usd: 150,
              max_loss_usd: 150,
              explanation: 'Bearish protection on BTC',
            }),
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await parser.parseIntent('BTC bearish put, max $150');

      expect(result.underlying).toBe('BTC');
      expect(result.strategy).toBe('Long Put');
      expect(result.legs[0].instrument_name).toContain('-P');
    });

    it('should parse a spread strategy', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              underlying: 'ETH',
              strategy: 'Bull Call Spread',
              expiry: '20250124',
              legs: [
                {
                  instrument_name: 'ETH-20250124-3500-C',
                  side: 'buy',
                  amount: 1,
                },
                {
                  instrument_name: 'ETH-20250124-4000-C',
                  side: 'sell',
                  amount: 1,
                },
              ],
              max_cost_usd: 100,
              max_loss_usd: 100,
              explanation: 'Limited risk bull call spread',
            }),
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await parser.parseIntent('ETH bull call spread $100 budget');

      expect(result.strategy).toBe('Bull Call Spread');
      expect(result.legs).toHaveLength(2);
      expect(result.legs[0].side).toBe('buy');
      expect(result.legs[1].side).toBe('sell');
    });

    it('should handle JSON wrapped in markdown code block', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: '```json\n' + JSON.stringify({
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
              explanation: 'Test',
            }) + '\n```',
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await parser.parseIntent('ETH bullish');

      expect(result.underlying).toBe('ETH');
    });

    it('should throw error for invalid JSON response', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: 'This is not valid JSON',
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      await expect(parser.parseIntent('invalid')).rejects.toThrow(
        'Failed to parse Claude response as JSON'
      );
    });

    it('should throw error for schema validation failure', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              underlying: 'ETH',
              // Missing required fields
            }),
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      await expect(parser.parseIntent('incomplete')).rejects.toThrow(
        'schema validation failed'
      );
    });

    it('should throw error when Claude returns no text', async () => {
      const mockResponse = {
        content: [],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      await expect(parser.parseIntent('test')).rejects.toThrow(
        'No text response from Claude'
      );
    });

    it('should handle straddle strategy', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              underlying: 'ETH',
              strategy: 'Straddle',
              expiry: '20250124',
              legs: [
                {
                  instrument_name: 'ETH-20250124-3500-C',
                  side: 'buy',
                  amount: 0.5,
                },
                {
                  instrument_name: 'ETH-20250124-3500-P',
                  side: 'buy',
                  amount: 0.5,
                },
              ],
              max_cost_usd: 200,
              max_loss_usd: 200,
              explanation: 'Volatility play - profit from big move either way',
            }),
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await parser.parseIntent('ETH straddle');

      expect(result.strategy).toBe('Straddle');
      expect(result.legs).toHaveLength(2);
      // One call and one put
      expect(result.legs.some(l => l.instrument_name.endsWith('-C'))).toBe(true);
      expect(result.legs.some(l => l.instrument_name.endsWith('-P'))).toBe(true);
    });

    it('should respect amount constraints in response', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              underlying: 'ETH',
              strategy: 'Long Call',
              expiry: '20250124',
              legs: [
                {
                  instrument_name: 'ETH-20250124-3500-C',
                  side: 'buy',
                  amount: 0.1, // Small amount
                },
              ],
              max_cost_usd: 50,
              max_loss_usd: 50,
              explanation: 'Small position',
            }),
          },
        ],
      };

      mockCreate.mockResolvedValueOnce(mockResponse);

      const result = await parser.parseIntent('Small ETH bet, $50 max');

      expect(result.legs[0].amount).toBe(0.1);
      expect(result.max_cost_usd).toBe(50);
    });
  });
});

