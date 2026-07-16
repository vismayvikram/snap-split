# SplitSnap — Product Plan

*Bill Splitter from a Receipt Photo — OpenCode AI Build Sprint*

---

## 1. Positioning

**One-liner:** Photograph a receipt, tap who had what, get a shareable breakdown with payment links — no signup, no ledger, done in under a minute.

**The explicit contrast (state this in your README):**

> Splitwise is for tracking group finances *over time* — recurring rent, ongoing trips, running balances across a friend group. SplitSnap is for the other 90% of splitting: you're at the table *right now*, the bill just arrived, and nobody wants to create an account to pay you back for their share of the naan.

This isn't a lesser Splitwise. It's a single-use utility, and that's the point. Don't build toward multi-bill history or persistent balances — every hour spent there is an hour not spent making the OCR → parse → assign flow actually reliable, which is the part your live demo lives or dies on.

---

## 2. Target user & core scenario

**Primary scenario:** A group of 3-6 friends finishes a meal. One person has the physical receipt. They open SplitSnap on their phone, photograph it, assign items to names, and send a link. Everyone else opens the link on their own phone and sees exactly what they owe, with a one-tap UPI payment option.

**Secondary scenario:** Same flow but for a trip expense, a shared grocery run, or splitting a shared Amazon/utility bill — anything with an itemized receipt or invoice.

---

## 3. Feature set

### MVP — must ship (this is the whole grading surface, treat it as non-negotiable)

| # | Feature | Notes |
|---|---|---|
| 1 | Photo upload / camera capture | Mobile camera input + file picker fallback |
| 2 | OCR extraction | Google Vision API → raw text |
| 3 | AI-structured parsing | LLM call converts raw OCR text → JSON (items, qty, price, tax, tip, total) |
| 4 | Editable review screen | User corrects any misread item/price before proceeding — **this is your reliability safety net, do not cut it** |
| 5 | Friend list (session-only) | Just names, no accounts, no auth |
| 6 | Item assignment | Tap item → assign to one or more friends |
| 7 | Shared items | An item assigned to multiple people splits evenly among just those people |
| 8 | Proportional tax/tip split | Each person's tax/tip share = (their subtotal ÷ bill subtotal) × tax/tip |
| 9 | Results screen | Per-person itemized total |
| 10 | Shareable link | Persisted via DB, opens read view for anyone with the link |
| 11 | UPI payment link/QR per person | `upi://pay?pa=...&am=...` deep link, generated client-side, no gateway needed |

### Stretch — only after MVP is fully working and demo-tested (Day 5 buffer only)

- Manual "add missed item" button on the review screen
- Mark-as-paid toggle (visual only, no real payment tracking)
- Multiple currency symbol support
- Light animation polish (item "flying" to assigned friend, etc.)
- Receipt image stored alongside the share link for reference

### Explicitly out of scope — say this out loud in your README

- User accounts / login
- Persistent ledger across multiple bills
- Running balance / debt-netting across a friend group over time
- Recurring expenses
- Multi-currency conversion (symbol support ≠ conversion)

Cutting these isn't a gap — it's the product thesis. Naming them explicitly in your README preempts the "why isn't this Splitwise" question before an evaluator asks it.

---

## 4. User flow (what the person experiences)

