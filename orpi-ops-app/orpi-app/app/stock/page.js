import { createClient } from '@/lib/supabaseServer';
import StockClient from './StockClient';

export default async function StockPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <StockClient userEmail={user?.email} />;
}
