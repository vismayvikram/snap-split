"use client";

import React, { useState, useRef } from "react";
import { calculateSplit, type SplitResult } from "./splitCalculator";
import {
  Camera,
  Upload,
  Receipt,
  Loader2,
  AlertCircle,
  Sparkles,
  FileText,
  RotateCcw,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  PencilLine,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  Split,
  ShieldAlert,
  Share2,
} from "lucide-react";

// --- Types -------------------------------------------------------------------

interface StructuredItem {
  id: string;
  name: string;
  qty: number;
  price: number; // line total (qty x unitPrice)
  unitPrice: number; // internal - drives qty math, not shown as its own column
}

interface EditableData {
  currency: string;
  items: StructuredItem[];
  discount: number;
  serviceCharge: number;
  tax: number;
  tip: number;
  receiptTotal: number; // total as printed on the receipt / originally parsed - editable reference only
}

interface ApiStructuredData {
  currency: string;
  items: { name: string; qty: number; price: number }[];
  itemsSubtotal: number;
  discount: number;
  serviceCharge: number;
  tax: number;
  tip: number;
  total: number;
}

// Assignments: itemId → friendId[]
type Assignments = Record<string, string[]>;

interface Bill extends EditableData {
  friends: Friend[];
  assignments: Assignments;
  payeeUpiId?: string;
  payeeName?: string;
}

// --- Helpers -----------------------------------------------------------------

let _itemCounter = 0;
function newItemId() {
  return `item-${++_itemCounter}`;
}

function safeNum(n: unknown): number {
  return typeof n === "number" && !isNaN(n) ? n : 0;
}

function toEditable(raw: ApiStructuredData): EditableData {
  return {
    currency: raw.currency || "$",
    items: raw.items.map((it) => {
      const qty = safeNum(it.qty);
      const price = safeNum(it.price);
      return {
        ...it,
        qty,
        price,
        id: newItemId(),
        unitPrice: qty > 0 ? price / qty : price,
      };
    }),
    discount: safeNum(raw.discount),
    serviceCharge: safeNum(raw.serviceCharge),
    tax: safeNum(raw.tax),
    tip: safeNum(raw.tip),
    receiptTotal: safeNum(raw.total),
  };
}

function safeParseFloat(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function computeSubtotal(items: StructuredItem[]): number {
  return items.reduce((sum, it) => sum + it.price, 0);
}

function computeTotal(data: EditableData, itemsSubtotal: number): number {
  return itemsSubtotal - data.discount + data.serviceCharge + data.tax + data.tip;
}

const UPI_ID_PATTERN = /^[\w.-]+@[\w]+$/;

// --- EditCell ----------------------------------------------------------------

function EditCell({
  value,
  onChange,
  type = "text",
  className = "",
  align = "left",
  placeholder = "",
  min,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "number";
  className?: string;
  align?: "left" | "center" | "right";
  placeholder?: string;
  min?: string;
  step?: string;
}) {
  const alignClass =
    align === "center"
      ? "text-center"
      : align === "right"
        ? "text-right font-mono"
        : "text-left";
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      min={min}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-transparent border border-transparent rounded-md px-2 py-1 focus:outline-none focus:border-teal-500/50 focus:bg-slate-900/80 hover:border-slate-700/60 transition-colors text-slate-200 placeholder:text-slate-600 ${alignClass} ${className}`}
    />
  );
}

// --- ChargeRow ---------------------------------------------------------------

function ChargeRow({
  label,
  currency,
  value,
  onChange,
  colorClass = "text-slate-400",
}: {
  label: string;
  currency: string;
  value: string;
  onChange: (v: string) => void;
  colorClass?: string;
}) {
  return (
    <div className={`flex justify-between items-center px-2 ${colorClass}`}>
      <span className="text-xs">{label}</span>
      <div className="flex items-center gap-0.5">
        <span className="text-xs font-mono opacity-60">{currency}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-24 bg-transparent border border-transparent rounded-md px-1.5 py-0.5 text-right text-xs font-mono focus:outline-none focus:border-teal-500/50 focus:bg-slate-900/80 hover:border-slate-700/60 transition-colors ${colorClass}`}
        />
      </div>
    </div>
  );
}

// --- ReconciliationBadge -----------------------------------------------------

function ReconciliationBadge({
  computedTotal,
  receiptTotal,
  currency,
}: {
  computedTotal: number;
  receiptTotal: number;
  currency: string;
}) {
  const diff = Math.abs(computedTotal - receiptTotal);
  const matches = diff < 0.005;

  if (matches) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>Matches receipt total</span>
      </div>
    );
  }

  const sign = computedTotal > receiptTotal ? "+" : "-";
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span>
        Off by {currency}
        {diff.toFixed(2)} ({sign})
      </span>
    </div>
  );
}

