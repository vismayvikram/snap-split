"use client";

import React, { useState, useRef, useCallback } from "react";
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

  const updateItem = useCallback(
    (id: string, field: "name" | "qty" | "price", raw: string) => {
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
    },
    [data, onChange]
  );

  const deleteItem = useCallback(
    (id: string) => {
      onChange({ ...data, items: data.items.filter((it) => it.id !== id) });
    },
    [data, onChange]
  );

  const addItem = useCallback(() => {
    onChange({
      ...data,
      items: [
        ...data.items,
        { id: newItemId(), name: "", qty: 1, price: 0, unitPrice: 0 },
      ],
    });
  }, [data, onChange]);

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

      {friends.length <= 1 && (
        <p className="text-[11px] text-slate-600">
          Add at least one more person to split with (you already count).
        </p>
      )}
    </div>
  );
}

// --- Step types & indicator --------------------------------------------------

type AppStep = "capture" | "review" | "friends";

const STEPS: { id: AppStep; label: string }[] = [
  { id: "capture", label: "Snap" },
  { id: "review",  label: "Review" },
  { id: "friends", label: "Friends" },
  // Step 4 (Assign) comes in Phase 2 Step 3
];

function StepIndicator({ current }: { current: AppStep }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <React.Fragment key={s.id}>
            {i > 0 && (
              <div
                className={`h-px w-5 rounded ${
                  done ? "bg-teal-500" : "bg-slate-800"
                }`}
              />
            )}
            <div className="flex items-center gap-1">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  active
                    ? "bg-teal-500 text-slate-950"
                    : done
                    ? "bg-teal-500/20 text-teal-400 border border-teal-500/30"
                    : "bg-slate-900 text-slate-600 border border-slate-800"
                }`}
              >
                {done ? <CheckCircle2 className="w-3 h-3" /> : i + 1}
              </div>
              <span
                className={`text-[10px] font-bold hidden sm:inline ${
                  active ? "text-teal-400" : done ? "text-slate-500" : "text-slate-700"
                }`}
              >
                {s.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
      <span className="ml-1 text-[10px] text-slate-600 hidden sm:inline">
        +&nbsp;Assign
      </span>
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
  const [activeTab, setActiveTab] = useState<"review" | "raw">("review");
  const [friends, setFriends] = useState<Friend[]>([{ id: newFriendId(), name: "You" }]);
  const [step, setStep] = useState<AppStep>("capture");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processImage = async (selectedFile: File) => {
    setFile(selectedFile);
    setError(null);
    setRawText(null);
    setEditableData(null);

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
    setError(null);
    setFriends([{ id: newFriendId(), name: "You" }]);
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

        {file && !isLoading && !error && (
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
                  {file.name}
                </span>
                <span className="text-xs text-slate-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              {editableData && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-slate-900/60 border border-slate-800/50 text-xs text-slate-400 leading-relaxed">
                  <PencilLine className="w-3.5 h-3.5 mt-0.5 text-teal-500 shrink-0" />
                  <span>
                    All fields are editable. Fix anything the AI got wrong before assigning items to people.
                  </span>
                </div>
              )}
            </div>

            {/* Right: tabs */}
            <div className="md:col-span-7 flex flex-col bg-slate-900/40 border border-slate-900 rounded-xl overflow-hidden shadow-2xl">
              <div className="flex border-b border-slate-900 bg-slate-950 p-1">
                <button
                  onClick={() => setActiveTab("review")}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "review"
                      ? "bg-slate-900 text-teal-400 border border-slate-800"
                      : "text-slate-400 hover:text-slate-200"
                    }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Review and Edit
                </button>
                <button
                  onClick={() => setActiveTab("raw")}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "raw"
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
                  <>
                    {editableData ? (
                      <ReviewEditor data={editableData} onChange={setEditableData} />
                    ) : (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin mb-2" />
                        <span className="text-sm">Structured data not ready</span>
                      </div>
                    )}
                  </>
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
        )}

        {/* Friend list — shown once a receipt is successfully parsed */}
        {editableData && !isLoading && !error && (
          <div className="flex flex-col gap-3 max-w-4xl w-full">
            <div className="flex items-center gap-2 px-1">
              <Users className="w-4 h-4 text-teal-400" />
              <h2 className="text-sm font-bold text-slate-200">Who&apos;s splitting?</h2>
              <span className="ml-auto text-xs text-slate-500">
                {friends.length} {friends.length === 1 ? "person" : "people"}
              </span>
            </div>
            <div className="rounded-xl bg-slate-900/40 border border-slate-900 p-4">
              <FriendList friends={friends} onChange={setFriends} />
            </div>
          </div>
        )}

      </main>

      <footer className="mt-auto border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        <p>SplitSnap {new Date().getFullYear()} - Built using Google Vision and Gemini</p>
      </footer>
    </div>
  );
}