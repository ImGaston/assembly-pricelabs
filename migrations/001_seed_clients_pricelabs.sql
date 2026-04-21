-- Migration 001: Seed pricelabs_group and market on clients table from clients.json
--
-- Run order:
--   1. (If not done) ALTER TABLE to add columns
--   2. UPDATE statements per client (matched by id from your Supabase export)
--   3. (Optional) UPDATE listings.name for the 3 historical nameOverrides
--
-- Notes:
--   - Tokens are NOT migrated. Supabase generates one per row via the column default
--     (encode(gen_random_bytes(16), 'hex')). The old CHANGE_ME tokens are discarded.
--   - "Anna Sterna" in clients.json maps to PriceLabs group "Anna" but in Supabase you
--     have two clients (Hayden Haven + Hayden Pike Pines). Both rows are pointed at
--     "Anna" below — adjust if those should be different groups.
--   - Run as-is in the Supabase SQL editor. No transaction wrapper — the editor
--     auto-commits each statement. Idempotent: safe to re-run.

------------------------------------------------------------------------------
-- 1. Schema (idempotent — skip the ones you already added)
------------------------------------------------------------------------------

alter table clients add column if not exists pricelabs_group text;
alter table clients add column if not exists dashboard_token text default encode(gen_random_bytes(16), 'hex');
alter table clients add column if not exists market text;

-- Backfill tokens for any rows that existed before the default was added
update clients set dashboard_token = encode(gen_random_bytes(16), 'hex')
where dashboard_token is null;

------------------------------------------------------------------------------
-- 2. Seed pricelabs_group + market per client
------------------------------------------------------------------------------

