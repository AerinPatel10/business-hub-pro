ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS estimate_prefix text NOT NULL DEFAULT 'EST-',
  ADD COLUMN IF NOT EXISTS next_estimate_number integer NOT NULL DEFAULT 1;