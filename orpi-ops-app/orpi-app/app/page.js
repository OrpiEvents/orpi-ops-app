import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabaseServer';
import { roleOf, homeFor } from '@/lib/roles';

// Each role lands on its own home: directors on the Dashboard, marketing on
// the Growth workspace.
export default async function RootPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const role = roleOf(user);
  redirect(role === 'none' ? '/login?e=noaccess' : homeFor(role));
}
