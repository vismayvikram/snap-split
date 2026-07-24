import { NextRequest, NextResponse } from "next/server";
import { getBill, updatePaidStatus } from "@/lib/bills";

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

/**
 * PATCH /api/bills/:shareId
 * Body: { friendId: string, paid: boolean }
 *
 * Updates the paid status for a single person in the bill.
 * Honor-system: anyone with the share link can call this.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await context.params;
    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      !("friendId" in body) ||
      !("paid" in body) ||
      typeof (body as Record<string, unknown>).friendId !== "string" ||
      typeof (body as Record<string, unknown>).paid !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Request body must include friendId (string) and paid (boolean)." },
        { status: 400 }
      );
    }

    const { friendId, paid } = body as { friendId: string; paid: boolean };
    await updatePaidStatus(shareId, friendId, paid);
    return new NextResponse(null, { status: 204 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to update paid status.";
    console.error("Paid status update error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
