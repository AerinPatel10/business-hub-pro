## 1. Fix duplicate entries in Reports

The "Sales" tab currently shows one row per line-item, so an invoice with 2 products shows 2 rows. Change it to show one row per invoice (with item count + product names summarized), and keep an optional "show line items" expand toggle. The Statement tab will also be cleaned up so each invoice + each payment shows exactly once with correct Dr/Cr sides (Invoice = Dr, Payment Received = Cr — never both as Dr).

## 2. Menu: add Expense and Purchase

Add two new menu entries in `AppShell` between "Parties" and "Reports":
- **Expense** (already has a page — wire it into the sidebar menu)
- **Purchase** (new module)

## 3. Expense — keep simple

Use the existing `expenses` table. Form captures: Amount, Description (notes), Date, Payment method, Category. List shows all expenses with total. Already mostly built; add Description field prominence and a monthly total tile.

## 4. Purchase — mirror Sales

Reuse the existing `orders` schema with a new `order_type = "purchase"`. (Schema already has the enum extensible — we'll add it via migration.) Pages:
- `/purchases` — list (like Invoices)
- `/purchases/new` — same form as InvoiceNew but for supplier parties, increases stock instead of decreasing
- `/purchases/:id` — detail view
Supplier parties already exist (`type = supplier`).

## 5. Ledger: Opening Balance

In `Ledger.tsx`, include each party's `opening_balance` in both Invoice and Estimate summaries — show as the starting balance, and include it in the displayed "Due" / total figures. In `LedgerDetail` statement, the Invoice statement already shows OPENING BALANCE; we'll add the same row to the Estimate statement.

## 6. Balance Sheet — two views

New menu entry "Balance Sheet" with two tabs:

**(a) Summary** — quick snapshot:
```
Assets                          Liabilities
  Cash in hand    xxxx           Sundry Creditors  xxxx
  Bank           xxxx            Capital            xxxx
  Sundry Debtors xxxx
  Closing Stock  xxxx
  ─────────────                  ─────────────
  Total          xxxx            Total             xxxx
```

**(b) Complete (Tally-style)** — full grouped balance sheet:
```
LIABILITIES                    Amount    ASSETS                     Amount
  Capital Account                          Fixed Assets
  Loans (Liability)                        Investments
  Current Liabilities                      Current Assets
    Sundry Creditors                         Sundry Debtors
    Duties & Taxes (GST)                     Closing Stock
    Provisions                               Cash-in-Hand
                                             Bank Accounts
  Profit & Loss A/c                        Profit & Loss A/c (if loss)
  ────────────────────────────             ────────────────────────────
  Total                                    Total
```

Computed from:
- Sundry Debtors = sum of (customer party totals − payments + opening_balance)
- Sundry Creditors = sum of (supplier purchases − payments paid + opening_balance)
- Closing Stock = Σ(product.stock × product.cost)
- Duties & Taxes = GST output collected − GST input paid
- Cash/Bank derived from transactions grouped by payment_method
- P&L = Sales − Purchases − Expenses

Includes "Download PDF" using jsPDF + autoTable in the same two-column Tally format.

## Technical changes

- New migration: extend `order_type` enum to include `"purchase"`.
- New routes in `App.tsx`: `/expenses`, `/purchases`, `/purchases/new`, `/purchases/:id`, `/purchases/:id/edit`, `/balance-sheet`.
- New page files: `Purchases.tsx`, `PurchaseNew.tsx` (or reuse InvoiceNew with `mode="purchase"`), `BalanceSheet.tsx`.
- Update `AppShell.tsx` menu.
- Update `Reports.tsx` Sales tab grouping logic.
- Update `Ledger.tsx` to include opening balance.

## Notes

This is a large change spanning ~8 files plus 1 migration. The Balance Sheet figures will be best-effort based on available data — without a separate ledger of bank/cash accounts, cash & bank are inferred from `transactions.payment_method`. If you want a dedicated Cash/Bank accounts table later, we can add it.

Confirm and I'll implement.