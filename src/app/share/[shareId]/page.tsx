"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Receipt,
  Loader2,
  AlertCircle,
  UserCheck,
  ExternalLink,
  Copy,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { calculateSplit, type SplitResult } from "../../splitCalculator";
import QRCode from "qrcode";

interface Friend {
  id: string;
  name: string;
}

interface Item {
  id: string;
  name: string;
  qty: number;
  price: number;
  unitPrice: number;
}

interface StoredBill {
  currency: string;
  items: Item[];
  discount: number;
  serviceCharge: number;
  tax: number;
  tip: number;
  receiptTotal: number;
  friends: Friend[];
  assignments: Record<string, string[]>;
  payeeUpiId?: string;
  payeeName?: string;
}

const FRIEND_COLORS = [
  { bg: "bg-teal-500/20", border: "border-teal-500/40", text: "text-teal-300", dot: "bg-teal-400" },
  { bg: "bg-violet-500/20", border: "border-violet-500/40", text: "text-violet-300", dot: "bg-violet-400" },
  { bg: "bg-amber-500/20", border: "border-amber-500/40", text: "text-amber-300", dot: "bg-amber-400" },
  { bg: "bg-rose-500/20", border: "border-rose-500/40", text: "text-rose-300", dot: "bg-rose-400" },
  { bg: "bg-sky-500/20", border: "border-sky-500/40", text: "text-sky-300", dot: "bg-sky-400" },
  { bg: "bg-emerald-500/20", border: "border-emerald-500/40", text: "text-emerald-300", dot: "bg-emerald-400" },
  { bg: "bg-pink-500/20", border: "border-pink-500/40", text: "text-pink-300", dot: "bg-pink-400" },
  { bg: "bg-orange-500/20", border: "border-orange-500/40", text: "text-orange-300", dot: "bg-orange-400" },
];

function friendColor(idx: number) {
  return FRIEND_COLORS[idx % FRIEND_COLORS.length];
}

