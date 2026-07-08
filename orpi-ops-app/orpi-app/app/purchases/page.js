import { createClient } from '@/lib/supabaseServer';
import PurchasesClient from './PurchasesClient';

export default async function PurchasesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <PurchasesClient userEmail={user?.email} />;
}
