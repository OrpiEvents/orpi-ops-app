import { createClient } from '@/lib/supabaseServer';
import CostingClient from './CostingClient';

export default async function CostingPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <CostingClient userEmail={user?.email} />;
}