update clients set pricelabs_group = 'RevFactor-Grant', market = 'Gatlinburg / Smoky Mountains, TN' where id = '8ab42e9f-e31e-4a0c-a213-785a3c122ebe'; -- Grant Currant
update clients set pricelabs_group = 'Alicia',          market = 'Durham, NY'                          where id = '291b448c-5920-4106-82e5-20ab66319da7'; -- Alicia Amarant
update clients set pricelabs_group = 'Elizabeth',       market = 'North Myrtle Beach, SC'              where id = '856794eb-ee61-4978-baa9-ae12afd25901'; -- Elizabeth Carlson
update clients set pricelabs_group = 'Alisha',          market = 'Norfolk, VA'                         where id = 'b0ec3bdb-3b82-44af-b0d3-a6e586eae304'; -- Alisha Provot
update clients set pricelabs_group = 'Angela',          market = 'Cleveland, GA'                       where id = '897b6f21-006c-4565-88cf-e4a61da17484'; -- Angela Ipollito
update clients set pricelabs_group = 'Carolyn',         market = 'New York'                            where id = 'e79c595f-0ffe-4d40-8445-4581a4ff3298'; -- Carolyn and Paul Baek
update clients set pricelabs_group = 'Cecilia',         market = 'Minneapolis, MN'                     where id = '8c87be33-7a71-4188-a959-7477f53087e2'; -- Cecilia Sirovina
update clients set pricelabs_group = 'Dan',             market = 'Chicago, IL'                         where id = '5a5d98b4-74b5-41a3-8c54-d61178801913'; -- Dan Velez
update clients set pricelabs_group = 'Hillary',         market = 'Venice, FL'                          where id = '4b59aef0-3005-4cf1-b778-7b4732c1eec2'; -- Hillary Hernandez
update clients set pricelabs_group = 'Jacob',           market = 'Denton Township, MI'                 where id = '58fc98f2-469d-45bc-a2a5-196963582189'; -- Jacob Sandoval
update clients set pricelabs_group = 'Kevin',           market = 'Peru, VT'                            where id = '5d367d00-dd51-4952-97a4-a146e260d37a'; -- Kevin King
update clients set pricelabs_group = 'Michael',         market = 'Milwaukee, WI'                       where id = '8d524149-c681-4436-a6b1-7880af13fc9c'; -- Michael Waller
update clients set pricelabs_group = 'Rafael',          market = 'Salt Lake City, UT'                  where id = '8cff1be8-88ff-4afb-b8ad-bb268c20b455'; -- Rafael Moreno
update clients set pricelabs_group = 'Sandy',           market = 'Sarahsville, OH'                     where id = 'b4608f87-7b62-46ec-84e8-dfa8b738359a'; -- Sandy Watson
update clients set pricelabs_group = 'Sarah William',   market = 'Utah / Montana'                      where id = '479fbc86-a202-4b8d-b2f0-a3c2db30739a'; -- Sarah & William Ariza
update clients set pricelabs_group = 'Thea',            market = 'Kentucky / Michigan'                 where id = '88ee47bc-7ac5-44ff-954f-7e8ad1eb687b'; -- Thea Cabanilla (Topaz Stays LLC)
update clients set pricelabs_group = 'Trey',            market = 'Knoxville, TN'                       where id = '5e2250b2-5a47-4191-b750-bbe04babdacc'; -- Trey Yant
update clients set pricelabs_group = 'Lindy',           market = 'Springfield, MO'                     where id = 'ec00ca03-d058-42fc-a174-624cb82a72c6'; -- Lindy Bunch
update clients set pricelabs_group = 'Cynthia',         market = 'Glen Rose, TX'                       where id = 'fdbdf506-5909-432b-9a21-2fd9e5288cdc'; -- Cynthia Aaron Whittaker Little Reds Nest
update clients set pricelabs_group = 'Paulina',         market = 'Sedona, AZ'                          where id = 'd1a7d6a3-09fb-4828-9783-f29808f23b46'; -- Paulina Le
update clients set pricelabs_group = 'Sara',            market = 'Park City, UT / Poconos, PA'         where id = '452a9e29-48e7-460c-9242-3485f1b6891f'; -- Sara Nabozna
update clients set pricelabs_group = 'Zoey',            market = 'Glenwood Springs, CO'                where id = 'ff231cb9-fbd1-4fcb-b63f-668130f99eae'; -- Zoey Berghoff
update clients set pricelabs_group = 'Javeus',          market = 'Dallas / Arlington, TX'              where id = 'cbd32e5a-dc1b-4939-8529-90e6740bbd39'; -- Javeus Boddie
update clients set pricelabs_group = 'Colby',           market = 'Tahoe City, CA'                      where id = '91e772ee-7a82-4889-9b3a-6f57e782d47b'; -- Colby Swearengin
update clients set pricelabs_group = 'Bailey Sivanich', market = 'Stillwater, MN'                      where id = '428d676a-bfd5-4285-81e9-6d5251d33df9'; -- Bailey Sivanich
update clients set pricelabs_group = 'Emilie Cohen',    market = 'San Diego, CA'                       where id = 'd7225ab8-8ed5-439d-ade7-9eeca08528fd'; -- Emilie Cohen
update clients set pricelabs_group = 'Lisa Mosbacher',  market = 'Denver, CO'                          where id = 'aae92026-281d-4c1b-a263-0c60d10d9afd'; -- Lisa Mosbacher
update clients set pricelabs_group = 'Michelle',        market = 'Enumclaw, WA'                        where id = 'cac4b8ea-9894-4929-b1d3-4aa6f1cc9fbb'; -- Michelle Couch
update clients set pricelabs_group = 'Eric Runyan',     market = 'Oxford, WI'                          where id = 'bf77fc0d-b449-4e5d-b616-f482900e928d'; -- Eric & Emily Runyan
update clients set pricelabs_group = 'Dustin Sherbert', market = 'Holmes Beach, FL'                    where id = '8f158071-c8fd-4014-805f-9eaf2dadda40'; -- Dustin Sherbert
update clients set pricelabs_group = 'Erin Warren',     market = 'Tucson, AZ / Orcas, WA'              where id = '218db372-531c-46de-85c6-3bc87860816b'; -- Erin Warren
update clients set pricelabs_group = 'Kimmy Strat',     market = 'Westminster, CO'                     where id = '07aa382e-37f5-47bc-b8ec-df2bfdfdcab3'; -- Kimmy Strat
update clients set pricelabs_group = 'Ali Dowden',      market = 'Lake Geneva, WI'                     where id = '8f07324d-0260-4d4c-81ac-515e26b64eea'; -- Ali Dowden
update clients set pricelabs_group = 'Caitlin Jelen',   market = 'Minneapolis, MN'                     where id = '47280cef-9437-4039-aea4-4a9d416c9f3a'; -- Caitlin Jelen
update clients set pricelabs_group = 'Kelly',           market = 'Kentucky'                            where id = '39276702-8ee4-4915-8fc7-27717711df3f'; -- Kelly Safrit
update clients set pricelabs_group = 'Marlena Outlaw',  market = 'Colorado'                            where id = 'ae721655-4f6e-4c25-af8a-19586c7dc1e9'; -- Marlena Outlaw
update clients set pricelabs_group = 'Sarah Hill',      market = 'Union Pier, MI'                      where id = '392245df-e60b-4e23-87fe-df94ee14d5d1'; -- Sarah Hill
update clients set pricelabs_group = 'Leanne Sutton',   market = 'Carnelian Bay, CA'                   where id = '4c7618e6-6016-4c4c-9051-03ea62b9f716'; -- Leanne Sutton
update clients set pricelabs_group = 'Jared Schoen',    market = 'Battle Creek, MI'                    where id = '36354afe-12f0-49dd-ad56-c33a399c7271'; -- Jared Schoen
update clients set pricelabs_group = 'Tiffany',         market = 'Scottsdale, AZ / Stateline, NV'      where id = '88263c96-e70e-47d2-bfaa-d851ca5c38eb'; -- Tiffany Rice
update clients set pricelabs_group = 'Donald',          market = 'Balsam Lake, WI'                     where id = 'dd88cd09-5ac5-4559-8af6-9a9124f45df9'; -- Don Sterna
update clients set pricelabs_group = 'SBA',             market = 'Multi-market'                        where id = 'e6fd54ce-6c4e-4ebe-bf51-62d27476d141'; -- Second Bridge
update clients set pricelabs_group = 'Kate Henry',      market = 'Gainesville, FL / Dahlonega, GA'     where id = '80c87e49-46aa-413e-b9fe-620a8ebf9486'; -- Kate Henry
update clients set pricelabs_group = 'Josh Burdick',    market = 'Savannah, GA'                        where id = 'e7514425-599e-4cb3-a5cb-46c7ae003661'; -- Josh Burdick
update clients set pricelabs_group = 'Hanan Kim',       market = 'Bradenton, FL'                       where id = '1bac71af-ab19-4499-ae48-a677c03121cb'; -- Hanan Kim
update clients set pricelabs_group = 'Deeanna',         market = 'North Carolina'                      where id = '4266219d-35e6-45b9-bad7-0806c01f5a6c'; -- Deeanna Girard
update clients set pricelabs_group = 'SarahP',          market = 'San Diego, CA'                       where id = '3213c5cc-141e-4070-ae0d-9c675998f906'; -- Sarah Pace
update clients set pricelabs_group = 'Jane',            market = 'California / Pennsylvania'           where id = '928c6614-126b-45e9-b814-5bc1601bce07'; -- Jane Ng (investing mom)
update clients set pricelabs_group = 'Maryssa',         market = 'Albion, MI'                          where id = '2483d668-6a62-4e8b-8078-bc539a3e71ad'; -- Maryssa Payne (Teresa Liscombe)
update clients set pricelabs_group = 'SarahC',          market = 'Clarkson, KY'                        where id = '5961d7a4-5129-408d-bab4-5f5ef6f9c91e'; -- Sarah Clark (Shipp)

