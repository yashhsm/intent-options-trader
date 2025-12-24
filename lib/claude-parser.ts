import Anthropic from "@anthropic-ai/sdk";
import { TradeSpecSchema, type TradeSpec } from "./schemas";

// Available instrument info to pass to Claude
export interface AvailableInstrument {
  instrument_name: string;
  strike: string;
  expiry: number;
  option_type: "C" | "P";
  is_active: boolean;
}

// Generate system prompt with available instruments
function getSystemPrompt(
  underlying: string,
  availableInstruments: AvailableInstrument[],
  indexPrice: number
): string {
  // Group instruments by expiry for cleaner display
  const byExpiry = new Map<string, AvailableInstrument[]>();
  for (const inst of availableInstruments) {
    const expiryDate = new Date(inst.expiry * 1000).toISOString().split('T')[0];
    if (!byExpiry.has(expiryDate)) {
      byExpiry.set(expiryDate, []);
    }
    byExpiry.get(expiryDate)!.push(inst);
  }

  // Format available instruments
  let instrumentList = "";
  for (const [expiry, instruments] of Array.from(byExpiry).slice(0, 3)) { // Limit to 3 expiries
    const calls = instruments.filter(i => i.option_type === "C").slice(0, 5);
    const puts = instruments.filter(i => i.option_type === "P").slice(0, 5);
    instrumentList += `\nExpiry ${expiry}:\n`;
    instrumentList += `  Calls: ${calls.map(i => i.instrument_name).join(", ")}\n`;
    instrumentList += `  Puts: ${puts.map(i => i.instrument_name).join(", ")}\n`;
  }

  return `You are a structured options trade parser for Lyra/Derive options protocol. Your ONLY job is to convert natural-language trading intents into a valid TradeSpec JSON object.

CURRENT MARKET DATA:
- Underlying: ${underlying}
- Current Index Price: $${indexPrice.toFixed(2)}

AVAILABLE INSTRUMENTS (YOU MUST USE THESE EXACT NAMES):
${instrumentList}

CRITICAL RULES:
1. Output ONLY valid JSON - no markdown, no explanations outside the JSON
2. You MUST use instrument names EXACTLY as listed above - do NOT invent new ones
3. Pick strikes that are appropriate for the strategy (ATM, OTM, ITM as needed)
4. Set max_cost_usd and max_loss_usd based on user's stated limits (default $200 if not specified)
5. amount should be in contracts (typically 0.1 for safety)
6. NEVER exceed the user's stated max loss

STRATEGY MAPPINGS:
- "bullish" / "long call" -> Buy a call option (pick strike near or slightly above current price)
- "bearish" / "long put" -> Buy a put option (pick strike near or slightly below current price)
- "bull call spread" -> Buy lower strike call + sell higher strike call
- "bear put spread" -> Buy higher strike put + sell lower strike put
- "straddle" -> Buy call + buy put at same strike (ATM)
- "strangle" -> Buy OTM call + buy OTM put at different strikes

OUTPUT SCHEMA (EXACT):
{
  "underlying": "${underlying}",
  "strategy": string,        // e.g., "Long Call", "Bull Call Spread"
  "expiry": string,          // YYYYMMDD format from the instrument name
  "legs": [
    {
      "instrument_name": string,  // MUST be from the available list above
      "side": "buy" | "sell",
      "amount": number            // Use 0.1 for safety
    }
  ],
  "max_cost_usd": number,    // Maximum cost to enter position
  "max_loss_usd": number,    // Maximum possible loss (from user input)
  "explanation": string      // Brief explanation of the trade
}`;
}

export class ClaudeParser {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    this.client = new Anthropic({ apiKey });
  }

  async parseIntent(
    intent: string,
    underlying: string,
    availableInstruments: AvailableInstrument[],
    indexPrice: number
  ): Promise<TradeSpec> {
    const systemPrompt = getSystemPrompt(underlying, availableInstruments, indexPrice);
    
    // Make exactly ONE Claude API call
    const response = await this.client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Parse this trading intent into a TradeSpec JSON. Remember to use ONLY instruments from the available list:\n\n"${intent}"`,
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      throw new Error("No text response from Claude");
    }

    const rawText = textContent.text.trim();

    // Try to extract JSON from the response
    let jsonString = rawText;

    // Handle case where Claude wraps in markdown code block
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1];
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error(
        `Failed to parse Claude response as JSON: ${rawText.substring(0, 200)}`
      );
    }

    // Validate against schema
    const result = TradeSpecSchema.safeParse(parsed);
    if (!result.success) {
      const errors = result.error.issues
        .map((e) => `${e.path.join(".")}: ${e.message}`)
        .join(", ");
      throw new Error(`TradeSpec schema validation failed: ${errors}`);
    }

    return result.data;
  }
}

// Singleton instance
let parserInstance: ClaudeParser | null = null;

export function getClaudeParser(): ClaudeParser {
  if (!parserInstance) {
    parserInstance = new ClaudeParser();
  }
  return parserInstance;
}
