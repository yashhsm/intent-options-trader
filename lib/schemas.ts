import { z } from "zod";

// Leg schema for individual options positions
export const LegSchema = z.object({
  instrument_name: z.string().min(1, "Instrument name is required"),
  side: z.enum(["buy", "sell"]),
  amount: z.number().positive("Amount must be positive"),
});

export type Leg = z.infer<typeof LegSchema>;

// TradeSpec schema - EXACT schema from requirements
export const TradeSpecSchema = z.object({
  underlying: z.string().min(1, "Underlying is required"),
  strategy: z.string().min(1, "Strategy is required"),
  expiry: z.string().min(1, "Expiry is required"),
  legs: z.array(LegSchema).min(1, "At least one leg is required"),
  max_cost_usd: z.number().nonnegative("Max cost must be non-negative"),
  max_loss_usd: z.number().nonnegative("Max loss must be non-negative"),
  explanation: z.string().min(1, "Explanation is required"),
});

export type TradeSpec = z.infer<typeof TradeSpecSchema>;

// Lyra option details schema
export const LyraOptionDetailsSchema = z.object({
  index: z.string(),
  expiry: z.number(),
  strike: z.string(),
  option_type: z.enum(["C", "P"]),
  settlement_price: z.string().nullable(),
});

// Lyra instrument schema
export const LyraInstrumentSchema = z.object({
  instrument_name: z.string(),
  instrument_type: z.string(),
  quote_currency: z.string(),
  base_currency: z.string(),
  is_active: z.boolean(),
  tick_size: z.string(),
  minimum_amount: z.string(),
  maximum_amount: z.string(),
  option_details: LyraOptionDetailsSchema.nullable().optional(),
});

export type LyraOptionDetails = z.infer<typeof LyraOptionDetailsSchema>;
export type LyraInstrument = z.infer<typeof LyraInstrumentSchema>;

// Lyra ticker schema
export const LyraTickerSchema = z.object({
  instrument_name: z.string(),
  best_bid_price: z.string().nullable(),
  best_bid_amount: z.string().nullable(),
  best_ask_price: z.string().nullable(),
  best_ask_amount: z.string().nullable(),
  mark_price: z.string(),
  index_price: z.string(),
  timestamp: z.number(),
});

export type LyraTicker = z.infer<typeof LyraTickerSchema>;

// Trade preview with enriched data
export const TradePreviewSchema = z.object({
  tradeSpec: TradeSpecSchema,
  legs: z.array(
    z.object({
      instrument_name: z.string(),
      side: z.enum(["buy", "sell"]),
      amount: z.number(),
      bid_price: z.number().nullable(),
      ask_price: z.number().nullable(),
      mark_price: z.number(),
      estimated_cost: z.number(),
    })
  ),
  total_estimated_cost: z.number(),
  max_loss: z.number(),
  max_gain: z.number().nullable(), // null = unlimited
  breakevens: z.array(z.number()),
  safety_checks: z.object({
    passes_max_cost: z.boolean(),
    passes_max_contracts: z.boolean(),
    passes_spread_check: z.boolean(),
    spread_percent: z.number().nullable(),
    all_passed: z.boolean(),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
  }),
});

export type TradePreview = z.infer<typeof TradePreviewSchema>;

// Parse intent request
export const ParseIntentRequestSchema = z.object({
  intent: z.string().min(1, "Intent is required"),
});

export type ParseIntentRequest = z.infer<typeof ParseIntentRequestSchema>;

// Execute trade request
export const ExecuteTradeRequestSchema = z.object({
  tradeSpec: TradeSpecSchema,
  confirmed: z.boolean().refine((val) => val === true, {
    message: "Trade must be explicitly confirmed",
  }),
});

export type ExecuteTradeRequest = z.infer<typeof ExecuteTradeRequestSchema>;

// Order response from Lyra
export const LyraOrderResponseSchema = z.object({
  order_id: z.string(),
  instrument_name: z.string(),
  direction: z.enum(["buy", "sell"]),
  amount: z.string(),
  limit_price: z.string(),
  order_status: z.string(),
  filled_amount: z.string(),
  average_price: z.string().nullable(),
  creation_timestamp: z.number(),
});

export type LyraOrderResponse = z.infer<typeof LyraOrderResponseSchema>;

// Execution result
export const ExecutionResultSchema = z.object({
  success: z.boolean(),
  orders: z.array(LyraOrderResponseSchema).optional(),
  error: z.string().optional(),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// API error response
export const ApiErrorSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