-- Anna Sterna: clients.json had ONE entry mapped to group "Anna".
-- In Supabase you have TWO rows. Both pointed at "Anna" — confirm or split:
update clients set pricelabs_group = 'Anna', market = 'Minnesota' where id = 'c91f82a9-7968-4220-bb66-736690e9f83e'; -- Anna Sterna Hayden Haven
update clients set pricelabs_group = 'Anna', market = 'Minnesota' where id = 'e55f6c38-6c55-47bd-944c-dc36c34a5278'; -- Anna Sterna Hayden Pike Pines

------------------------------------------------------------------------------
-- 3. Optional: apply the 3 historical nameOverrides to the listings table.
--    Only run if listings.name currently has the raw PriceLabs name and you
--    want the cleaner display label. Skip if listings.name is already correct.
------------------------------------------------------------------------------

-- Alicia Amarant — The Windvale
update listings set name = 'The Windvale', city = 'Durham', state = 'NY'
where listing_id = '07b4e0ba-b860-4466-95a5-373dbad583d9';

-- Elizabeth Carlson — Surf Street
update listings set name = 'Surf Street'
where listing_id = '8901a0cb-06b9-48d2-b12f-44aa1a01100c';

-- Alisha Provot — The Yellow Door Inn
update listings set name = 'The Yellow Door Inn', city = 'Norfolk', state = 'VA'
where listing_id = 'a73b0509-e911-4095-b022-c90a80d45aca';

------------------------------------------------------------------------------
-- 4. Verification — review before commit
------------------------------------------------------------------------------

select id, name, pricelabs_group, market,
       case when dashboard_token is null then 'MISSING' else 'ok' end as token_status
from clients
where status in ('active', 'onboarding')
order by pricelabs_group nulls first, name;
