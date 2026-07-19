/**
 * splitCalculator.ts
 *
 * Pure, isolated calculation engine — no React, no JSX, fully unit-testable.
 *
 * Glossary
 * ────────
 * itemsSubtotal   – sum of all item line-totals (before any charges/deductions)
 * personSubtotal  – sum of (item.price ÷ sharers count) for every item that
 *                   person is assigned to
 * proportional    – scaled by (personSubtotal / itemsSubtotal); used for tax,
 *                   tip, and discount
 * even            – divided equally across all friends; used for serviceCharge
 */

// ---------------------------------------------------------------------------
// Input types (mirrors what page.tsx already uses — kept purposely minimal so
// this file has zero import dependencies on React or Next.js internals)
// ---------------------------------------------------------------------------

export interface CalcItem {
  id: string;
  name: string;
  qty: number;
  price: number; // line total (not unit price)
}

/** itemId → friendId[] */
export type CalcAssignments = Record<string, string[]>;

export interface CalcFriend {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface PersonResult {
  friendId: string;
  friendName: string;
  /** Raw sum of item shares (before extras) */
  subtotal: number;
  /** Proportional share of tax */
  taxShare: number;
  /** Proportional share of tip */
  tipShare: number;
  /** Even share of service charge */
  serviceChargeShare: number;
  /** Proportional discount reduction */
  discountShare: number;
  /** Final amount owed */
  total: number;
  /** Per-item breakdown for receipt display */
  itemBreakdown: {
    itemId: string;
    itemName: string;
    itemLineTotal: number;
    sharers: number;
    share: number;
  }[];
}

export interface SplitResult {
  /** Grand total of all personResults (sanity-check column) */
  grandTotal: number;
  /** Sum of raw item prices as a convenience reference */
  itemsSubtotal: number;
  perPerson: PersonResult[];
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * calculateSplit
 *
 * @param items         – finalized bill items (each has an `id` and `price`)
 * @param friends       – all splitting parties
 * @param assignments   – which friends share each item  (itemId → friendId[])
 * @param tax           – total tax dollar amount
 * @param tip           – total tip dollar amount
 * @param serviceCharge – total service charge / fee dollar amount
 * @param discount      – total discount dollar amount (positive value = reduction)
 *
 * Returns a `SplitResult` with per-person breakdowns and a grand total.
 * Throws a `RangeError` if any item has no assignees (caller must validate
 * the UI gate before calling this function).
 */
export function calculateSplit(
  items: CalcItem[],
  friends: CalcFriend[],
  tax: number,
  tip: number,
  serviceCharge: number,
  discount: number,
  assignments: CalcAssignments
): SplitResult {
  if (friends.length === 0) {
    throw new RangeError("calculateSplit: friends list must not be empty.");
  }

  const friendIds = new Set(friends.map((friend) => friend.id));
  if (friendIds.size !== friends.length) {
    throw new RangeError("calculateSplit: friend IDs must be unique.");
  }

  // -- 1. Validate all assignments -------------------------------------------
  for (const item of items) {
    const assignees = assignments[item.id] ?? [];
    if (assignees.length === 0) {
      throw new RangeError(
        `calculateSplit: item "${item.name || item.id}" has no assignees.`
      );
    }

    const uniqueAssignees = new Set(assignees);
    if (uniqueAssignees.size !== assignees.length) {
      throw new RangeError(
        `calculateSplit: item "${item.name || item.id}" has duplicate assignees.`
      );
    }

    for (const friendId of assignees) {
      if (!friendIds.has(friendId)) {
        throw new RangeError(
          `calculateSplit: item "${item.name || item.id}" is assigned to an unknown friend.`
        );
      }
    }
  }

  // -- 2. Compute itemsSubtotal ----------------------------------------------
  const itemsSubtotal = items.reduce((sum, it) => sum + it.price, 0);

  // -- 3. Build per-person subtotals and breakdowns --------------------------
  const personMap = new Map<
    string,
    {
      subtotal: number;
      itemBreakdown: PersonResult["itemBreakdown"];
    }
  >();

  for (const friend of friends) {
    personMap.set(friend.id, { subtotal: 0, itemBreakdown: [] });
  }

  for (const item of items) {
    const assignees = assignments[item.id]!;
    const sharers = assignees.length;
    const share = item.price / sharers;

    for (const friendId of assignees) {
      const p = personMap.get(friendId);
      if (!p) continue; // friend was removed -- skip (UI gate prevents this)
      p.subtotal += share;
      p.itemBreakdown.push({
        itemId: item.id,
        itemName: item.name || "(unnamed)",
        itemLineTotal: item.price,
        sharers,
        share,
      });
    }
  }

  // -- 4. Compute per-person extras ------------------------------------------
  const evenShare = serviceCharge / friends.length; // service charge: even split
  const n = friends.length;

  const perPerson: PersonResult[] = friends.map((friend) => {
    const p = personMap.get(friend.id)!;

    // Proportional ratio (fallback to even if itemsSubtotal is 0 -- avoids div/0)
    const ratio = itemsSubtotal > 0 ? p.subtotal / itemsSubtotal : 1 / n;

    const taxShare = tax * ratio;
    const tipShare = tip * ratio;
    const serviceChargeShare = evenShare;
    const discountShare = discount * ratio;

    const total =
      p.subtotal + taxShare + tipShare + serviceChargeShare - discountShare;

    return {
      friendId: friend.id,
      friendName: friend.name,
      subtotal: round2(p.subtotal),
      taxShare: round2(taxShare),
      tipShare: round2(tipShare),
      serviceChargeShare: round2(serviceChargeShare),
      discountShare: round2(discountShare),
      total: round2(total),
      itemBreakdown: p.itemBreakdown,
    };
  });

  // -- 5. Grand total --------------------------------------------------------
  // Should equal itemsSubtotal + tax + tip + svc - discount (within rounding)
  const grandTotal = round2(perPerson.reduce((sum, p) => sum + p.total, 0));

  return {
    grandTotal,
    itemsSubtotal: round2(itemsSubtotal),
    perPerson,
  };
}
