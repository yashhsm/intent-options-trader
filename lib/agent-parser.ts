/**
 * Agent-based Intent Parser
 * 
 * Uses Claude with tool calling to make data-driven decisions
 * about instrument selection based on real market data.
 */

import Anthropic from "@anthropic-ai/sdk";
import { TradeSpecSchema, type TradeSpec } from "./schemas";
import { LYRA_TOOL_DEFINITIONS, executeLyraTool } from "./lyra-tools";
import { debugLogger } from "./debug-logger";

// System prompt for the agent
const AGENT_SYSTEM_PROMPT = `You are an expert options trading assistant for Lyra/Derive protocol. Your job is to convert natural language trading intents into optimal TradeSpec JSON objects by querying real market data.

## MANDATORY WORKFLOW (YOU MUST FOLLOW THIS ORDER)

**STEP 1 - ALWAYS call lyra_get_index_price first** to get the current spot price.
**STEP 2 - ALWAYS call lyra_find_liquid_options** to find available options with good liquidity.
**STEP 3 - Analyze the returned data** to select the best instrument.
**STEP 4 - Calculate optimal sizing** to maximize budget usage (see Amount Sizing below).
**STEP 5 - Output the TradeSpec JSON** only after completing steps 1-4.

⚠️ CRITICAL: You MUST call at least lyra_get_index_price AND lyra_find_liquid_options before outputting any TradeSpec. NEVER skip the tool calls. NEVER guess instrument names or prices.

## Understanding the Intent

Parse the user's intent to extract:
- Underlying asset (ETH or BTC) - default to ETH if not specified
- Directional bias (bullish = calls, bearish = puts)
- Time horizon in days (e.g., "2 weeks" = 14 days, "1 month" = 30 days)
- Max loss budget in USD (default $200 if not specified)

## Amount Sizing (CRITICAL - MAXIMIZE BUDGET USAGE)

The goal is to use 80-100% of the user's max_loss budget, NOT to minimize position size.

**Formula for single-leg long options:**
1. Get the ASK price (or MARK price if no ask available) - this is what you pay to buy
2. Calculate: optimal_amount = floor((max_loss_usd / price_per_contract) * 100) / 100
3. Round to 2 decimal places (Lyra's amount_step is 0.01)
4. Clamp to safety limits: min 0.1, max 10.0 contracts
5. Verify: final_cost = price × amount ≤ max_loss_usd

**Examples:**
- User says "max loss $200", option price is $20
- optimal_amount = floor((200 / 20) * 100) / 100 = 10.0 contracts
- Final cost = $20 × 10.0 = $200 ✓ (100% of budget - PERFECT!)

- User says "max loss $200", option price is $180
- optimal_amount = floor((200 / 180) * 100) / 100 = 1.11 contracts
- Final cost = $180 × 1.11 = $199.80 ✓ (99.9% of budget - GOOD!)

- User says "max loss $200", option price is $25
- optimal_amount = floor((200 / 25) * 100) / 100 = 8.0 contracts
- Final cost = $25 × 8.0 = $200 ✓ (100% of budget - PERFECT!)

**IMPORTANT:** Always calculate the amount to maximize budget usage up to 10 contracts max.

## Output Format

Return a valid JSON object with this exact structure (NO markdown, NO code blocks, just raw JSON):

{
  "underlying": "ETH" or "BTC",
  "strategy": "Long Call" | "Long Put" | "Bull Call Spread" | "Bear Put Spread" | etc.,
  "expiry": "YYYYMMDD",
  "legs": [
    {
      "instrument_name": "ETH-20251227-3000-C",
      "side": "buy" or "sell",
      "amount": 1.0
    }
  ],
  "max_cost_usd": <CALCULATED: sum of (ask_price × amount) for buy legs>,
  "max_loss_usd": <user's stated limit, default 200>,
  "explanation": "<explain your instrument selection, why this expiry/strike, and the cost calculation>"
}

## Critical Rules

1. **MUST USE TOOLS** - You MUST call lyra_get_index_price and lyra_find_liquid_options before outputting
2. **LIQUIDITY REQUIRED** - Only select instruments where bid > 0 AND ask > 0
3. **MAXIMIZE BUDGET** - Size the trade to use 80-100% of max_loss_usd (within safety limits)
4. **VALID INSTRUMENTS ONLY** - Only use instrument_name values returned by the tools
5. **RAW JSON OUTPUT** - Output ONLY the JSON object, no markdown formatting

## Strategy Selection

- "bullish" or "calls" → Long Call
- "bearish" or "puts" → Long Put  
- "spread" with "bullish" → Bull Call Spread (buy lower strike, sell higher strike)
- "spread" with "bearish" → Bear Put Spread (buy higher strike, sell lower strike)

## Expiry Selection

- Convert user's time horizon to days
- Use lyra_find_liquid_options with min_days_to_expiry and max_days_to_expiry
- If user says "2 weeks", search for 10-20 days to expiry
- Prefer the closest expiry that has good liquidity

Today's date: ${new Date().toISOString().split("T")[0]}
`;

// Maximum iterations for the agent loop
const MAX_ITERATIONS = 10;

