# Intent Options Trader

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An open-source web application for trading options on Lyra/Derive mainnet using natural language intents. Built with Next.js 14, Claude Agent SDK, and Lyra/Derive APIs.

## Features

- **Natural Language Parsing**: Describe trades like "ETH bullish, 2 weeks, max loss $200"
- **Claude Agent SDK**: Uses tool calling to fetch real market data before making trade decisions
- **Data-Driven Decisions**: Agent queries Lyra APIs for instruments, prices, and liquidity before selecting trades
- **Budget Optimization**: Automatically sizes trades to maximize usage of your max loss budget (up to 10 contracts)
- **Safety First**: SAFE_MODE enforces strict limits (max $200, max 10 contracts per leg, limit orders only)
- **Live Pricing**: Real-time bid/ask/mark prices from Lyra public API
- **Payoff Analysis**: Visual payoff chart with breakevens, max loss/gain calculated from real prices
- **One-Click Execution**: Execute trades on Lyra mainnet with confirmation
- **Debug Panel**: Real-time logging of all API calls, AI interactions, and tool executions

## Safety Constraints

When `SAFE_MODE=true` (default):

- Max trade cost: $200
- Max contracts per leg: 10 (allows budget optimization)
- Order type: Limit orders only
- Spread warning: > 5% bid-ask spread triggers warning

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create `.env.local` in the project root:

```env
# Claude API Key (required)
ANTHROPIC_API_KEY=your_anthropic_api_key

# Lyra/Derive Mainnet Credentials (required for execution)
LYRA_SESSION_PRIVATE_KEY=your_session_private_key
LYRA_WALLET_ADDRESS=your_wallet_address
LYRA_SUBACCOUNT_ID=your_subaccount_id

# Safety Configuration (optional - these are defaults)
SAFE_MODE=true
MAX_TRADE_COST_USD=200
MAX_CONTRACTS_PER_LEG=10
MAX_SPREAD_PERCENT=5

# Lyra EIP-712 Signing (required for mainnet)
ACTION_TYPEHASH=0x...
DOMAIN_SEPARATOR=0x...
TRADE_ADDRESS=0x...

# Lyra API (optional - defaults to mainnet)
LYRA_API_BASE_URL=https://api.lyra.finance
```

### 3. Generate Session Keys

You need Lyra session keys (NOT your owner wallet keys) for signing orders.

See: https://docs.derive.xyz/reference/session-keys

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Intent Input  │────▶│  /api/parse-     │────▶│  Claude Agent   │
│   (Frontend)    │     │  intent          │     │  SDK            │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                 │                        │
                                 │                        │ (tool calls)
                                 │                        ▼
                                 │              ┌──────────────────┐
                                 │              │  Lyra Tools      │
                                 │              │  (lib/lyra-      │
                                 │              │   tools.ts)      │
                                 │              └──────────────────┘
                                 │                        │
                                 │                        ▼
                                 │              ┌──────────────────┐
                                 │              │  Lyra Public API │
                                 │              │  (instruments,   │
                                 │              │   tickers)       │
                                 │              └──────────────────┘
                                 │                        │
                                 │                        │ (tool results)
                                 │                        ▼
                                 │              ┌──────────────────┐
                                 │              │  TradeSpec       │
                                 │              │  (Zod Schema)    │
                                 │              └──────────────────┘
                                 │                        │
        ┌────────────────────────┼────────────────────────┘
        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  /api/get-       │    │  Trade Preview   │    │  Safety Checks   │
│  prices          │    │  UI              │    │  (lib/safety.ts) │
└──────────────────┘    └──────────────────┘    └──────────────────┘
        │                        │                        │
        ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Lyra Public     │    │  Payoff Chart    │    │  /api/execute    │
│  API             │    │  (Recharts)      │    │  (if safe)       │
└──────────────────┘    └──────────────────┘    └──────────────────┘
                                                         │
                                                         ▼
                                                ┌──────────────────┐
                                                │  Lyra Private    │
                                                │  API (order)      │
                                                │  EIP-712 Signed  │
                                                └──────────────────┘
