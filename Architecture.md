# SnapSplit Architecture

SnapSplit is designed to be a lightweight, lightning-fast utility for splitting bills directly from receipts using OCR and AI parsing, without any heavy user account management.

## Technical Pipeline

1. **Photo Capture:** User takes a photo of a receipt via the browser's camera API or file picker.
2. **OCR Extraction (Google Vision API):** The image is sent to an API route which uses Google Vision API to extract raw text from the receipt.
3. **AI Parsing (LLM):** The raw text is passed to an LLM (such as Gemini/Claude) which structures the messy text into clean JSON (items, quantity, price, tax, tip, total).
4. **Client-Side Review & Assignment:** The parsed JSON is presented to the user in an editable UI to correct any OCR mistakes. Users assign items to friends (managed entirely in local state/session).
5. **Calculation Engine:** A pure calculation function processes subtotals, proportional tax, and tips per person.
6. **Persistence (Supabase/DB):** Once finalized, the split data is saved to a database with a unique `shareId`.
7. **Sharing & Payment:** The frontend generates a shareable URL and individual UPI payment links (`upi://pay`) based on the saved data.

## Tech Stack
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS
- **AI/OCR:** Google Vision API, Generative AI (LLMs)
- **Database:** Supabase (for storing finalized splits and shareable links)
- **Deployment:** Vercel (recommended)

## Key Components
- `src/app/page.tsx`: The main single-page application handling camera capture, OCR request, editing, and assignment logic.
- `src/app/splitCalculator.ts`: Pure, isolated calculation engine for determining per-person totals including proportional tax and tips.
- `src/app/api/ocr/route.ts`: API endpoint for Google Vision API integration.
- `src/app/api/bills/route.ts`: API endpoint for saving the final split data.
- `src/app/api/bills/[shareId]/route.ts`: API endpoint for retrieving a shared bill.
- `src/app/share/[shareId]/page.tsx`: The read-only shared view for recipients, displaying their individual totals and payment QR/deep links.