// --- ReviewEditor ------------------------------------------------------------

function ReviewEditor({
  data,
  onChange,
}: {
  data: EditableData;
  onChange: (d: EditableData) => void;
}) {
  const computedSubtotal = computeSubtotal(data.items);
  const computedTotal = computeTotal(data, computedSubtotal);

  const updateItem = (id: string, field: "name" | "qty" | "price", raw: string) => {
      onChange({
        ...data,
        items: data.items.map((it) => {
          if (it.id !== id) return it;

          if (field === "name") return { ...it, name: raw };

          if (field === "qty") {
            const qty = safeParseFloat(raw);
            // rescale the line price to match the new quantity, using the item's unit price
            return { ...it, qty, price: qty * it.unitPrice };
          }

          if (field === "price") {
            const price = safeParseFloat(raw);
            // back-solve unit price so future qty edits keep scaling correctly
            const unitPrice = it.qty > 0 ? price / it.qty : price;
            return { ...it, price, unitPrice };
          }

          return it;
        }),
      });
  };

  const deleteItem = (id: string) => {
    onChange({ ...data, items: data.items.filter((it) => it.id !== id) });
  };

  const addItem = () => {
    onChange({
      ...data,
      items: [
        ...data.items,
        { id: newItemId(), name: "", qty: 1, price: 0, unitPrice: 0 },
      ],
    });
  };

  const setCharge =
    (field: keyof Omit<EditableData, "currency" | "items">) =>
      (raw: string) => {
        onChange({ ...data, [field]: safeParseFloat(raw) });
      };

  const fmtCharge = (n: number) => {
    const safe = typeof n === "number" && !isNaN(n) ? n : 0;
    return safe === 0 ? "0" : safe.toFixed(2);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">
          <PencilLine className="w-3 h-3" />
          <span>Editable Items</span>
        </div>
        <button
          onClick={addItem}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 hover:border-teal-500/40 transition-all active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" />
          Add item
        </button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_52px_90px_32px] gap-1 px-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
        <span>Item Name</span>
        <span className="text-center">Qty</span>
        <span className="text-right pr-2">Price</span>
        <span />
      </div>

      {/* Item rows */}
      <div className="flex flex-col divide-y divide-slate-900/50 max-h-72 overflow-y-auto">
        {data.items.length === 0 && (
          <div className="text-center py-6 text-slate-600 text-sm">
            No items - click Add item above
          </div>
        )}
        {data.items.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[1fr_52px_90px_32px] gap-1 items-center py-1"
          >
            <EditCell
              value={item.name}
              placeholder="Item name"
              onChange={(v) => updateItem(item.id, "name", v)}
              className="text-sm font-semibold w-full"
            />
            <EditCell
              type="number"
              value={String(item.qty)}
              min="0"
              step="1"
              onChange={(v) => updateItem(item.id, "qty", v)}
              align="center"
              className="text-sm w-full"
            />
            <EditCell
              type="number"
              value={String(item.price)}
              min="0"
              step="0.01"
              onChange={(v) => updateItem(item.id, "price", v)}
              align="right"
              className="text-sm text-teal-400 w-full"
            />
            <button
              onClick={() => deleteItem(item.id)}
              className="flex items-center justify-center w-7 h-7 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-all active:scale-90"
              aria-label="Delete item"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="border-t border-slate-900/80 pt-4 mt-1 flex flex-col gap-2.5">
        <div className="flex justify-between items-center px-2">
          <span className="text-xs text-slate-400">Items Subtotal</span>
          <div className="flex items-center gap-1">
            <span className="text-xs font-mono text-slate-400">
              {data.currency}
              {computedSubtotal.toFixed(2)}
            </span>
            <span className="text-[9px] text-slate-600 ml-1">(auto)</span>
          </div>
        </div>

        <ChargeRow
          label="Discount"
          currency={data.currency}
          value={fmtCharge(data.discount)}
          onChange={setCharge("discount")}
          colorClass="text-rose-400"
        />
        <ChargeRow
          label="Service Charge / Fees"
          currency={data.currency}
          value={fmtCharge(data.serviceCharge)}
          onChange={setCharge("serviceCharge")}
        />
        <ChargeRow
          label="Tax"
          currency={data.currency}
          value={fmtCharge(data.tax)}
          onChange={setCharge("tax")}
        />
        <ChargeRow
          label="Tip"
          currency={data.currency}
          value={fmtCharge(data.tip)}
          onChange={setCharge("tip")}
        />

        {/* Computed total - live, read-only */}
        <div className="flex justify-between items-center bg-slate-900/60 px-3 py-2.5 rounded-lg border border-slate-800/50 mt-1">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-extrabold text-white">Total Amount</span>
            <span className="text-[9px] text-slate-500 font-semibold">(auto)</span>
          </div>
          <span className="text-sm font-mono font-extrabold text-teal-400">
            {data.currency}
            {computedTotal.toFixed(2)}
          </span>
        </div>

        {/* Receipt's printed total - editable reference for reconciliation only */}
        <ChargeRow
          label="Receipt Total (as printed)"
          currency={data.currency}
          value={fmtCharge(data.receiptTotal)}
          onChange={setCharge("receiptTotal")}
        />

        <div className="flex justify-end mt-1">
          <ReconciliationBadge
            computedTotal={computedTotal}
            receiptTotal={data.receiptTotal}
            currency={data.currency}
          />
        </div>
      </div>
    </div>
  );
}

