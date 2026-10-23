-- Growth system schema — the record of what's applied to ORPI's Supabase
-- project (applied as migrations on 23 Oct 2026; kept here so the repo shows
-- the whole picture). Re-running is safe: everything is "if not exists" /
-- "create or replace".
--
-- Access model: every growth table has row-level security ON and NO policies,
-- so neither the public anon key nor a signed-in browser can read or write
-- them. Only the app's API routes can, using the service-role key, after
-- checking the caller's role (lib/apiAuth.js).

-- Role from the signed-in user's JWT. Mirrors lib/roles.js roleOf().
create or replace function public.orpi_role()
returns text language sql stable set search_path = '' as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''),
    case when lower(auth.jwt() ->> 'email') = any (array['rudhra@orpi.events']) then 'director' else 'none' end
  )
$$;

-- Read-only check used by the Team page before it creates a marketing login.
create or replace function public.orpi_security_status()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'app_state_director_only',
      not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'app_state' and coalesce(qual, with_check, '') not ilike '%orpi_role%')
      and exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'app_state'),
    'activity_log_director_only',
      not exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'activity_log' and coalesce(qual, with_check, '') not ilike '%orpi_role%')
  )
$$;
revoke execute on function public.orpi_security_status() from public, anon, authenticated;
grant execute on function public.orpi_security_status() to service_role;

create table if not exists public.growth_links (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,59}$'),
  label text not null, base_url text not null, destination text not null, placement text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  content_page_id text, created_by text, created_at timestamptz not null default now(),
  archived boolean not null default false
);
create table if not exists public.growth_clicks (
  id bigint generated always as identity primary key,
  slug text not null references public.growth_links(slug) on delete cascade,
  at timestamptz not null default now(), referrer_host text, device text, country text,
  bot boolean not null default false
);
create index if not exists growth_clicks_slug_at on public.growth_clicks (slug, at);
create index if not exists growth_clicks_at on public.growth_clicks (at);

create table if not exists public.growth_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('form_view','form_start','form_submit','form_error')),
  page text, link_slug text, utm_source text, utm_medium text, utm_campaign text, utm_content text,
  ip_hash text
);
create index if not exists growth_events_at on public.growth_events (at);
create index if not exists growth_events_ip on public.growth_events (ip_hash, at);

create table if not exists public.growth_leads (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  notion_page_id text unique, channel text, heard_about text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  link_slug text, landing_page text, referrer_host text,
  fbclid text, fbc text, fbp text, consent_ads boolean not null default false, marketing_ok boolean,
  event_date date, event_type text, guest_count int, months_ahead numeric(5,1), capi_status text,
  meta_lead_id text unique, meta_ad_id text, meta_form_id text, raw jsonb,
  email_hash text
);
create index if not exists growth_leads_created on public.growth_leads (created_at);
create index if not exists growth_leads_email_hash on public.growth_leads (email_hash, created_at);

create table if not exists public.ig_daily (
  day date primary key, followers int, reach int, views int, profile_views int, website_clicks int,
  profile_links_taps int, accounts_engaged int, total_interactions int, likes int, comments int,
  shares int, saves int, raw jsonb, synced_at timestamptz not null default now()
);
create table if not exists public.ig_media (
  media_id text primary key, posted_at timestamptz, media_type text, product_type text, caption text,
  permalink text, thumbnail_url text, views int, reach int, likes int, comments int, saved int,
  shares int, total_interactions int, profile_visits int, follows int, content_page_id text,
  raw jsonb, synced_at timestamptz not null default now()
);
create index if not exists ig_media_posted on public.ig_media (posted_at);

create table if not exists public.ads_daily (
  day date not null, ad_id text not null, ad_name text, adset_id text, adset_name text,
  campaign_id text, campaign_name text, objective text, spend numeric(10,2), impressions int,
  reach int, frequency numeric(6,2), clicks int, link_clicks int, leads int, messages int,
  profile_visits int, raw jsonb, synced_at timestamptz not null default now(),
  primary key (day, ad_id)
);
create index if not exists ads_daily_campaign on public.ads_daily (campaign_id, day);

create table if not exists public.growth_sync_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(), job text not null, ok boolean not null, detail text
);
create table if not exists public.growth_touches (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(), enquiry_id text not null, touch_key text not null,
  action text not null check (action in ('sent','skipped','snoozed')), snooze_until date,
  by_email text, note text
);
create index if not exists growth_touches_enquiry on public.growth_touches (enquiry_id, touch_key);
create table if not exists public.pipeline_status_log (
  id bigint generated always as identity primary key,
  enquiry_id text not null, status text not null, at timestamptz not null default now(),
  months_to_event numeric(5,1)
);
create index if not exists pipeline_status_log_enquiry on public.pipeline_status_log (enquiry_id, at);

alter table public.growth_links enable row level security;
alter table public.growth_clicks enable row level security;
alter table public.growth_events enable row level security;
alter table public.growth_leads enable row level security;
alter table public.ig_daily enable row level security;
alter table public.ig_media enable row level security;
alter table public.ads_daily enable row level security;
alter table public.growth_sync_log enable row level security;
alter table public.growth_touches enable row level security;
alter table public.pipeline_status_log enable row level security;
