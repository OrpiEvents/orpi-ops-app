import { createClient } from '@/lib/supabaseServer';
import OverheadsClient from './OverheadsClient';

export default async function OverheadsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <OverheadsClient userEmail={user?.email} />;
}
