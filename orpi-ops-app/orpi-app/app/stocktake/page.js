import { createClient } from '@/lib/supabaseServer';
import StocktakeClient from './StocktakeClient';

export default async function StocktakePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <StocktakeClient userEmail={user?.email} />;
}
