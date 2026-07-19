// src/app/api/ocr/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleAuth } from "google-auth-library";
import { GoogleGenAI, Type, type Schema } from "@google/genai";

// Initialize Gemini client using GEMINI_API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define the expected receipt JSON schema for Gemini's structured output
const receiptSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    currency: {
      type: Type.STRING,
      description: "Currency symbol or code exactly as shown on the receipt (e.g. '$', '₹', 'Rs', 'PKR'). Never default to '$' — infer from the receipt's actual region/symbol/text."
    },
    items: {
      type: Type.ARRAY,
      description: "List of purchasable line items only. Do NOT include service charges, mandates, surcharges, or fees here — those go in serviceCharge.",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Item description" },
          qty: { type: Type.NUMBER, description: "Quantity of the item" },
          price: { type: Type.NUMBER, description: "Total price for the line (qty × unit price)" }
        },
        required: ["name", "qty", "price"]
      }
    },
    itemsSubtotal: {
      type: Type.NUMBER,
      description: "MUST equal the exact sum of all items[].price, computed by you. This is NEVER a number copied from the receipt's printed 'Subtotal' line — compute it yourself from the items array. If the printed subtotal on the receipt differs from this sum, the difference belongs in serviceCharge, not here."
    },
    discount: {
      type: Type.NUMBER,
      description: "Total of any discount, coupon, or 'off' line, expressed as a positive number representing the amount removed. 0 if none."
    },
    serviceCharge: {
      type: Type.NUMBER,
      description: "Any MANDATORY charge that is not government tax and not a voluntary tip — e.g. auto-gratuity, 'service charge (20%)', 'SF mandate', 'healthy SF surcharge', compulsory party fees. This absorbs any gap between itemsSubtotal and the receipt's printed subtotal/total. 0 if none."
    },
    tax: {
      type: Type.NUMBER,
      description: "Government sales tax / GST / VAT only. Sum multiple tax lines (e.g. CGST + SGST) into this single value. Do not include service charges here."
    },
    tip: {
      type: Type.NUMBER,
      description: "ONLY a voluntary tip actually charged and included in the total. Do NOT extract a number from a 'suggested tip' chart (e.g. 15%/20%/25% options) — those are suggestions, not charges. 0 if no tip was actually added."
    },
    total: {
      type: Type.NUMBER,
      description: "Grand total exactly as printed on the receipt."
    }
  },
  required: ["currency", "items", "itemsSubtotal", "discount", "serviceCharge", "tax", "tip", "total"]
};

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json();
    if (!image) {
      return NextResponse.json({ error: "Missing image data" }, { status: 400 });
    }

    // Strip possible data URI prefix
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    // Authenticate with Google Cloud using service account JSON
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!credentialsJson) {
      return NextResponse.json({ error: "Google application credentials not configured" }, { status: 500 });
    }
    const auth = new GoogleAuth({
      credentials: JSON.parse(credentialsJson),
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const accessToken = tokenResponse.token;
    if (!accessToken) {
      return NextResponse.json({ error: "Failed to obtain Google access token" }, { status: 500 });
    }

    // Call Vision API for OCR
    const visionUrl = "https://vision.googleapis.com/v1/images:annotate";
    const visionResponse = await fetch(visionUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests: [{
          image: { content: base64Data },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
        }]
      })
    });
    if (!visionResponse.ok) {
      const err = await visionResponse.text();
      return NextResponse.json({ error: `Google Vision API error: ${err}` }, { status: visionResponse.status });
    }
    const visionResult = await visionResponse.json();
    const rawText = visionResult.responses?.[0]?.fullTextAnnotation?.text;
    if (!rawText) {
      return NextResponse.json({ error: "No text detected in image." }, { status: 422 });
    }

    // Prompt Gemini to parse receipt
    const systemPrompt = `You are a receipt‑parsing engine. Convert the raw OCR text of a receipt into strict JSON matching the schema below. Return ONLY the JSON object – no markdown, no explanation.\n\n${JSON.stringify(receiptSchema, null, 2)}`;
    const userPrompt = `Raw OCR receipt text:\n${rawText}`;

    const geminiResponse = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: [systemPrompt, userPrompt],
      config: {
        responseMimeType: "application/json",
        responseSchema: receiptSchema,
        temperature: 0.0
      }
    });

    const parsedJson = geminiResponse.text;
    if (!parsedJson) {
      return NextResponse.json({ error: "Gemini did not return any content." }, { status: 500 });
    }

    let structuredData;
    try {
      structuredData = JSON.parse(parsedJson);
    } catch {
      return NextResponse.json({ error: "Failed to parse Gemini JSON response.", raw: parsedJson }, { status: 500 });
    }

    return NextResponse.json({ rawText, structuredData });
  } catch (err: unknown) {
    console.error("OCR route error:", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
