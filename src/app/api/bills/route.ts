import { NextRequest, NextResponse } from "next/server";
import { createBill } from "@/lib/bills";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !("bill" in body)) {
      return NextResponse.json({ error: "Request body must include a bill." }, { status: 400 });
    }

    const { bill } = body as { bill: unknown };
    const storedBill = await createBill(bill);
    return NextResponse.json(storedBill, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to save bill.";
    console.error("Bill creation error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
