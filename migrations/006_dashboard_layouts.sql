-- Migration 006: dashboard models (layouts).
--
-- Run in the Supabase SQL editor. Idempotent: safe to re-run. Additive only.
--
-- `layout` is a key from the code registry in lib/layouts/index.js (e.g. 'standard').
-- No check constraint on purpose: models are added in code; an unknown key renders 'standard'.

alter table clients    add column if not exists dashboard_layout text not null default 'standard';
alter table dashboards add column if not exists layout           text not null default 'standard';

-- Verification
select
  (select count(*) from clients where dashboard_layout = 'standard') as clients_standard,
  (select count(*) from dashboards where layout = 'standard')        as dashboards_standard;
