import { createClient } from '@/lib/supabaseServer';
import QuoteClient from './QuoteClient';

export default async function QuotesPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <QuoteClient userEmail={user?.email} />;
}
