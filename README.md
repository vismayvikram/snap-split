# SnapSplit

Photograph a receipt, tap who had what, get a shareable breakdown with payment links — no signup, no ledger, done in under a minute.

## Problem it solves

Splitwise is for tracking group finances *over time* — recurring rent, ongoing trips, running balances across a friend group. SnapSplit is for the other 90% of splitting: you're at the table *right now*, the bill just arrived, and nobody wants to create an account to pay you back for their share of the food.

This isn't a lesser Splitwise. It's a single-use utility. You don't build a multi-bill history or persistent balances — every flow is ephemeral and gets the job done instantly.

## Features

- **Photo upload / camera capture:** Snap a photo of your receipt directly on your mobile device.
- **OCR extraction & AI parsing:** Google Vision API and LLMs extract raw text and convert it to structured items, quantities, and prices.
- **Editable review screen:** Correct any misread item/price before proceeding.
- **Friend list (session-only):** Add names, no accounts, no authentication.
- **Item assignment:** Tap an item to assign to one or more friends. Shared items split evenly.
- **Proportional tax/tip split:** Each person's tax/tip share is calculated based on their subtotal relative to the bill's subtotal.
- **Results screen:** Get a per-person itemized total.
- **Shareable link & UPI payment:** Send a link to friends, and they'll see what they owe along with a UPI deep link (`upi://pay`) for 1-tap payment.

## Explicitly Out of Scope

- User accounts / login
- Persistent ledger across multiple bills
- Running balance / debt-netting across a friend group over time
- Recurring expenses

## Getting Started

First, run the server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
