ALTER TABLE public.parties
  ADD COLUMN IF NOT EXISTS opening_balance_estimate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_balance_estimate_date date;
