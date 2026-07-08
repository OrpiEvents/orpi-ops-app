# ORPI Events — Ops App (v3, hosted architecture)

This replaces the artifact-only prototype with a real Next.js app that:
- Talks to the real Notion API from the server (your token never reaches the browser)
- Has individual email/password logins for the team (via Supabase Auth)
- Logs every change to an activity log (who did what, when)

## What's built in this pass
- Login (individual accounts)
- Dashboard (live stats from Notion)
- Enquiries (full CRUD — add, edit, mark won → creates a Confirmed Booking)
- Confirmed Bookings (live, real data — no more sample fallback)
- Activity log (view who changed what)

## What's next (same pattern, following session)
- Quote builder (port from the HTML prototype into a page + PDF export)
- Stock tracker, Stock take, Purchases (port from the HTML prototype)
- Booking detail panel (planning tab, event costs, notes)

## Setup

### 1. Notion
1. Go to notion.so/my-integrations → create a new internal integration → copy the "Internal Integration Secret".
2. Share each of these databases with the integration (••• menu → Connections → add your integration):
   - Sales Pipeline
   - Booking & Quotes Tracker
   - Inventory Items
   - Event Costing

### 2. Supabase (free tier is enough)
1. Create a project at supabase.com.
2. Project Settings → API → copy the Project URL and the `anon` public key, and the `service_role` secret key.
3. SQL Editor → New query → paste the contents of `supabase_schema.sql` → Run.
4. Authentication → Users → Add user, once per team member (Ruds, Rahul, Snehal, Punit, staff). This is how each person gets their own login — there's no public sign-up page, so only accounts you create can sign in.

### 3. Environment variables
Copy `.env.local.example` to `.env.local` and fill in the real values from steps 1–2.

### 4. Run locally
```
npm install
npm run dev
```
Visit http://localhost:3000 — you'll be redirected to /login.

### 5. Deploy to Vercel
1. Push this folder to a GitHub repo.
2. Import the repo in Vercel.
3. Add the same environment variables from `.env.local` in Vercel's Project Settings → Environment Variables.
4. Deploy. You can put this on a subdomain like `ops.orpi.events` alongside your main site.

## Notes
- `lib/notion.js` is the only file that talks to Notion. It runs server-side only.
- `lib/activityLog.js` writes to Supabase using the service_role key — regular users can read the log (via RLS policy) but can't write to it directly, so the audit trail can't be tampered with from the browser.
- Middleware (`middleware.js`) protects every page except `/login`.
