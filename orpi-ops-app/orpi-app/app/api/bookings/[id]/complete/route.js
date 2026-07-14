import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getBookingById, updateBooking, listBookingCosts, listDrinks } from '@/lib/notion';
import { eventCompletionGates } from '@/lib/gates';
import { logActivity } from '@/lib/activityLog';

// POST /api/bookings/[id]/complete
// Marks a booking's Status → "Completed" but only if every completion gate
// passes. Gates are checked server-side too — the UI disabling the button
// is just a convenience, this is where the real enforcement lives.
export async function POST(_request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const [booking, costs, drinksLibrary] = await Promise.all([
      getBookingById(params.id),
      listBookingCosts(params.id),
      listDrinks(),
    ]);

    const gates = eventCompletionGates(booking, costs, { drinksLibrary });
    if (gates.length) {
      return NextResponse.json({
        error: 'Cannot mark completed — outstanding items must be resolved first.',
        gates,
      }, { status: 400 });
    }

    const updated = await updateBooking(params.id, { status: 'Completed' });
    await logActivity({
      userEmail: user.email,
      action: 'booking.complete',
      target: updated.name,
    });
    return NextResponse.json({ booking: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
