import { NextRequest, NextResponse } from "next/server";
import { getTickersForInstruments, getTicker } from "@/lib/lyra-client";
import { z } from "zod";

const RequestSchema = z.object({
  instrument_names: z.array(z.string()).min(1),
});

export async function POST(request: NextRequest) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:POST',message:'POST entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  try {
    const body = await request.json();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:POST',message:'parsed body',data:{instrumentNames:body.instrument_names},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const parseResult = RequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: parseResult.error.issues.map((e) => e.message).join(", "),
        },
        { status: 400 }
      );
    }

    const { instrument_names } = parseResult.data;

    // Fetch all tickers in parallel
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:POST',message:'fetching tickers',data:{instrument_names},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const tickers = await getTickersForInstruments(instrument_names);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:POST',message:'got tickers',data:{tickersSize:tickers.size},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    // Convert to response format with parsed numbers
    const prices: Record<
      string,
      {
        bid: number | null;
        ask: number | null;
        mark: number;
        index: number;
        spread_percent: number | null;
      }
    > = {};

    for (const [name, ticker] of Array.from(tickers)) {
      console.log('[DEBUG] Raw ticker for', name, ':', JSON.stringify(ticker));
      // Parse bid/ask - treat "0" as no liquidity (null)
      const bidRaw = ticker.best_bid_price ? parseFloat(ticker.best_bid_price) : 0;
      const askRaw = ticker.best_ask_price ? parseFloat(ticker.best_ask_price) : 0;
      const bid = bidRaw > 0 ? bidRaw : null;
      const ask = askRaw > 0 ? askRaw : null;
      const mark = parseFloat(ticker.mark_price);
      const index = parseFloat(ticker.index_price);
      console.log('[DEBUG] Parsed prices - bid:', bid, 'ask:', ask, 'mark:', mark, 'index:', index);

      let spreadPercent: number | null = null;
      if (bid !== null && ask !== null && bid > 0) {
        const mid = (bid + ask) / 2;
        spreadPercent = mid > 0 ? ((ask - bid) / mid) * 100 : null;
      }

      prices[name] = {
        bid,
        ask,
        mark,
        index,
        spread_percent: spreadPercent !== null ? Math.round(spreadPercent * 100) / 100 : null,
      };
    }

    // Check which instruments were not found
    const notFound = instrument_names.filter((name) => !tickers.has(name));

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:POST',message:'returning prices',data:{pricesCount:Object.keys(prices).length,notFoundCount:notFound.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return NextResponse.json({
      success: true,
      prices,
      not_found: notFound,
    });
  } catch (error) {
    console.error("Get prices error:", error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:POST',message:'POST error',data:{error:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack:null},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return NextResponse.json(
      {
        error: "Failed to fetch prices",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Also support GET for fetching index price
export async function GET(request: NextRequest) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:GET',message:'GET entry',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
  // #endregion
  try {
    const searchParams = request.nextUrl.searchParams;
    const underlying = searchParams.get("underlying");
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:GET',message:'parsed params',data:{underlying},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    if (!underlying) {
      return NextResponse.json(
        { error: "Missing underlying parameter" },
        { status: 400 }
      );
    }

    // Get perp ticker for index price
    const perpName = `${underlying.toUpperCase()}-PERP`;
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:GET',message:'fetching perp ticker',data:{perpName},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    const ticker = await getTicker({ instrument_name: perpName });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:GET',message:'got ticker',data:{hasIndexPrice:!!ticker.index_price,indexPrice:ticker.index_price},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion

    return NextResponse.json({
      success: true,
      underlying: underlying.toUpperCase(),
      index_price: parseFloat(ticker.index_price),
      mark_price: parseFloat(ticker.mark_price),
    });
  } catch (error) {
    console.error("Get index price error:", error);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/35642e0d-3928-495b-9694-667215a9d08a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'get-prices/route.ts:GET',message:'GET error',data:{error:error instanceof Error?error.message:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    return NextResponse.json(
      {
        error: "Failed to fetch index price",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