// --- Friend types -----------------------------------------------------------

interface Friend {
  id: string;
  name: string;
}

let _friendCounter = 0;
function newFriendId() {
  return `friend-${++_friendCounter}`;
}

// --- FriendList --------------------------------------------------------------

function FriendList({
  friends,
  onChange,
}: {
  friends: Friend[];
  onChange: (f: Friend[]) => void;
}) {
  const [input, setInput] = React.useState("");

  const addFriend = () => {
    const name = input.trim();
    if (!name) return;
    onChange([...friends, { id: newFriendId(), name }]);
    setInput("");
  };

  const removeFriend = (id: string) => {
    if (friends.length <= 1) return; // enforce minimum 1
    onChange(friends.filter((f) => f.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addFriend();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Chips */}
      <div className="flex flex-wrap gap-2 min-h-[40px]">
        {friends.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full bg-teal-500/10 border border-teal-500/25 text-teal-300 text-sm font-semibold"
          >
            <span>{f.name}</span>
            <button
              onClick={() => removeFriend(f.id)}
              disabled={friends.length <= 1}
              className="flex items-center justify-center w-4 h-4 rounded-full text-teal-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label={`Remove ${f.name}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          placeholder="Add a name..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={40}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 transition-colors"
        />
        <button
          onClick={addFriend}
          disabled={!input.trim()}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20 hover:bg-teal-500/20 hover:border-teal-500/40 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Gate hint */}
      {friends.length < 2 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Add at least one more person to split with — you already count as one.
        </p>
      ) : (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-400/70 bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-3 py-2">
          <CheckCircle2 className="w-3 h-3 shrink-0" />
          {friends.length} people ready to split. Add more or continue.
        </p>
      )}
    </div>
  );
}

// --- AssignmentScreen --------------------------------------------------------

// Avatar colour palette — deterministic per friend index
const FRIEND_COLORS = [
  { bg: "bg-teal-500/20",   border: "border-teal-500/40",   text: "text-teal-300",   dot: "bg-teal-400"   },
  { bg: "bg-violet-500/20", border: "border-violet-500/40", text: "text-violet-300", dot: "bg-violet-400" },
  { bg: "bg-amber-500/20",  border: "border-amber-500/40",  text: "text-amber-300",  dot: "bg-amber-400"  },
  { bg: "bg-rose-500/20",   border: "border-rose-500/40",   text: "text-rose-300",   dot: "bg-rose-400"   },
  { bg: "bg-sky-500/20",    border: "border-sky-500/40",    text: "text-sky-300",    dot: "bg-sky-400"    },
  { bg: "bg-emerald-500/20",border: "border-emerald-500/40",text: "text-emerald-300",dot: "bg-emerald-400"},
  { bg: "bg-pink-500/20",   border: "border-pink-500/40",   text: "text-pink-300",   dot: "bg-pink-400"   },
  { bg: "bg-orange-500/20", border: "border-orange-500/40", text: "text-orange-300", dot: "bg-orange-400" },
];

function friendColor(idx: number) {
  return FRIEND_COLORS[idx % FRIEND_COLORS.length];
}

