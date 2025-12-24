import { NextRequest, NextResponse } from "next/server";
import { ParseIntentRequestSchema } from "@/lib/schemas";
import { getAgentParser } from "@/lib/agent-parser";
import { debugLogger } from "@/lib/debug-logger";

export async function POST(request: NextRequest) {
  debugLogger.info("parse-intent", "POST request received");
  
  try {
    // Parse and validate request body
    const body = await request.json();
    debugLogger.info("parse-intent", "Request body parsed", { hasIntent: !!body.intent });
    
    const parseResult = ParseIntentRequestSchema.safeParse(body);

    if (!parseResult.success) {
      debugLogger.error("parse-intent", "Schema validation failed", {
        errors: parseResult.error.issues.map((e) => e.message),
      });
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parseResult.error.issues.map((e) => e.message).join(", "),
        },
        { status: 400 }
      );
    }

    const { intent } = parseResult.data;
    debugLogger.aiRequest("parse-intent", `Parsing intent: "${intent.substring(0, 50)}..."`, { intent });

    // Use the agent parser which queries real market data
    const parser = getAgentParser();
    const tradeSpec = await parser.parseIntent(intent);

    debugLogger.aiResponse("parse-intent", `Agent returned: ${tradeSpec.strategy} on ${tradeSpec.underlying}`, {
      strategy: tradeSpec.strategy,
      underlying: tradeSpec.underlying,
      legs: tradeSpec.legs.map((l) => ({
        instrument: l.instrument_name,
        side: l.side,
        amount: l.amount,
      })),
      maxLoss: tradeSpec.max_loss_usd,
    });

    return NextResponse.json({
      success: true,
      tradeSpec,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    debugLogger.error("parse-intent", `Error: ${message}`, {
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Check if it's a schema validation error
    if (message.includes("schema validation failed")) {
      return NextResponse.json(
        {
          error: "Agent output failed schema validation",
          details: message,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to parse intent",
        details: message,
      },
      { status: 500 }
    );
  }
}
