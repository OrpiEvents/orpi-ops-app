import { createClient } from '@/lib/supabaseServer';
import { getBookingById, listBookingCosts, listDrinks, resolveMenu, listInventoryItems, suggestStockForDrinks, suggestStandardServiceStock } from '@/lib/notion';
import ChecklistClient from './ChecklistClient';

export default async function ChecklistPage({ params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let booking = null, costs = [], cocktails = [], mocktails = [], stockItems = [];
  let cocktailStock = [], serviceStock = [], error = null;
  try {
    booking = await getBookingById(params.id);
    const [drinksLibrary, allStock] = await Promise.all([listDrinks(), listInventoryItems()]);
    stockItems = allStock;
    [costs, cocktails, mocktails] = await Promise.all([
      listBookingCosts(params.id),
      resolveMenu(booking.cocktailMenu, drinksLibrary, booking.cocktailRecipeOverrides),
      resolveMenu(booking.mocktailMenu, drinksLibrary, booking.mocktailRecipeOverrides),
    ]);
    const providesAlcohol = booking.alcoholProvidedBy === 'ORPI';
    if (providesAlcohol) {
      cocktailStock = suggestStockForDrinks([...cocktails, ...mocktails], stockItems);
      serviceStock = suggestStandardServiceStock(booking, stockItems);
      // Deduplicate service stock against cocktail stock (an item shown in
      // both lists would double-count). Cocktail wins because it's more
      // specific — e.g. if Absolut is in a cocktail recipe AND the spirits
      // selection, it stays with cocktails.
      const cocktailIds = new Set(cocktailStock.map(s => s.id));
      serviceStock = serviceStock.filter(s => !cocktailIds.has(s.id));
    }
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
      cocktailStock={cocktailStock}
      serviceStock={serviceStock}
      error={error}
    />
  );
}
