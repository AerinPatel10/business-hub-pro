
-- =====================================================
-- ROLES
-- =====================================================
create type public.app_role as enum ('admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null default 'admin',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users can view their own roles"
  on public.user_roles for select to authenticated
  using (user_id = auth.uid());

-- =====================================================
-- PROFILES
-- =====================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  business_name text,
  gstin text,
  phone text,
  address text,
  state text,
  low_stock_threshold int not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Admins manage all profiles"
  on public.profiles for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile + admin role on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  insert into public.user_roles (user_id, role)
  values (new.id, 'admin');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- generic updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- =====================================================
-- CATEGORIES
-- =====================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  owner_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_categories_owner on public.categories(owner_id);
alter table public.categories enable row level security;
create policy "Admins manage categories"
  on public.categories for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- PRODUCTS
-- =====================================================
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  hsn_code text,
  category_id uuid references public.categories(id) on delete set null,
  price numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0,
  stock numeric(12,2) not null default 0,
  unit text not null default 'pcs',
  gst_rate numeric(5,2) not null default 18,
  low_stock_threshold numeric(12,2) not null default 5,
  is_active boolean not null default true,
  owner_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_products_owner on public.products(owner_id);
create index idx_products_category on public.products(category_id);
create index idx_products_name on public.products(name);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
alter table public.products enable row level security;
create policy "Admins manage products"
  on public.products for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- PARTIES (customers/suppliers)
-- =====================================================
create type public.party_type as enum ('customer', 'supplier');

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type party_type not null default 'customer',
  phone text,
  email text,
  address text,
  gstin text,
  state text,
  opening_balance numeric(12,2) not null default 0,
  owner_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_parties_owner on public.parties(owner_id);
create index idx_parties_phone on public.parties(phone);
create trigger parties_touch before update on public.parties
  for each row execute function public.touch_updated_at();
alter table public.parties enable row level security;
create policy "Admins manage parties"
  on public.parties for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- ORDERS
-- =====================================================
create type public.order_status as enum ('send', 'processing', 'dispatch', 'sell', 'done', 'cancelled');
create type public.payment_status as enum ('unpaid', 'partial', 'paid');
create type public.order_type as enum ('sale', 'purchase');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  order_type order_type not null default 'sale',
  party_id uuid references public.parties(id) on delete set null,
  party_name text,
  party_gstin text,
  party_state text,
  invoice_date date not null default current_date,
  due_date date,
  is_interstate boolean not null default false,
  subtotal numeric(12,2) not null default 0,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  igst numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  status order_status not null default 'send',
  payment_status payment_status not null default 'unpaid',
  cancel_reason text,
  notes text,
  owner_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_orders_owner on public.orders(owner_id);
create index idx_orders_party on public.orders(party_id);
create index idx_orders_status on public.orders(status);
create index idx_orders_date on public.orders(invoice_date desc);
create unique index idx_orders_owner_invoice on public.orders(owner_id, invoice_number);
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();
alter table public.orders enable row level security;
create policy "Admins manage orders"
  on public.orders for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- ORDER ITEMS
-- =====================================================
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  hsn_code text,
  quantity numeric(12,2) not null default 1,
  unit text not null default 'pcs',
  price numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  gst_rate numeric(5,2) not null default 18,
  taxable_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);
create index idx_order_items_order on public.order_items(order_id);
create index idx_order_items_product on public.order_items(product_id);
alter table public.order_items enable row level security;
create policy "Admins manage order_items"
  on public.order_items for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Auto stock-decrement / restore when items change
create or replace function public.adjust_stock_on_item_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ord_type order_type;
begin
  if (tg_op = 'INSERT') then
    select order_type into ord_type from public.orders where id = new.order_id;
    if new.product_id is not null then
      if ord_type = 'sale' then
        update public.products set stock = stock - new.quantity where id = new.product_id;
      else
        update public.products set stock = stock + new.quantity where id = new.product_id;
      end if;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    select order_type into ord_type from public.orders where id = old.order_id;
    if old.product_id is not null then
      if ord_type = 'sale' then
        update public.products set stock = stock + old.quantity where id = old.product_id;
      else
        update public.products set stock = stock - old.quantity where id = old.product_id;
      end if;
    end if;
    return old;
  end if;
  return null;
end;
$$;
create trigger order_items_stock
  after insert or delete on public.order_items
  for each row execute function public.adjust_stock_on_item_change();

-- =====================================================
-- TRANSACTIONS (Udhar/Jama ledger)
-- =====================================================
create type public.txn_type as enum ('credit', 'debit'); -- credit = jama (received), debit = udhar (given)

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.parties(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  type txn_type not null,
  amount numeric(12,2) not null default 0,
  payment_method text,
  txn_date date not null default current_date,
  reminder_date date,
  notes text,
  owner_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_txn_owner on public.transactions(owner_id);
create index idx_txn_party on public.transactions(party_id);
create index idx_txn_date on public.transactions(txn_date desc);
create index idx_txn_reminder on public.transactions(reminder_date);
alter table public.transactions enable row level security;
create policy "Admins manage transactions"
  on public.transactions for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- EXPENSES
-- =====================================================
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  amount numeric(12,2) not null default 0,
  expense_date date not null default current_date,
  payment_method text,
  notes text,
  owner_id uuid references auth.users(id) on delete cascade not null default auth.uid(),
  created_at timestamptz not null default now()
);
create index idx_expenses_owner on public.expenses(owner_id);
create index idx_expenses_date on public.expenses(expense_date desc);
alter table public.expenses enable row level security;
create policy "Admins manage expenses"
  on public.expenses for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- APP SETTINGS (one row per owner)
-- =====================================================
create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete cascade not null default auth.uid() unique,
  invoice_prefix text not null default 'INV-',
  next_invoice_number int not null default 1,
  default_gst_rate numeric(5,2) not null default 18,
  terms_and_conditions text,
  signature_text text,
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_updated_at();
alter table public.app_settings enable row level security;
create policy "Admins manage app_settings"
  on public.app_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- REALTIME
-- =====================================================
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.transactions;
