import { createClient } from '@/lib/supabaseServer';
import ActivityClient from './ActivityClient';

export default async function ActivityPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <ActivityClient userEmail={user?.email} />;
}
