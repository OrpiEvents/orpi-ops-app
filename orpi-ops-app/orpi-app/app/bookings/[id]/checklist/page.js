import { createClient } from '@/lib/supabaseServer';
import { getBookingById, listBookingCosts, listDrinks, resolveMenu, listInventoryItems, suggestStockForDrinks } from '@/lib/notion';
import ChecklistClient from './ChecklistClient';

export default async function ChecklistPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let booking = null, costs = [], cocktails = [], mocktails = [], stockItems = [], suggestedStock = [], error = null;
  try {
    booking = await getBookingById(params.id);
    const [drinksLibrary, allStock] = await Promise.all([listDrinks(), listInventoryItems()]);
    stockItems = allStock;
    [costs, cocktails, mocktails] = await Promise.all([
      listBookingCosts(params.id),
      resolveMenu(booking.cocktailMenu, drinksLibrary),
      resolveMenu(booking.mocktailMenu, drinksLibrary),
    ]);
    const providesAlcohol = booking.alcoholProvidedBy === 'ORPI';
    if (providesAlcohol) suggestedStock = suggestStockForDrinks([...cocktails, ...mocktails], stockItems);
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
      stockItems={stockItems}
      suggestedStock={suggestedStock}
      error={error}
    />
  );
}