export default function SharePage() {
  const params = useParams();
  const shareId = params.shareId as string;
  const [bill, setBill] = useState<StoredBill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/bills/${shareId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Bill not found or has been removed.");
        return res.json();
      })
      .then((data) => {
        setBill(data.bill as StoredBill);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [shareId]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const result = useMemo(() => {
    if (!bill) return null;
    return calculateSplit(
      bill.items,
      bill.friends,
      bill.tax,
      bill.tip,
      bill.serviceCharge,
      bill.discount,
      bill.assignments
    );
  }, [bill]);

  const selectedPerson = result?.perPerson.find(p => p.friendId === selectedFriendId);

  useEffect(() => {
    if (!selectedPerson || !bill?.payeeUpiId) {
      setQrCodeUrl(null);
      return;
    }
    const upiHref = `upi://pay?pa=${bill.payeeUpiId}&am=${selectedPerson.total.toFixed(2)}&tn=SnapSplit:+${encodeURIComponent(bill.payeeName || "Payment")}&cu=INR`;
    QRCode.toDataURL(upiHref, { 
      width: 200, 
      margin: 2, 
      color: { dark: '#0f172a', light: '#ffffff' } 
    })
      .then(setQrCodeUrl)
      .catch(console.error);
  }, [selectedPerson, bill?.payeeUpiId, bill?.payeeName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
        <p className="text-sm text-slate-400">Loading bill...</p>
      </div>
    );
  }

  if (error || !bill || !result) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-14 h-14 rounded-full bg-rose-500/10 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-rose-400" />
        </div>
        <h1 className="text-xl font-bold text-slate-200">Bill not found</h1>
        <p className="text-sm text-slate-500 text-center max-w-xs">
          {error || "This bill doesn&apos;t exist or may have been removed."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-gradient-to-tr from-teal-500 to-emerald-400 p-2 rounded-xl text-slate-950 shadow-lg shadow-teal-500/10">
              <Receipt className="w-5 h-5 stroke-[2.5]" />
            </div>
            <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              SnapSplit
            </span>
          </div>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all active:scale-95"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6">
        <div className="rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-slate-900/70 to-slate-950 px-5 py-6 text-center shadow-xl shadow-teal-500/5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-400">Total to split</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight text-slate-100">
            {bill.currency}{result.grandTotal.toFixed(2)}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Items {bill.currency}{result.itemsSubtotal.toFixed(2)}
          </p>
        </div>

        {!selectedPerson ? (
          <>
            <div className="flex items-center gap-2 px-1">
              <UserCheck className="w-4 h-4 text-teal-400" />
              <h2 className="text-sm font-bold text-slate-200">Who are you?</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {result.perPerson.map((person, index) => {
                const color = friendColor(index);
                return (
                  <button
                    key={person.friendId}
                    onClick={() => setSelectedFriendId(person.friendId)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-800 bg-slate-900/45 hover:bg-slate-800/80 hover:border-slate-700 transition-all active:scale-95`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold border ${color.bg} ${color.border} ${color.text}`}>
                      {person.friendName.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="font-bold text-slate-200 text-sm truncate w-full text-center">{person.friendName}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-1">
              <h2 className="text-sm font-bold text-slate-200">Your Share</h2>
              <button 
                onClick={() => setSelectedFriendId(null)}
                className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Not you?
              </button>
            </div>
            
            {(() => {
              const person = selectedPerson;
              const index = result.perPerson.findIndex(p => p.friendId === person.friendId);
              const color = friendColor(index);
              const upiHref = bill.payeeUpiId
                ? `upi://pay?pa=${bill.payeeUpiId}&am=${person.total.toFixed(2)}&tn=SnapSplit:+${encodeURIComponent(bill.payeeName || "Payment")}&cu=INR`
                : null;

              return (
                <section className="rounded-2xl border border-slate-800 bg-slate-900/45 overflow-hidden max-w-md mx-auto w-full shadow-2xl shadow-teal-500/5">
                  <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/40">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold border ${color.bg} ${color.border} ${color.text}`}>
                        {person.friendName.slice(0, 1).toUpperCase()}
                      </div>
                      <h3 className="font-bold text-slate-100 truncate">{person.friendName}</h3>
                    </div>
                    <span className="text-lg font-extrabold text-teal-400 shrink-0">
                      {bill.currency}{person.total.toFixed(2)}
                    </span>
                  </div>

                  <div className="px-4 py-3 border-b border-slate-800/80">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">Your items</p>
                    <div className="flex flex-col gap-1.5">
                      {person.itemBreakdown.map((item) => (
                        <div key={item.itemId} className="flex justify-between gap-3 text-xs">
                          <span className="text-slate-400 truncate">
                            {item.itemName}{item.sharers > 1 ? ` · shared ÷${item.sharers}` : ""}
                          </span>
                          <span className="font-mono text-slate-300 shrink-0">
                            {bill.currency}{item.share.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="px-4 py-3 flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between gap-3 text-slate-400">
                      <span>Items subtotal</span>
                      <span className="font-mono shrink-0">{bill.currency}{person.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-slate-400">
                      <span>Tax</span>
                      <span className="font-mono shrink-0">{bill.currency}{person.taxShare.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-slate-400">
                      <span>Tip</span>
                      <span className="font-mono shrink-0">{bill.currency}{person.tipShare.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-slate-400">
                      <span>Service charge</span>
                      <span className="font-mono shrink-0">{bill.currency}{person.serviceChargeShare.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between gap-3 text-emerald-400">
                      <span>Discount</span>
                      <span className="font-mono shrink-0">−{bill.currency}{person.discountShare.toFixed(2)}</span>
                    </div>
                  </div>

                  {upiHref && (
                    <div className="px-4 pb-4 pt-2 flex flex-col items-center gap-4">
                      {qrCodeUrl && (
                        <div className="p-2 bg-white rounded-xl shadow-lg">
                          <img src={qrCodeUrl} alt="UPI QR Code" className="w-32 h-32" />
                        </div>
                      )}
                      <a
                        href={upiHref}
                        target="_blank"
                        className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-2.5 text-sm font-bold bg-gradient-to-r from-teal-500 to-emerald-500 text-slate-950 shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 transition-all active:scale-[0.98]"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Pay {bill.currency}{person.total.toFixed(2)} via UPI
                        <ChevronRight className="w-4 h-4" />
                      </a>
                    </div>
                  )}
                </section>
              );
            })()}
          </>
        )}

        {bill.payeeName && (
          <p className="text-center text-xs text-slate-500">
            Payments go to <span className="font-semibold text-slate-400">{bill.payeeName}</span>
            {bill.payeeUpiId ? <> ({bill.payeeUpiId})</> : null}
          </p>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-900 py-4 text-center text-xs text-slate-600">
        <p>SnapSplit — Shared bill</p>
      </footer>
    </div>
  );
}
