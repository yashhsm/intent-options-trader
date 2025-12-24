import { NextRequest, NextResponse } from "next/server";
import { ExecuteTradeRequestSchema, TradeSpecSchema } from "@/lib/schemas";
import { getSafetyConfig, runSafetyChecks } from "@/lib/safety";
import { submitOrder } from "@/lib/lyra-auth";
import { getTicker } from "@/lib/lyra-client";

export async function POST(request: NextRequest) {
  try {
    // Parse and validate request
    const body = await request.json();
    const parseResult = ExecuteTradeRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parseResult.error.issues.map((e) => e.message).join(", "),
        },
        { status: 400 }
      );
    }

    const { tradeSpec, confirmed } = parseResult.data;

    // Verify confirmation
    if (!confirmed) {
      return NextResponse.json(
        { error: "Trade must be explicitly confirmed" },
        { status: 400 }
      );
    }

    // Re-validate TradeSpec schema
    const specValidation = TradeSpecSchema.safeParse(tradeSpec);
    if (!specValidation.success) {
      return NextResponse.json(
        {
          error: "Invalid trade specification",
          details: specValidation.error.issues.map((e) => e.message).join(", "),
        },
        { status: 400 }
      );
    }

    // Fetch current prices and re-run safety checks
    const config = getSafetyConfig();
    let totalEstimatedCost = 0;
    let maxSpread: number | null = null;

    const pricesMap = new Map<
      string,
      { bid: number | null; ask: number | null; mark: number }
    >();

    for (const leg of tradeSpec.legs) {
      try {
        const ticker = await getTicker({ instrument_name: leg.instrument_name });
        const bid = ticker.best_bid_price ? parseFloat(ticker.best_bid_price) : null;
        const ask = ticker.best_ask_price ? parseFloat(ticker.best_ask_price) : null;
        const mark = parseFloat(ticker.mark_price);

        pricesMap.set(leg.instrument_name, { bid, ask, mark });

        // Calculate cost (use ask for buys, bid for sells)
        if (leg.side === "buy") {
          const price = ask ?? mark;
          totalEstimatedCost += price * leg.amount;
        } else {
          const price = bid ?? mark;
          totalEstimatedCost -= price * leg.amount; // Credit
        }

        // Track spread
        if (bid !== null && ask !== null && bid > 0) {
          const mid = (bid + ask) / 2;
          const spread = mid > 0 ? ((ask - bid) / mid) * 100 : null;
          if (spread !== null) {
            maxSpread = maxSpread !== null ? Math.max(maxSpread, spread) : spread;
          }
        }
      } catch (error) {
        return NextResponse.json(
          {
            error: "Failed to fetch price for instrument",
            details: `${leg.instrument_name}: ${error instanceof Error ? error.message : "Unknown error"}`,
          },
          { status: 400 }
        );
      }
    }

    // Run safety checks
    const safetyResult = runSafetyChecks(tradeSpec, totalEstimatedCost, maxSpread);

    if (!safetyResult.all_passed && config.safeModeEnabled) {
      return NextResponse.json(
        {
          error: "Safety checks failed",
          safety_checks: safetyResult,
        },
        { status: 403 }
      );
    }

    // Execute orders for each leg
    const orders: Array<{
      instrument_name: string;
      order_id: string;
      status: string;
      error?: string;
    }> = [];

    for (const leg of tradeSpec.legs) {
      const prices = pricesMap.get(leg.instrument_name);
      if (!prices) {
        orders.push({
          instrument_name: leg.instrument_name,
          order_id: "",
          status: "failed",
          error: "No price data",
        });
        continue;
      }

      // Determine limit price (use mark with small offset for limit order)
      // Round to tick_size (0.1 for most options)
      let limitPrice: number;
      if (leg.side === "buy") {
        // For buy: use ask if available, else mark + 5% (to ensure fill)
        const rawPrice = (prices.ask && prices.ask > 0) ? prices.ask : prices.mark * 1.05;
        limitPrice = Math.ceil(rawPrice * 10) / 10; // Round up to nearest 0.1
      } else {
        // For sell: use bid if available, else mark - 5%
        const rawPrice = (prices.bid && prices.bid > 0) ? prices.bid : prices.mark * 0.95;
        limitPrice = Math.floor(rawPrice * 10) / 10; // Round down to nearest 0.1
      }

      try {
        const orderResponse = await submitOrder(
          leg.instrument_name,
          leg.side,
          leg.amount.toFixed(2), // Round amount to 2 decimal places (amount_step is 0.01)
          limitPrice.toFixed(1)  // Round price to 1 decimal place (tick_size is 0.1)
        );

        orders.push({
          instrument_name: leg.instrument_name,
          order_id: orderResponse.order_id,
          status: orderResponse.order_status,
        });
      } catch (error) {
        orders.push({
          instrument_name: leg.instrument_name,
          order_id: "",
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Check if all orders succeeded
    const allSucceeded = orders.every(
      (o) => o.status !== "failed" && o.order_id !== ""
    );

    return NextResponse.json({
      success: allSucceeded,
      orders,
      total_estimated_cost: Math.round(totalEstimatedCost * 100) / 100,
      safety_checks: safetyResult,
    });
  } catch (error) {
    console.error("Execute trade error:", error);
    return NextResponse.json(
      {
        error: "Failed to execute trade",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

