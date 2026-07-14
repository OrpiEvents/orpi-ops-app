import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { updateBooking, getBookingById, listDrinks } from '@/lib/notion';
import { drinksConfirmationGates } from '@/lib/gates';
import { logActivity } from '@/lib/activityLog';

// Server-side gate: cannot flip cocktailsConfirmed or mocktailsConfirmed to
// true unless every drink named in the corresponding menu exists in the ORPI
// Drinks Library. The UI already prevents this, but so does the backend, so
// the invariant holds even under manual API calls.
export async function PATCH(request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const body = await request.json();

  try {
    const flippingCt = body.cocktailsConfirmed === true;
    const flippingMt = body.mocktailsConfirmed === true;
    if (flippingCt || flippingMt) {
      const [current, drinksLibrary] = await Promise.all([
        getBookingById(params.id),
        listDrinks(),
      ]);
      const cocktailMenu = body.cocktailMenu !== undefined ? body.cocktailMenu : current.cocktailMenu;
      const mocktailMenu = body.mocktailMenu !== undefined ? body.mocktailMenu : current.mocktailMenu;
      const gates = [];
      if (flippingCt) gates.push(...drinksConfirmationGates(cocktailMenu, drinksLibrary, 'Cocktails'));
      if (flippingMt) gates.push(...drinksConfirmationGates(mocktailMenu, drinksLibrary, 'Mocktails'));
      if (gates.length) {
        return NextResponse.json({
          error: 'Cannot confirm — some drinks are missing from the ORPI Drinks Library.',
          gates,
        }, { status: 400 });
      }
    }

    const booking = await updateBooking(params.id, body);
    await logActivity({
      userEmail: user.email,
      action: 'booking.update',
      target: booking.name,
      detail: JSON.stringify(Object.keys(body)),
    });
    return NextResponse.json({ booking });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
