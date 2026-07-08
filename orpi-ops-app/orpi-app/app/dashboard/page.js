import { createClient } from '@/lib/supabaseServer';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <DashboardClient userEmail={user?.email} />;
}
