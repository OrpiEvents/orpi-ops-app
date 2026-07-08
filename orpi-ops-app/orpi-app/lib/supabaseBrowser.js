'use client';
import { createBrowserClient } from '@supabase/ssr';

// Browser-side Supabase client — used only in Client Components (e.g. the
// login form). Talks to Supabase Auth directly to sign in/out; never touches
// Notion or the service_role key.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
