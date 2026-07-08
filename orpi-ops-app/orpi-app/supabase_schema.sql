-- Run this once in your Supabase project's SQL Editor
-- (Project -> SQL Editor -> New query -> paste -> Run)

create table if not exists activity_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_email text not null,
  action text not null,        -- e.g. 'enquiry.create', 'booking.update'
  target text,                 -- human-readable record name, e.g. client name
  detail text                  -- optional extra context (e.g. which fields changed)
);

-- Row-level security: signed-in users can read the log (so the Activity page
-- works), but only the server (using the service_role key) can write to it.
alter table activity_log enable row level security;

create policy "Authenticated users can read activity log"
  on activity_log for select
  to authenticated
  using (true);

-- No insert policy for regular users is defined on purpose — all writes go
-- through the service_role key from our API routes (lib/activityLog.js),
-- which bypasses RLS. This stops anyone from writing fake log entries
-- directly from the browser.
