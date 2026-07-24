-- Add a sparse paid_status map to each bill.
-- Structure: { [friendId: string]: boolean }
-- Defaults to {} (everyone unpaid).
-- Updated via a targeted PATCH that merges a single key — never overwrites the
-- whole bill blob, keeping concurrent updates safe at this feature's stakes.

alter table public.bills
  add column if not exists paid_status jsonb not null default '{}';
