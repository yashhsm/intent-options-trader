# Intent Options Trader - Project Summary

## Overview

A private MVP web application that enables natural language options trading on Lyra/Derive mainnet. Users describe their trading intent in plain English, and the app automatically parses it, selects optimal instruments based on real market data, and executes the trade with one click.

## Key Features

### 🤖 Claude Agent SDK Integration
- Uses Claude Agent SDK with tool calling for intelligent, data-driven trade decisions
- Agent queries real market data from Lyra before making any trade selections
- Tools include: `lyra_get_index_price`, `lyra_get_instruments`, `lyra_get_ticker`, `lyra_find_liquid_options`
- Forced validation ensures agent uses at least 2 tools before outputting a TradeSpec

### 💰 Budget Optimization
- Automatically calculates optimal contract size to maximize usage of user's max loss budget
- Supports up to 10 contracts per leg (configurable via `MAX_CONTRACTS_PER_LEG`)
- Example: If user says "max loss $200" and option costs $20, agent buys 10 contracts = $200

### 🛡️ Safety First
- **SAFE_MODE** enabled by default with strict limits:
  - Max trade cost: $200
  - Max contracts per leg: 10
  - Limit orders only (no market orders)
  - Spread warnings for illiquid options
- All trades require explicit confirmation checkbox
- Real-time safety validation before execution

### 📊 Real-Time Market Data
- Live bid/ask/mark prices from Lyra public API
- Liquidity filtering (only selects options with actual bid/ask)
- Payoff analysis calculated from real prices, not estimates
- Visual payoff chart with breakevens, max loss/gain

### 🔍 Debug Panel
- Real-time logging of all API calls, AI interactions, and tool executions
- Timestamped entries with duration tracking
- Statistics for API calls, AI calls, tool calls, and errors
- Expandable entries to view full request/response data

### ⚡ One-Click Execution
- EIP-712 signed order submission to Lyra mainnet
- Session key authentication (not owner wallet)
- Automatic price rounding and limit price calculation
- Order confirmation with order IDs

## Technical Architecture

### Frontend
- **Next.js 14** (App Router)
- **Tailwind CSS** + **shadcn/ui** for modern, dark-themed UI
- **Recharts** for payoff visualization
- Real-time state management with React hooks

### Backend
- **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) for intelligent parsing
- **Zod** for schema validation
- **Ethers.js** for EIP-712 signing
- Custom tool definitions for Lyra API integration

### API Integration
- **Lyra Public API**: Instrument discovery, ticker data, pricing
- **Lyra Private API**: Order submission with EIP-712 signatures
- **Claude API**: Natural language understanding and tool orchestration

## Project Structure

```
intent-options-trader/
├── app/
│   ├── api/
│   │   ├── parse-intent/    # Claude Agent parsing endpoint
│   │   ├── get-prices/      # Live pricing endpoint
│   │   ├── get-instruments/ # Instrument discovery
│   │   └── execute/         # Trade execution
│   ├── page.tsx             # Main UI
│   └── layout.tsx           # Root layout
├── components/
│   ├── IntentInput.tsx      # Natural language input
│   ├── TradePreview.tsx     # Trade details + safety checks
│   ├── PayoffChart.tsx      # P&L visualization
│   ├── ConfirmationModal.tsx # Execution confirmation
│   └── DebugPanel.tsx       # Debug logging UI
├── lib/
│   ├── agent-parser.ts      # Claude Agent SDK integration
│   ├── lyra-tools.ts        # Lyra API tools for agent
│   ├── lyra-client.ts       # Lyra public API wrapper
│   ├── lyra-auth.ts         # Lyra private API + EIP-712 signing
│   ├── schemas.ts           # Zod validation schemas
│   ├── safety.ts            # Safety checks
│   ├── payoff.ts            # Payoff calculations
│   └── debug-logger.ts     # Debug logging system
└── __tests__/              # Comprehensive test suite
```

## How It Works

1. **User Input**: "ETH bullish, 2 weeks, max loss $200"
2. **Claude Agent**: 
   - Calls `lyra_get_index_price` to get current ETH price
   - Calls `lyra_find_liquid_options` to find liquid ETH calls expiring in ~14 days
   - Analyzes results and selects optimal instrument
   - Calculates contract size: $200 budget ÷ $20 premium = 10 contracts
3. **Trade Preview**: Shows legs, cost, max loss, breakevens, payoff chart
4. **Safety Validation**: Checks cost ≤ $200, contracts ≤ 10, spread acceptable
5. **Execution**: User confirms → EIP-712 signed order → Lyra mainnet

## Testing

Comprehensive test suite with Jest:
- Schema validation tests
- Safety check tests
- Payoff calculation tests
- Lyra client tests (mocked)
- API route tests (mocked)

Run tests: `npm test`

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` - Claude API key
- `LYRA_SESSION_PRIVATE_KEY` - Session key for signing (NOT owner wallet)
- `LYRA_WALLET_ADDRESS` - Wallet address
- `LYRA_SUBACCOUNT_ID` - Subaccount ID
- `ACTION_TYPEHASH` - EIP-712 action typehash for Lyra mainnet
- `DOMAIN_SEPARATOR` - EIP-712 domain separator for Lyra mainnet

Optional:
- `SAFE_MODE` - Enable safety checks (default: true)
- `MAX_TRADE_COST_USD` - Max trade cost (default: 200)
- `MAX_CONTRACTS_PER_LEG` - Max contracts (default: 10)
- `MAX_SPREAD_PERCENT` - Max spread warning threshold (default: 5)

## Security

- **Never commit `.env.local`** - Contains API keys and private keys
- **Use session keys, not owner wallet** - Limited permissions
- **SAFE_MODE enabled by default** - Prevents accidental large trades
- **Explicit confirmation required** - Checkbox + click to execute

## Known Limitations

- **Rate Limits**: Claude API has 30k tokens/minute limit. May hit this with many agent iterations.
- **Liquidity**: Many options on Lyra have zero bid/ask, so agent falls back to mark prices.
- **Single User**: Private MVP, not designed for multi-user scenarios.

## License

Private/Personal Use Only

## Commit Summary

This commit includes:
- ✅ Complete Claude Agent SDK integration with tool calling
- ✅ Lyra API tools for market data fetching
- ✅ Budget optimization logic
- ✅ Comprehensive debug panel
- ✅ EIP-712 signing for order execution
- ✅ Safety checks and validation
- ✅ Payoff analysis and visualization
- ✅ Full test suite
- ✅ Complete documentation

Total: 47 files changed, 15,386 insertions(+), 2,481 deletions(-)