1. **Land on homepage** → single clear CTA: "Split a bill"
2. **Capture** → camera opens on mobile (or file picker on desktop) → photo taken/selected
3. **Processing state** → OCR + AI parsing runs, shown as a short loading sequence (this takes a few seconds — don't let it feel broken)
4. **Review screen** → parsed items shown as an editable list: name, qty, price per line, plus subtotal/tax/tip/total fields — all editable, since OCR *will* get some things wrong
5. **Add friends** → type names as chips, no accounts, stored in session only
6. **Assign screen** → tap each item, select which friend(s) it belongs to; shared items split evenly among the selected people
7. **Confirm** → calculation runs: per-person subtotal + proportional tax/tip share = their total
8. **Results screen** → itemized breakdown per person, big clear total, "Share" button
9. **Share** → generates a link + per-person UPI QR/deep link
10. **Recipient flow** → anyone opening the link sees the full breakdown and their own personal total, with their own UPI pay button

---

## 5. Technical pipeline (the diagram above, in words)

```
Photo → Google Vision API (raw text) → LLM parsing call (structured JSON)
  → client-side editable state → assignment logic → calculation engine
  → persisted to DB with a share ID → shareable URL
```

The two AI touchpoints are distinct and worth naming separately in your "how AI was used" write-up:
- **Vision API** does raw text extraction (classic OCR, not generative)
- **An LLM call** (Claude/GPT) turns that messy raw text into clean structured JSON — this is the part that makes the product actually work across different receipt formats without you hand-writing regex for every layout

---

## 6. Screens

| Screen | Purpose | Key components |
|---|---|---|
| Home | Entry point | CTA, brief explainer, maybe a sample receipt demo |
| Capture | Get the photo | Camera input, file picker, loading state |
| Review | Correct OCR errors | Editable item table, add/remove item, subtotal/tax/tip fields |
| Friends | Build the group | Name chip input, add/remove |
| Assign | Map items to people | Item list, tap-to-assign UI, visual indicator of shared items |
| Results | Show the math | Per-person cards, itemized breakdown, grand totals |
| Share | Close the loop | Copy link, per-person UPI QR, "open your link" for recipients |

---

## 7. Data model (rough sketch)

```
Bill {
  id: string (share ID, e.g. short nanoid)
  imageUrl?: string
  items: Item[]
  subtotal: number
  tax: number
  tip: number
  total: number
  friends: Friend[]
  createdAt: timestamp
}

Item {
  id: string
  name: string
  price: number
  qty: number
  assignedTo: string[]   // friend IDs, empty = unassigned, multiple = shared
}

Friend {
  id: string
  name: string
  upiId?: string          // optional, for QR generation
}
```

Everything for a given bill lives in one row/document — no relational sprawl needed for an MVP this scoped.

---

## 8. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js + React, Tailwind | Fast to scaffold with AI tools, good mobile-camera support, deploys trivially |
| OCR | Google Vision API | Handles thermal-print receipts far better than Tesseract.js out of the box |
| Structuring | LLM API call (Claude or GPT) with a JSON-only system prompt | Robust across inconsistent receipt formats; brittle regex won't generalize |
| Persistence | Supabase (Postgres) or Vercel KV | Just need a `bills` table/store keyed by share ID — no auth needed |
| Deploy | Vercel | Zero-config Next.js hosting, satisfies the "working deployed project" requirement immediately |
| Payments | UPI deep links (`upi://pay?...`) + QR generation (e.g. `qrcode` npm package) | No payment gateway integration needed — this alone gives a strong "wow, it actually closes the loop" demo moment |

---



## 10. Risks & mitigations

| Risk | Mitigation |
|---|---|
| OCR misreads thermal/faded receipts | Editable review step is in the MVP for exactly this reason — don't cut it |
| LLM parsing hallucinates or drops items | Review step catches this too; consider flagging low-confidence items visually if time allows |
| Live demo receipt fails on stage | Have a backup receipt photo you've already tested successfully, ready to use if the live one flakes |
| Share-link persistence is slow/flaky | Test the DB write/read path early (Day 1-2), don't leave it for Day 4 |
| Camera permissions/mobile quirks | Test on an actual phone browser by Day 3, not just localhost desktop |

---

## 11. AI tool usage — keep a running log from Day 1

Two distinct categories to document separately (both count toward the deliverable):

1. **Development tooling** — which AI IDE/assistant (Cursor, Copilot, etc.) you used, for what (scaffolding, debugging, refactors), and any specific moments where it meaningfully sped you up or where you had to correct it
2. **Product-level AI use** — the LLM parsing call is itself a core feature, not just a dev convenience. Worth a short technical note on your prompt design and how you handled edge cases (e.g. what happens when the LLM returns malformed JSON)

Don't reconstruct this on Day 5 — jot a line or two each day while it's fresh.

---

## 12. Demo video outline (2-3 min)

1. **(15s)** One-line problem statement: splitting a real restaurant bill is annoying, existing tools want you to sign up
2. **(90s)** Live flow: photograph a real receipt → watch parsing happen → correct one item on the review screen (shows you're not hiding the OCR imperfection) → assign items → show the calculated split
3. **(30s)** Share the link, open it "as a friend" on a second device/tab, show the UPI QR
4. **(15s)** Quick mention of stack + one sentence on how AI tools were used in building it

---

## 13. Definition of done for the sprint

Before you call this finished, all of these should be true:
- A stranger can open your deployed link, photograph a receipt they've never shown you, and get a correct split without you explaining anything
- The review step has actually been tested against a genuinely bad/blurry receipt, not just a clean one
- The share link works from a second device, not just the same browser tab
- README explicitly states what this is *not* trying to be (see Section 3)

## 14. core objectives of the sprint (take this only as a refference to take decisions which will favour in the better impression of the judges)

OpenCode AI Build Sprint Duration: 4–5 Days Objective Explore the modern AI-powered development workflow by building a functional project using AI tools. The focus is on learning how to effectively use AI IDEs, iterate quickly, and ship a complete product. Task Build a project of your choice using at least one AI development tool such as Antigravity, Windsurf, Firebase Studio, Cursor, GitHub Copilot, or any equivalent platform. A web application is recommended, but projects in AI/ML, Cybersecurity, Systems, Automation, or any other domain are equally welcome. Expected Deliverables Public GitHub repository. Working deployed project (mandatory). README with project overview, setup instructions, and tech stack. Short demo video (2–3 minutes)  Brief note describing how AI tools were used during development. Evaluation Functionality Code quality Effective use of AI tools UI/UX (if applicable) Documentation and presentation Notes Prioritize a complete, polished project over an overly ambitious one. Feel free to experiment with new technologies and AI workflows.