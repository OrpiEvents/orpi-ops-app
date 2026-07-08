import { createClient } from '@/lib/supabaseServer';
import { getBookingById, listBookingCosts, listDrinks, resolveMenu } from '@/lib/notion';
import ChecklistClient from './ChecklistClient';

export default async function ChecklistPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let booking = null, costs = [], cocktails = [], mocktails = [], error = null;
  try {
    booking = await getBookingById(params.id);
    const drinksLibrary = await listDrinks();
    [costs, cocktails, mocktails] = await Promise.all([
      listBookingCosts(params.id),
      resolveMenu(booking.cocktailMenu, drinksLibrary),
      resolveMenu(booking.mocktailMenu, drinksLibrary),
    ]);
  } catch (err) {
    error = err.message;
  }

  return (
    <ChecklistClient
      userEmail={user?.email}
      booking={booking}
      costs={costs}
      cocktails={cocktails}
      mocktails={mocktails}
      error={error}
    />
  );
}
