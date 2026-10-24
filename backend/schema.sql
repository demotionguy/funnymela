-- ==============================================================================
-- FunnyMela Supabase Database Schema
-- ==============================================================================
-- Instructions:
-- 1. Go to your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project -> Click on "SQL Editor" on the left menu.
-- 3. Click "New Query", paste this entire script, and click "RUN" (or Ctrl+Enter).
-- ==============================================================================

-- 1. Orders Table: Tracks all Razorpay checkout sessions (Store items & Donations)
create table if not exists orders (
  order_id text primary key,
  uid text not null,
  item text not null,
  name text,
  amount integer not null,
  status text default 'created',
  created_at timestamptz default now()
);

-- 2. Entitlements Table: User inventory (skins, bikes, passes, shields, slows)
create table if not exists ent (
  uid text not null,
  item text not null,
  qty integer default 0,
  primary key (uid, item)
);

-- 3. Donations Table: Permanent record of donations for the 3D Mela Donation Pole
create table if not exists donations (
  id bigserial primary key,
  name text not null,
  amount integer not null,
  uid text,
  ts timestamptz default now()
);

-- 4. Events Table: Anonymous gameplay analytics, shop sales, feedback, and telemetry
create table if not exists events (
  id bigserial primary key,
  ev text,
  sid text,
  name text,
  item text,
  shop text,
  price numeric,
  type text,
  gender text,
  ts bigint default (extract(epoch from now()) * 1000)::bigint
);

-- Indexes for lightning fast queries & leaderboard ranking
create index if not exists idx_orders_uid on orders(uid);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_donations_id on donations(id desc);
create index if not exists idx_events_ts on events(ts desc);

-- ==============================================================================
-- Security: Row Level Security (RLS)
-- ==============================================================================
-- Row Level Security is enabled with NO public policies.
-- This guarantees that the public browser CANNOT tamper with or query tables directly.
-- Only your FunnyMela backend server using the secret SUPABASE_SERVICE_KEY has access.
alter table orders enable row level security;
alter table ent enable row level security;
alter table donations enable row level security;
alter table events enable row level security;
