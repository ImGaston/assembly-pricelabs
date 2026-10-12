-- Migration 005: Dashboard manager — per-client beta variant + managed (isolated) dashboards.
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.
--
--   clients.dashboard_variant  'stable' | 'beta' — flips a client's existing link to the beta variant.
--   dashboards                 Isolated dashboards created from /admin. Each has its own slug + token.
--                              client_id set   → renders that client's real data under the new link.
--                              client_id null  → renders mock data for demo_listings.
--
-- RLS is enabled with no policies: only the service-role key (server-side) can read/write.

alter table clients add column if not exists dashboard_variant text not null default 'stable';

do $$ begin
  alter table clients add constraint clients_dashboard_variant_check
    check (dashboard_variant in ('stable', 'beta'));
exception when duplicate_object then null; end $$;

create table if not exists dashboards (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  name          text not null,
  market        text,
  client_id     uuid references clients(id) on delete set null,
  demo_listings jsonb not null default '[]'::jsonb,
  variant       text not null default 'beta' check (variant in ('stable', 'beta')),
  token         text not null default encode(gen_random_bytes(24), 'hex'),
  enabled       boolean not null default true,
  expires_at    timestamptz,
  notes         text,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table dashboards enable row level security;

create or replace function dashboards_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace trigger dashboards_touch_updated_at before update on dashboards
  for each row execute function dashboards_touch_updated_at();

-- Verification
select column_name, data_type from information_schema.columns
where table_name = 'dashboards' order by ordinal_position;
