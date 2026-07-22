const BILL_ID_LENGTH = 8;

export interface StoredBill {
  id: string;
  bill: unknown;
  createdAt: string;
}

interface SupabaseBillRow {
  share_id: string;
  bill: unknown;
  created_at: string;
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("Supabase is not configured. Add SUPABASE_URL and SUPABASE_SECRET_KEY.");
  }

  return { url: url.replace(/\/$/, ""), secretKey };
}

function newShareId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, BILL_ID_LENGTH);
}

function headers(secretKey: string) {
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json",
  };
}

function toStoredBill(row: SupabaseBillRow): StoredBill {
  return { id: row.share_id, bill: row.bill, createdAt: row.created_at };
}

export async function createBill(bill: unknown): Promise<StoredBill> {
  const { url, secretKey } = getSupabaseConfig();

  // Collisions are extraordinarily unlikely, but retrying makes the short ID safe.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shareId = newShareId();
    const response = await fetch(`${url}/rest/v1/bills`, {
      method: "POST",
      headers: { ...headers(secretKey), Prefer: "return=representation" },
      body: JSON.stringify({ share_id: shareId, bill }),
      cache: "no-store",
    });

    if (response.ok) {
      const [row] = (await response.json()) as SupabaseBillRow[];
      if (!row) throw new Error("Supabase did not return the created bill.");
      return toStoredBill(row);
    }

    const body = await response.text();
    if (response.status === 409 || body.includes("23505")) continue;
    throw new Error(`Unable to save bill: ${body}`);
  }

  throw new Error("Unable to generate a unique share ID. Please try again.");
}

export async function getBill(shareId: string): Promise<StoredBill | null> {
  const { url, secretKey } = getSupabaseConfig();
  const response = await fetch(
    `${url}/rest/v1/bills?share_id=eq.${encodeURIComponent(shareId)}&select=share_id,bill,created_at`,
    { headers: headers(secretKey), cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Unable to load bill: ${await response.text()}`);
  }

  const [row] = (await response.json()) as SupabaseBillRow[];
  return row ? toStoredBill(row) : null;
}