function AssignmentScreen({
  data,
  friends,
  assignments,
  onAssignmentsChange,
}: {
  data: EditableData;
  friends: Friend[];
  assignments: Assignments;
  onAssignmentsChange: (a: Assignments) => void;
}) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Build a stable friendId→colorIndex map
  const friendColorMap = React.useMemo(() => {
    const m: Record<string, number> = {};
    friends.forEach((f, i) => { m[f.id] = i; });
    return m;
  }, [friends]);

  const toggleFriend = (itemId: string, friendId: string) => {
    const current = assignments[itemId] ?? [];
    const next = current.includes(friendId)
      ? current.filter((id) => id !== friendId)
      : [...current, friendId];
    onAssignmentsChange({ ...assignments, [itemId]: next });
  };

  const unassignedItems = data.items.filter(
    (it) => !(assignments[it.id]?.length > 0)
  );
  const allAssigned = unassignedItems.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Section header */}
      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1">
        <Split className="w-3 h-3" />
        <span>Tap an item to assign it</span>
      </div>

      {/* Unassigned warning banner */}
      {!allAssigned && (
        <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-bold">
              {unassignedItems.length}{" "}
              {unassignedItems.length === 1 ? "item" : "items"} unassigned
            </span>
            <span className="text-[11px] text-rose-400/70 leading-snug">
              Every item must belong to someone — unassigned items can&apos;t be charged to anyone.
            </span>
          </div>
        </div>
      )}

      {/* Item cards */}
      <div className="flex flex-col gap-2.5">
        {data.items.map((item) => {
          const assigned: string[] = assignments[item.id] ?? [];
          const assignedFriends = friends.filter((f) => assigned.includes(f.id));
          const isShared = assignedFriends.length >= 2;
          const isUnassigned = assignedFriends.length === 0;
          const isExpanded = expandedItem === item.id;

          // Card border accent
          const cardAccent = isUnassigned
            ? "border-slate-800 hover:border-slate-700"
            : isShared
              ? "border-violet-500/30 bg-violet-500/5"
              : "border-teal-500/25 bg-teal-500/5";

          return (
            <div
              key={item.id}
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${cardAccent}`}
            >
              {/* Card header — always visible, tap to expand */}
              <button
                onClick={() =>
                  setExpandedItem(isExpanded ? null : item.id)
                }
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left"
              >
                {/* Status dot */}
                <div
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isUnassigned
                      ? "bg-slate-700"
                      : isShared
                        ? "bg-violet-400"
                        : `${friendColor(friendColorMap[assigned[0]])?.dot ?? "bg-teal-400"}`
                  }`}
                />

                {/* Name + qty */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-200 truncate">
                    {item.name || <span className="text-slate-600 italic">Unnamed item</span>}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {item.qty > 1 && `×${item.qty} · `}
                    {data.currency}{item.price.toFixed(2)}
                  </p>
                </div>

                {/* Assignment state */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {isUnassigned ? (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700">
                      Unassigned
                    </span>
                  ) : isShared ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
                      <Split className="w-2.5 h-2.5" />
                      Shared ÷{assignedFriends.length}
                    </span>
                  ) : (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${friendColor(friendColorMap[assigned[0]])?.bg} ${friendColor(friendColorMap[assigned[0]])?.border} ${friendColor(friendColorMap[assigned[0]])?.text}`}>
                      {assignedFriends[0]?.name}
                    </span>
                  )}
                  <div
                    className={`w-5 h-5 flex items-center justify-center rounded-md text-slate-500 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                </div>
              </button>

              {/* Expanded friend picker */}
              {isExpanded && (
                <div className="px-3.5 pb-3.5 pt-1 border-t border-slate-800/60">
                  <p className="text-[10px] text-slate-500 font-semibold mb-2.5 uppercase tracking-wider">
                    Who had this?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {friends.map((f) => {
                      const isSelected = assigned.includes(f.id);
                      const ci = friendColorMap[f.id] ?? 0;
                      const c = friendColor(ci);
                      return (
                        <button
                          key={f.id}
                          onClick={() => toggleFriend(item.id, f.id)}
                          className={`flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95 ${
                            isSelected
                              ? `${c.bg} ${c.border} ${c.text}`
                              : "bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                          }`}
                        >
                          {isSelected ? (
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border border-slate-600 shrink-0" />
                          )}
                          {f.name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Per-person share for this item */}
                  {isShared && (
                    <p className="text-[11px] text-violet-400/70 mt-2.5">
                      {data.currency}{(item.price / assignedFriends.length).toFixed(2)} each
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      {allAssigned && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/8 border border-emerald-500/20 text-emerald-400">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="text-xs font-semibold">All items assigned — ready to split!</span>
        </div>
      )}
    </div>
  );
}

// --- ResultsScreen -----------------------------------------------------------

function ResultsScreen({ data, result, payee, onPayeeChange, onShare }: {
  data: EditableData;
  result: SplitResult;
  payee: Pick<Bill, "payeeName" | "payeeUpiId">;
  onPayeeChange: (payee: Pick<Bill, "payeeName" | "payeeUpiId">) => void;
  onShare: () => void;
}) {
  const upiId = payee.payeeUpiId ?? "";
  const hasValidUpiId = UPI_ID_PATTERN.test(upiId);
  const upiError = upiId.length === 0
    ? "Enter the collector's UPI ID to enable sharing."
    : !hasValidUpiId
      ? "Enter a valid UPI ID, for example raghav@okhdfcbank."
      : null;

  return (
    <div className="max-w-4xl w-full mx-auto flex flex-col gap-5">
      <div className="rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-slate-900/70 to-slate-950 px-5 py-6 text-center shadow-xl shadow-teal-500/5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-400">Total to split</p>
        <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-100">{data.currency}{result.grandTotal.toFixed(2)}</p>
        <p className="mt-2 text-xs text-slate-500">Items {data.currency}{result.itemsSubtotal.toFixed(2)} · Receipt total {data.currency}{data.receiptTotal.toFixed(2)}</p>
      </div>

      <div className="flex items-center gap-2 px-1">
        <UserCheck className="w-4 h-4 text-teal-400" />
        <h2 className="text-sm font-bold text-slate-200">Everyone&apos;s share</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {result.perPerson.map((person, index) => {
          const color = friendColor(index);
          return (
            <section key={person.friendId} className="rounded-2xl border border-slate-800 bg-slate-900/45 overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold border ${color.bg} ${color.border} ${color.text}`}>{person.friendName.slice(0, 1).toUpperCase()}</div>
                  <h3 className="font-bold text-slate-100 truncate">{person.friendName}</h3>
                </div>
                <span className="text-lg font-extrabold text-teal-400 shrink-0">{data.currency}{person.total.toFixed(2)}</span>
              </div>

              <div className="px-4 py-3 border-b border-slate-800/80">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Their items</p>
                <div className="flex flex-col gap-1.5">
                  {person.itemBreakdown.map((item) => (
                    <div key={item.itemId} className="flex justify-between gap-3 text-xs">
                      <span className="text-slate-400 truncate">{item.itemName}{item.sharers > 1 ? ` · shared ÷${item.sharers}` : ""}</span>
                      <span className="font-mono text-slate-300 shrink-0">{data.currency}{item.share.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="px-4 py-3 flex flex-col gap-1.5 text-xs">
                <ResultRow label="Items subtotal" currency={data.currency} value={person.subtotal} />
                <ResultRow label="Tax" currency={data.currency} value={person.taxShare} />
                <ResultRow label="Tip" currency={data.currency} value={person.tipShare} />
                <ResultRow label="Service charge" currency={data.currency} value={person.serviceChargeShare} />
                <ResultRow label="Discount" currency={data.currency} value={-person.discountShare} accent="text-emerald-400" />
              </div>
            </section>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4 md:p-5">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-slate-200">Who&apos;s collecting payment?</h2>
          <p className="mt-1 text-xs text-slate-500">Add the collector&apos;s UPI ID to create payment links and QR codes in the next step.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-400">
            Name <span className="font-normal text-slate-600">(optional)</span>
            <input
              value={payee.payeeName ?? ""}
              onChange={(event) => onPayeeChange({ ...payee, payeeName: event.target.value })}
              placeholder="e.g. Raghav"
              maxLength={40}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/20"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-semibold text-slate-400">
            UPI ID <span className="text-rose-400">(required)</span>
            <input
              value={upiId}
              onChange={(event) => onPayeeChange({ ...payee, payeeUpiId: event.target.value })}
              placeholder="raghav@okhdfcbank"
              inputMode="email"
              autoCapitalize="none"
              aria-invalid={Boolean(upiError)}
              className={`rounded-xl border bg-slate-950 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 ${upiError ? "border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/20" : "border-emerald-500/50 focus:border-teal-500/60 focus:ring-teal-500/20"}`}
            />
          </label>
        </div>
        {upiError ? (
          <p className="mt-2 text-xs text-rose-400">{upiError}</p>
        ) : (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" />UPI ID looks valid.</p>
        )}
      </div>

      <button onClick={onShare} disabled={!hasValidUpiId} className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3 text-sm font-bold bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none">
        <Share2 className="w-4 h-4" />
        Share split
      </button>
    </div>
  );
}

function ResultRow({ label, currency, value, accent = "text-slate-400" }: {
  label: string;
  currency: string;
  value: number;
  accent?: string;
}) {
  return <div className={`flex justify-between gap-3 ${accent}`}><span>{label}</span><span className="font-mono shrink-0">{value < 0 ? "−" : ""}{currency}{Math.abs(value).toFixed(2)}</span></div>;
}

// --- Step types & indicator --------------------------------------------------

type AppStep = "capture" | "review" | "friends" | "assign" | "results";

const STEPS: { id: AppStep; label: string }[] = [
  { id: "capture", label: "Snap"    },
  { id: "review",  label: "Review"  },
  { id: "friends", label: "Friends" },
  { id: "assign",  label: "Assign"  },
  { id: "results", label: "Results" },
];

function StepIndicator({ current }: { current: AppStep }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <React.Fragment key={s.id}>
              {i > 0 && (
                <div
                  className={`h-px w-6 rounded transition-colors duration-300 ${
                    done ? "bg-teal-500" : "bg-slate-800"
                  }`}
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                    active
                      ? "bg-teal-500 text-slate-950 shadow-[0_0_12px_rgba(20,184,166,0.4)]"
                      : done
                        ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                        : "bg-slate-900 text-slate-600 border border-slate-800"
                  }`}
                >
                  {done ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
                </div>
                <span
                  className={`text-[9px] font-bold transition-colors duration-300 ${
                    active ? "text-teal-400" : done ? "text-slate-500" : "text-slate-700"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-600 font-semibold">
        Step {currentIdx + 1} of {STEPS.length}
      </p>
    </div>
  );
}

// --- StepNav (Back / Next bar) -----------------------------------------------

function StepNav({
  step,
  canGoBack,
  canGoNext,
  onBack,
  onNext,
  nextLabel = "Next",
  backLabel = "Back",
  nextWarning,
}: {
  step: AppStep;
  canGoBack: boolean;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextWarning?: string;
}) {
  // Capture step has no nav bar
  if (step === "capture") return null;

  return (
    <div className="flex flex-col gap-2">
      {/* Disabled-next warning */}
      {!canGoNext && nextWarning && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/8 border border-amber-500/20 text-amber-400/80 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {nextWarning}
        </div>
      )}
      <div className="flex gap-3">
        {canGoBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
            {backLabel}
          </button>
        )}
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
        >
          {nextLabel}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// --- Page --------------------------------------------------------------------

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawText, setRawText] = useState<string | null>(null);
  const [editableData, setEditableData] = useState<EditableData | null>(null);
  // confirmedData is locked in when user clicks "Confirm & Continue" on Review.
  // The Assignment screen reads only from this, never from the live draft.
  const [confirmedData, setConfirmedData] = useState<EditableData | null>(null);
  const [activeTab, setActiveTab] = useState<"review" | "raw">("review");
  const [friends, setFriends] = useState<Friend[]>([{ id: newFriendId(), name: "You" }]);
  const [step, setStep] = useState<AppStep>("capture");
  // Assignments keyed by itemId → friendId[] (preserved across Back navigation)
  const [assignments, setAssignments] = useState<Assignments>({});
  const [payee, setPayee] = useState<Pick<Bill, "payeeName" | "payeeUpiId">>({});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processImage = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setRawText(null);
    setEditableData(null);
    setConfirmedData(null);

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(selectedFile);

    setIsLoading(true);
    try {
      const base64String = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.readAsDataURL(selectedFile);
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = (err) => reject(err);
      });

      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64String }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to parse receipt");

      handleParseSuccess(data.rawText, data.structuredData as ApiStructuredData);
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processImage(e.target.files[0]);
  };

  const resetAll = () => {
    setFile(null);
    setImagePreview(null);
    setRawText(null);
    setEditableData(null);
    setConfirmedData(null);
    setError(null);
    setFriends([{ id: newFriendId(), name: "You" }]);
    setAssignments({});
    setPayee({});
    setStep("capture");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  // Advance to review automatically once parsing succeeds
  const handleParseSuccess = (raw: string, sd: ApiStructuredData) => {
    setRawText(raw);
    setEditableData(toEditable(sd));
    setStep("review");
  };

  // When friends change, purge any assignments that reference removed friends
  const handleFriendsChange = (newFriends: Friend[]) => {
    const validIds = new Set(newFriends.map((f) => f.id));
    const cleaned: Assignments = {};
    for (const [itemId, friendIds] of Object.entries(assignments)) {
      cleaned[itemId] = friendIds.filter((id) => validIds.has(id));
    }
    setFriends(newFriends);
    setAssignments(cleaned);
  };

  // Navigation handlers
  const handleConfirmReview = () => {
    if (!editableData) return;
    setConfirmedData(editableData);
    setStep("friends");
  };

  const handleGoBack = () => {
    if (step === "review") setStep("capture");
    else if (step === "friends") setStep("review");
    else if (step === "assign") setStep("friends");
    else if (step === "results") setStep("assign");
  };

  const handleGoNext = () => {
    if (step === "friends") setStep("assign");
    else if (step === "assign") setStep("results");
  };

  // Gate conditions
  const canAdvanceFromFriends = friends.length >= 2;
  const allItemsAssigned = confirmedData
    ? confirmedData.items.every((it) => (assignments[it.id]?.length ?? 0) > 0)
    : false;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="bg-gradient-to-tr from-teal-500 to-emerald-400 p-2 rounded-xl text-slate-950 shadow-lg shadow-teal-500/10">
              <Receipt className="w-5 h-5 stroke-[2.5]" />
            </div>
            <div>
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                SplitSnap
              </span>
              <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/10 text-teal-400 border border-teal-500/20">
                Phase 2
              </span>
            </div>
          </div>

          {/* Step indicator — shown once we're past capture */}
          {step !== "capture" && (
            <StepIndicator current={step} />
          )}

          {(file || rawText || error) && (
            <button
              onClick={resetAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">

        {/* ── Step 1: Capture ── */}
        {step === "capture" && (
          <>
            {!file && (
              <div className="text-center py-12 md:py-16 max-w-lg mx-auto flex flex-col items-center">
                <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent mb-3">
                  Split bills instantly.
                </h1>
                <p className="text-slate-400 text-sm md:text-base leading-relaxed mb-8">
                  Take a receipt photo, assign who had what, and get instant payment links.
                  No accounts, no setup, just snap and split.
                </p>
              </div>
            )}

            {!file && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg w-full mx-auto">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <input
                  type="file"
                  ref={cameraInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                />
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-8 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-teal-500/40 hover:shadow-[0_0_20px_rgba(20,184,166,0.05)] transition-all group active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center mb-4 group-hover:bg-teal-500/25 group-hover:text-teal-300 transition-colors">
                    <Camera className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-sm text-slate-200">Snap Photo</span>
                  <span className="text-slate-500 text-xs mt-1">Use mobile camera</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-8 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-slate-700 hover:shadow-[0_0_20px_rgba(255,255,255,0.02)] transition-all group active:scale-[0.98]"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mb-4 group-hover:bg-slate-700 group-hover:text-slate-300 transition-colors">
                    <Upload className="w-6 h-6" />
                  </div>
                  <span className="font-bold text-sm text-slate-200">Upload Image</span>
                  <span className="text-slate-500 text-xs mt-1">Select from library</span>
                </button>
              </div>
            )}

            {isLoading && (
              <div className="flex flex-col items-center justify-center py-16 px-4 bg-slate-900/40 border border-slate-900 rounded-2xl">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-teal-500/20 blur-xl rounded-full animate-pulse" />
                  <div className="relative bg-slate-950 p-4 rounded-full border border-teal-500/20">
                    <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                  </div>
                </div>
                <h3 className="font-bold text-lg text-slate-200 mb-1">Scanning Receipt...</h3>
                <p className="text-slate-400 text-sm max-w-xs text-center">
                  Google Vision is reading raw text and Gemini is structuring items.
                </p>
              </div>
            )}

            {error && !isLoading && (
              <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex gap-3 text-rose-400 max-w-lg mx-auto">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-rose-300">Processing Failed</h4>
                  <p className="text-xs text-rose-400/80 mt-1 leading-relaxed">{error}</p>
                  <button
                    onClick={resetAll}
                    className="text-xs font-semibold text-rose-300 underline mt-2 block hover:text-rose-200"
                  >
                    Try another receipt
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Step 2: Review ── */}
        {step === "review" && editableData && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
              {/* Left: image */}
              <div className="md:col-span-5 flex flex-col gap-3">
                <div className="rounded-xl border border-slate-900 bg-slate-950 p-2 overflow-hidden shadow-2xl">
                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-slate-900 flex items-center justify-center">
                    {imagePreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagePreview}
                        alt="Receipt preview"
                        className="object-contain w-full h-full"
                      />
                    ) : (
                      <Receipt className="w-12 h-12 text-slate-700" />
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center px-1">
                  <span className="text-xs text-slate-500 truncate max-w-[200px]">
                    {file?.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {file ? (file.size / 1024 / 1024).toFixed(2) : "0.00"} MB
                  </span>
                </div>
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800/50 text-xs text-slate-400 leading-relaxed">
                  <PencilLine className="w-3.5 h-3.5 mt-0.5 text-teal-500 shrink-0" />
                  <span>
                    All fields are editable. Fix anything the AI got wrong before assigning items to people.
                  </span>
                </div>
              </div>

              {/* Right: tabs + editor */}
              <div className="md:col-span-7 flex flex-col bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden shadow-2xl">
                <div className="flex border-b border-slate-900 bg-slate-950 p-1">
                  <button
                    onClick={() => setActiveTab("review")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      activeTab === "review"
                        ? "bg-slate-900 text-teal-400 border border-slate-800"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Review and Edit
                  </button>
                  <button
                    onClick={() => setActiveTab("raw")}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      activeTab === "raw"
                        ? "bg-slate-900 text-teal-400 border border-slate-800"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Raw OCR Text
                  </button>
                </div>

                <div className="p-4 md:p-5 min-h-[300px]">
                  {activeTab === "review" && (
                    <ReviewEditor data={editableData} onChange={setEditableData} />
                  )}
                  {activeTab === "raw" && (
                    <div className="bg-slate-950 p-4 rounded-lg border border-slate-900 max-h-96 overflow-y-auto">
                      {rawText ? (
                        <pre className="text-xs font-mono text-slate-400 whitespace-pre-wrap leading-relaxed">
                          {rawText}
                        </pre>
                      ) : (
                        <div className="text-center py-12 text-slate-500 text-sm">
                          Raw OCR text is not available
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Review navigation */}
            <StepNav
              step={step}
              canGoBack={true}
              canGoNext={editableData.items.length > 0}
              onBack={handleGoBack}
              onNext={handleConfirmReview}
              backLabel="← Snap"
              nextLabel="Confirm & Continue"
              nextWarning={
                editableData.items.length === 0
                  ? "Add at least one item before continuing."
                  : undefined
              }
            />
          </>
        )}

        {/* ── Step 3: Friends ── */}
        {step === "friends" && (
          <>
            <div className="max-w-lg w-full mx-auto flex flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <Users className="w-4 h-4 text-teal-400" />
                <h2 className="text-sm font-bold text-slate-200">Who&apos;s splitting?</h2>
                <span className="ml-auto text-xs text-slate-500">
                  {friends.length} {friends.length === 1 ? "person" : "people"}
                </span>
              </div>
              <div className="rounded-xl bg-slate-900/40 border border-slate-900 p-4">
                <FriendList friends={friends} onChange={handleFriendsChange} />
              </div>
            </div>

            {/* Friends navigation */}
            <div className="max-w-lg w-full mx-auto">
              <StepNav
                step={step}
                canGoBack={true}
                canGoNext={canAdvanceFromFriends}
                onBack={handleGoBack}
                onNext={handleGoNext}
                nextLabel="Assign Items"
                nextWarning={
                  !canAdvanceFromFriends
                    ? "Add at least one more person to split with."
                    : undefined
                }
              />
            </div>
          </>
        )}

        {/* ── Step 4: Assign ── */}
        {step === "assign" && confirmedData && (
          <>
            {/* Confirmed bill summary strip */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-800/50 text-xs text-slate-400 max-w-4xl w-full">
              <UserCheck className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span>
                Splitting{" "}
                <span className="text-slate-200 font-semibold">
                  {confirmedData.currency}
                  {computeTotal(confirmedData, computeSubtotal(confirmedData.items)).toFixed(2)}
                </span>{" "}
                between{" "}
                <span className="text-teal-400 font-semibold">
                  {friends.map((f) => f.name).join(", ")}
                </span>
              </span>
            </div>

            <div className="max-w-4xl w-full">
              <AssignmentScreen
                data={confirmedData}
                friends={friends}
                assignments={assignments}
                onAssignmentsChange={setAssignments}
              />
            </div>

            {/* Assign navigation */}
            <div className="max-w-4xl w-full">
              <StepNav
                step={step}
                canGoBack={true}
                canGoNext={allItemsAssigned}
                onBack={handleGoBack}
                onNext={handleGoNext}
                nextLabel="Confirm Split"
                nextWarning={
                  !allItemsAssigned
                    ? `${confirmedData.items.filter((it) => !(assignments[it.id]?.length > 0)).length} item(s) still unassigned — assign every item before confirming.`
                    : undefined
                }
              />
            </div>
          </>
        )}

        {/* ── Step 5: Results ── */}
        {step === "results" && confirmedData && allItemsAssigned && (
          <>
            <ResultsScreen
              data={confirmedData}
              result={calculateSplit(
                confirmedData.items,
                friends,
                confirmedData.tax,
                confirmedData.tip,
                confirmedData.serviceCharge,
                confirmedData.discount,
                assignments
              )}
              payee={payee}
              onPayeeChange={setPayee}
              onShare={() => alert("Share links are coming in the next step of the build.")}
            />
            <div className="max-w-4xl w-full mx-auto">
              <button
                onClick={handleGoBack}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 transition-all active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to assignments
              </button>
            </div>
          </>
        )}

      </main>

      <footer className="mt-auto border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        <p>SplitSnap {new Date().getFullYear()} - Built using Google Vision and Gemini</p>
      </footer>
    </div>
  );
}
