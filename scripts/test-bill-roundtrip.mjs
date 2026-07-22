import assert from "node:assert/strict";

const baseUrl = process.env.BILL_API_URL ?? "http://localhost:3000";
const bill = {
  items: [{ id: "test-item", name: "Round-trip chai", qty: 1, price: 4.5 }],
  friends: [{ id: "test-friend", name: "Test Friend" }],
  assignments: { "test-item": ["test-friend"] },
  charges: { tax: 0.45, tip: 0, serviceCharge: 0, discount: 0 },
  payeeName: "Test Collector",
  payeeUpiId: "test@upi",
  computedTotals: [{ friendId: "test-friend", total: 4.95 }],
};

const createResponse = await fetch(`${baseUrl}/api/bills`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ bill }),
});

// 1. Read the text once upfront to safe-keep it
const createResText = await createResponse.text();
assert.equal(createResponse.status, 201, createResText);

// 2. Parse the text variable as JSON instead of calling .json()
const created = JSON.parse(createResText);
assert.match(created.id, /^[a-f0-9]{8}$/);

const readResponse = await fetch(`${baseUrl}/api/bills/${created.id}`);

// 3. Do the same safety check for the read operation
const readResText = await readResponse.text();
assert.equal(readResponse.status, 200, readResText);

const read = JSON.parse(readResText);
assert.deepEqual(read.bill, bill);

console.log(`\n🎉 Round-trip passed perfectly for share ID: ${created.id}`);