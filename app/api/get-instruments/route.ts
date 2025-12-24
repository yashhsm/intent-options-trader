import { NextRequest, NextResponse } from "next/server";
import { getInstruments } from "@/lib/lyra-client";
import { z } from "zod";

const RequestSchema = z.object({
  currency: z.string().min(1),
  expired: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
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

    const { currency, expired } = parseResult.data;

    const instruments = await getInstruments({
      currency: currency.toUpperCase(),
      instrument_type: "option",
      expired: expired ?? false,
    });

    // Filter to only active instruments
    const activeInstruments = instruments.filter((i) => i.is_active);

    // Group by expiry for easier UI consumption
    const byExpiry = new Map<number, typeof activeInstruments>();
    for (const inst of activeInstruments) {
      if (inst.expiry) {
        const existing = byExpiry.get(inst.expiry) || [];
        existing.push(inst);
        byExpiry.set(inst.expiry, existing);
      }
    }

    // Sort expiries and convert to array
    const sortedExpiries = Array.from(byExpiry.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([expiry, insts]) => ({
        expiry,
        expiryDate: new Date(expiry * 1000).toISOString(),
        instruments: insts.sort((a, b) => {
          const strikeA = parseFloat(a.strike || "0");
          const strikeB = parseFloat(b.strike || "0");
          if (strikeA !== strikeB) return strikeA - strikeB;
          return (a.option_type || "").localeCompare(b.option_type || "");
        }),
      }));

    return NextResponse.json({
      success: true,
      currency: currency.toUpperCase(),
      total: activeInstruments.length,
      expiries: sortedExpiries,
    });
  } catch (error) {
    console.error("Get instruments error:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch instruments",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

