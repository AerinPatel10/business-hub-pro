# Two Accounts, One App — Full Data Isolation

Right now only orders are split by `order_type`. Parties, expenses, purchases, transactions, balance sheet, reports all mix data between the Invoice and Estimate accounts. This plan makes the two accounts behave like two independent ledgers that share the same login.

## Approach

Add a single `account_mode` column (`'invoice' | 'estimate'`) to every user-owned table so each row belongs to exactly one account. The active mode (from `AccountModeContext`) is written on every insert and used as a filter on every read.

## Schema changes (migration)

Add column `account_mode text not null default 'invoice'` (check constraint: invoice | estimate) to:

- `parties`
- `products`
- `orders`            (in addition to existing `order_type`)
- `order_items`       (denormalized for fast filtering)
- `transactions`
- `expenses`
- `categories`

Backfill: all existing rows → `'invoice'`.
Index `(owner_id, account_mode)` on each table.

## Code changes

1. **`AppDataContext`** — accept current `mode`, filter every `select` by `account_mode=mode`. Re-fetch when mode changes. Realtime channel resubscribes per mode.
2. **All insert paths** — stamp `account_mode: mode` on create:
   - Parties (`PartyForm`)
   - Products (`Inventory`)
   - Invoice / Estimate / Purchase create (`InvoiceNew`, `Purchases/new`)
   - Expenses
   - Transactions (payments, ledger adjustments)
3. **Mode-aware navigation labels** — sidebar shows "Invoice Purchases / Invoice Expenses / Invoice Balance Sheet" vs the estimate equivalents, so the user always knows which account they're inside.
4. **Pages already using `useAppData`** (Dashboard, Reports, Ledger, BalanceSheet, Purchases, Expenses, Parties, Inventory, Invoices, Estimates) auto-filter because the context returns only the active account's data. Light cleanup to remove now-redundant `order_type` mixing where it doubled rows.
5. **Switching accounts** triggers a context refresh so the whole UI swaps instantly — no page-reload, no stale rows.

## Out of scope

- No change to invoice PDF layout, auth, or RLS policies beyond adding the column.
- Profile / app_settings stay shared (single business identity, GSTIN, logo).

## Technical notes

- `account_mode` lives alongside `order_type`: `order_type` still distinguishes sale vs estimate vs purchase *within* an account (so the Invoice account can have both sales and purchases).
- Migration is additive and safe; existing data lands in the Invoice account, matching the user's current mental model.
