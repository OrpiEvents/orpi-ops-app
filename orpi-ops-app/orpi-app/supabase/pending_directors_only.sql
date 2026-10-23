-- PENDING — waiting for Ruds's OK. Not applied yet.
--
-- Today any signed-in login can read and change everything in app_state
-- (quotes, invoices, overheads, run sheets) and read the activity log, straight
-- from the browser with the public key. This makes both directors-only, so a
-- marketing login (Reeya) can't reach them. Directors notice no difference.
-- The Team page refuses to create a marketing login until this is applied.

drop policy if exists "authenticated can read" on public.app_state;
drop policy if exists "authenticated can insert" on public.app_state;
drop policy if exists "authenticated can update" on public.app_state;

create policy "directors can read" on public.app_state
  for select to authenticated using (public.orpi_role() = 'director');
create policy "directors can insert" on public.app_state
  for insert to authenticated with check (public.orpi_role() = 'director');
create policy "directors can update" on public.app_state
  for update to authenticated using (public.orpi_role() = 'director') with check (public.orpi_role() = 'director');

drop policy if exists "Authenticated users can read activity log" on public.activity_log;
create policy "directors can read activity log" on public.activity_log
  for select to authenticated using (public.orpi_role() = 'director');

-- Make Ruds's director role explicit on his account (instead of relying on the
-- named-address fallback in orpi_role() and lib/roles.js).
update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"director"}'::jsonb
  where email = 'rudhra@orpi.events';