```

### How It Works

1. **User Input**: Natural language intent (e.g., "ETH bullish, 2 weeks, max loss $200")
2. **Claude Agent**: Uses tool calling to:
   - Get current index price (`lyra_get_index_price`)
   - Find liquid options (`lyra_find_liquid_options`)
   - Get specific ticker data (`lyra_get_ticker`, `lyra_get_multiple_tickers`)
3. **Trade Selection**: Agent analyzes market data and selects optimal instruments
4. **Budget Optimization**: Calculates contract size to maximize budget usage (up to 10 contracts)
5. **Safety Validation**: Checks cost, contracts, spreads before allowing execution
6. **Execution**: EIP-712 signed order submission to Lyra mainnet

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/parse-intent` | POST | Parse natural language to TradeSpec |
| `/api/get-instruments` | POST | Get available options for an underlying |
| `/api/get-prices` | POST/GET | Get live ticker prices |
| `/api/execute` | POST | Execute trade (requires confirmation) |

## TradeSpec Schema

```typescript
{
  underlying: string      // e.g., "ETH", "BTC"
  strategy: string        // e.g., "Long Call", "Bull Call Spread"
  expiry: string          // YYYYMMDD format
  legs: [
    {
      instrument_name: string  // Lyra format: ETH-20250110-3500-C
      side: "buy" | "sell"
      amount: number           // Contracts (e.g., 0.1, 1.0)
    }
  ]
  max_cost_usd: number    // Maximum cost to enter
  max_loss_usd: number    // Maximum possible loss
  explanation: string     // Brief trade explanation
}
```

## Key Files

```
lib/
├── schemas.ts        # Zod schemas for all data types
├── agent-parser.ts   # Claude Agent SDK integration with tool calling
├── lyra-tools.ts     # Lyra API tools for Claude Agent (get_instruments, get_ticker, etc.)
├── lyra-client.ts    # Lyra public API wrapper
├── lyra-auth.ts      # Lyra private API + EIP-712 signing
├── safety.ts         # SAFE_MODE validation
├── payoff.ts         # Payoff calculation utilities
└── debug-logger.ts   # Debug logging system for API calls, AI, and tools

app/api/
├── parse-intent/     # Claude parsing endpoint
├── get-instruments/  # Instrument discovery
├── get-prices/       # Live pricing
└── execute/          # Trade execution

components/
├── IntentInput.tsx       # Natural language input
├── TradePreview.tsx      # Trade details + safety checks
├── PayoffChart.tsx       # P&L visualization
├── ConfirmationModal.tsx # Execution confirmation
└── DebugPanel.tsx       # Real-time debug logs (API, AI, tools)
```

## Security Notes

1. **Never commit `.env.local`** - Contains API keys and private keys
2. **Use session keys, not owner wallet** - Session keys have limited permissions
3. **SAFE_MODE is ON by default** - Prevents accidental large trades
4. **All trades require explicit confirmation** - Checkbox + click required

## Testing

Run tests with Jest:

```bash
npm test
```

Tests cover:
- Schema validation
- Safety checks
- Payoff calculations
- Lyra client (mocked)
- API routes (mocked)

## Development

### Key Technologies

- **Next.js 14** (App Router)
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`)
- **Zod** (Schema validation)
- **Recharts** (Payoff visualization)
- **Ethers.js** (EIP-712 signing)
- **Tailwind CSS** + **shadcn/ui** (Styling)

### Tool Calling Flow

The Claude Agent uses these tools to make data-driven decisions:

1. `lyra_get_index_price` - Get current spot price
2. `lyra_get_instruments` - Discover available options
3. `lyra_get_ticker` - Get pricing for a single instrument
4. `lyra_get_multiple_tickers` - Batch pricing lookup
5. `lyra_find_liquid_options` - Find options with good liquidity

The agent is forced to use at least 2 tools before outputting a TradeSpec to ensure data-driven decisions.

### Debug Panel

Click the "Debug" button (bottom-right) to see:
- All API calls to Lyra with timestamps
- Claude Agent tool calls and responses
- AI request/response cycles
- Errors and warnings
- Performance metrics (duration, token counts)

## Known Limitations

- **Rate Limits**: Claude API has 30k tokens/minute limit. The agent may hit this with many iterations.
- **Liquidity**: Many options on Lyra have zero bid/ask, so the agent may fall back to mark prices.
- **Single User**: Currently designed for single-user scenarios.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### How to Contribute

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) by Anthropic
- Options trading powered by [Lyra/Derive](https://derive.xyz)
- UI components from [shadcn/ui](https://ui.shadcn.com)
