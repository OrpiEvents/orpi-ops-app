import { createClient } from '@/lib/supabaseServer';
import BookingsClient from './BookingsClient';

export default async function BookingsPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <BookingsClient userEmail={user?.email} />;
}
