import { createClient } from './supabaseServer';
import { roleOf } from './roles';

// For server pages: who's looking, and their role.
export async function currentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { email: user?.email || '', role: roleOf(user), id: user?.id || '' };
}