export class AgentParser {
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }
    this.client = new Anthropic({ apiKey });
  }

  async parseIntent(intent: string): Promise<TradeSpec> {
    debugLogger.aiRequest("AgentParser", `Starting agent loop for: "${intent.substring(0, 50)}..."`, { intent });

    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Parse this trading intent and create an optimal trade using real market data:\n\n"${intent}"\n\nRemember: You MUST call lyra_get_index_price and lyra_find_liquid_options BEFORE outputting any TradeSpec.`,
      },
    ];

    let iterations = 0;
    let toolCallCount = 0; // Track how many tool calls were made
    const toolIdsProcessed = new Set<string>(); // Track which tool IDs we've already processed
    const startTime = Date.now();

    while (iterations < MAX_ITERATIONS) {
      iterations++;
      debugLogger.info("AgentParser", `Agent iteration ${iterations}/${MAX_ITERATIONS}`);

      // Call Claude with tools
      const response = await this.client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: AGENT_SYSTEM_PROMPT,
        tools: LYRA_TOOL_DEFINITIONS.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema,
        })),
        messages,
      });

      debugLogger.info("AgentParser", `Response stop_reason: ${response.stop_reason}`, {
        contentBlocks: response.content.length,
      });

      // Process response content
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
      let textContent = "";

      for (const block of response.content) {
        if (block.type === "tool_use") {
          // Only process tool calls we haven't seen before
          if (!toolIdsProcessed.has(block.id)) {
            toolUseBlocks.push(block);
          }
        } else if (block.type === "text") {
          textContent += block.text;
        }
      }

      // If there are NEW tool calls, execute them
      if (toolUseBlocks.length > 0) {
        toolCallCount += toolUseBlocks.length; // Track tool usage
        
        // Add assistant message with the full response content
        messages.push({
          role: "assistant",
          content: response.content,
        });

        // Execute tools and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          // Mark this tool as processed
          toolIdsProcessed.add(toolUse.id);
          
          debugLogger.toolCall("Claude Agent", toolUse.name, {
            tool_use_id: toolUse.id,
            input: toolUse.input,
          });

          try {
            const result = await executeLyraTool(
              toolUse.name,
              toolUse.input as Record<string, unknown>
            );

            // Summarize large results
            let resultContent: string;
            if (Array.isArray(result) && result.length > 20) {
              // For large arrays, send summary + sample
              const summary = {
                total_count: result.length,
                sample: result.slice(0, 10),
                message: `Showing first 10 of ${result.length} results. Use more specific filters if needed.`,
              };
              resultContent = JSON.stringify(summary, null, 2);
            } else {
              resultContent = JSON.stringify(result, null, 2);
            }

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: resultContent,
            });

            debugLogger.toolResponse("Claude Agent", toolUse.name, {
              tool_use_id: toolUse.id,
              resultLength: resultContent.length,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            debugLogger.error("AgentParser", `Tool ${toolUse.name} failed: ${errorMessage}`);

            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: JSON.stringify({ error: errorMessage }),
              is_error: true,
            });
          }
        }

        // Add tool results to messages
        messages.push({
          role: "user",
          content: toolResults,
        });

        continue; // Continue the loop
      }

      // No tool calls - try to extract TradeSpec from text
      if (response.stop_reason === "end_turn" && textContent) {
        const duration = Date.now() - startTime;
        
        // VALIDATION: Ensure tools were used before accepting output
        if (toolCallCount < 2) {
          debugLogger.error("AgentParser", `Agent tried to output without using enough tools (used ${toolCallCount}, need at least 2)`, {
            textContent: textContent.substring(0, 200),
          });
          
          // Force the agent to use tools by adding a reminder as a new conversation turn
          messages.push({
            role: "assistant",
            content: [{ type: "text", text: textContent }],
          });
          messages.push({
            role: "user", 
            content: `ERROR: You must call lyra_get_index_price AND lyra_find_liquid_options before outputting a TradeSpec. You have only made ${toolCallCount} tool calls. Please call the required tools now.`,
          });
          continue; // Continue the loop to force tool usage
        }
        
        debugLogger.aiResponse("AgentParser", `Agent completed in ${iterations} iterations with ${toolCallCount} tool calls`, {
          duration,
          textLength: textContent.length,
          toolCallCount,
        }, duration);

        return this.extractTradeSpec(textContent);
      }

      // Unexpected state
      throw new Error(`Unexpected agent state: stop_reason=${response.stop_reason}, hasText=${!!textContent}`);
    }

    throw new Error(`Agent exceeded maximum iterations (${MAX_ITERATIONS})`);
  }

  private extractTradeSpec(text: string): TradeSpec {
    // Try to extract JSON from the response
    let jsonString = text.trim();

    // Handle markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1];
    }

    // Try to find JSON object in text
    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonString = objectMatch[0];
    }

    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      debugLogger.error("AgentParser", "Failed to parse JSON from agent response", {
        text: text.substring(0, 500),
      });
      throw new Error(`Failed to parse agent response as JSON: ${text.substring(0, 200)}`);
    }

    // Validate against schema
    const result = TradeSpecSchema.safeParse(parsed);
    if (!result.success) {
      const errors = result.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ");
      debugLogger.error("AgentParser", "TradeSpec validation failed", { errors, parsed });
      throw new Error(`TradeSpec schema validation failed: ${errors}`);
    }

    debugLogger.info("AgentParser", `TradeSpec extracted: ${result.data.strategy} on ${result.data.underlying}`, {
      legs: result.data.legs.length,
      maxLoss: result.data.max_loss_usd,
    });

    return result.data;
  }
}

// Singleton instance
let parserInstance: AgentParser | null = null;

export function getAgentParser(): AgentParser {
  if (!parserInstance) {
    parserInstance = new AgentParser();
  }
  return parserInstance;
}

