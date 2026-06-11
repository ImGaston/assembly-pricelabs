-- Add an automatically generated Assembly embed URL to every client.
--
-- Run this migration in the Supabase SQL editor. The value updates
-- automatically if the client ID or dashboard token changes.

alter table clients
add column if not exists dashboard_url text
generated always as (
  'https://assembly-pricelabs.vercel.app/api/dashboard/'
  || id::text
  || '?token='
  || dashboard_token
) stored;

comment on column clients.dashboard_url is
  'Private Assembly iframe URL generated from the client UUID and dashboard token.';

-- Verification
select id, name, dashboard_url
from clients
where dashboard_token is not null
order by name;
