import { createClient } from '@/lib/supabaseServer';
import EnquiriesClient from './EnquiriesClient';

export default async function EnquiriesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <EnquiriesClient userEmail={user?.email} />;
}
