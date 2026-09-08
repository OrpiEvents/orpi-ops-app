import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabaseServer';
import { getBookingById, listEnquiries } from '@/lib/notion';

// Looks up the enquiry that originated this booking (by client name match)
// and returns the brands the client was quoted, so the Planning tab can
// show a "Populate from quote" review banner.
//
// We match on name because the booking creation flow doesn't currently
// store an explicit enquiry reference on the booking. Name matching is
// case-insensitive and trims whitespace to be forgiving.
export async function GET(_request, { params }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  try {
    const [booking, enquiries] = await Promise.all([
      getBookingById(params.id),
      listEnquiries(),
    ]);
    const clean = (booking.name || booking.clientName || '').trim().toLowerCase();
    const match = enquiries.find(e => e.name.trim().toLowerCase() === clean);
    if (!match) {
      return NextResponse.json({ found: false });
    }
    return NextResponse.json({
      found: true,
      quotedSpirits: match.quotedSpirits || '',
      quotedBeer: match.quotedBeer || '',
      quotedSoftDrinks: match.quotedSoftDrinks || '',
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}
