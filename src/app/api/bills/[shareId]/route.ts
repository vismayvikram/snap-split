import { NextRequest, NextResponse } from "next/server";
import { getBill } from "@/lib/bills";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await context.params;
    const bill = await getBill(shareId);

    if (!bill) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
    return NextResponse.json(bill);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to load bill.";
    console.error("Bill read error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
